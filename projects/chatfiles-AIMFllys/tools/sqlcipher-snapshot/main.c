#include <windows.h>
#include <fcntl.h>
#include <io.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "sqlite3.h"

#define KEY_BYTES 32
#define RAW_KEY_BYTES 36

static const unsigned char success_magic[8] = {'C', 'F', 'S', 'S', 'N', 'A', 'P', '1'};

static void secure_zero(void *value, size_t length) {
  volatile unsigned char *bytes = (volatile unsigned char *)value;
  while (length-- > 0) *bytes++ = 0;
}

static int fail_with(const char *code, int status) {
  fputs(code, stderr);
  fputc('\n', stderr);
  fflush(stderr);
  return status;
}

static char *wide_to_utf8(const wchar_t *value) {
  int length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value, -1, NULL, 0, NULL, NULL);
  if (length <= 0) return NULL;
  char *result = (char *)malloc((size_t)length);
  if (result == NULL) return NULL;
  if (WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value, -1, result, length, NULL, NULL) <= 0) {
    free(result);
    return NULL;
  }
  return result;
}

static int uri_safe(unsigned char value) {
  return (value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z') ||
         (value >= '0' && value <= '9') || value == '-' || value == '_' || value == '.' ||
         value == '~' || value == '/' || value == ':';
}

static char *readonly_uri(const char *windows_path) {
  static const char prefix[] = "file:///";
  static const char suffix[] = "?readonly_shm=1";
  static const char hex[] = "0123456789ABCDEF";
  size_t input_length = strlen(windows_path);
  size_t capacity = sizeof(prefix) - 1 + input_length * 3 + sizeof(suffix);
  char *result = (char *)malloc(capacity);
  if (result == NULL) return NULL;
  char *cursor = result;
  memcpy(cursor, prefix, sizeof(prefix) - 1);
  cursor += sizeof(prefix) - 1;
  for (size_t index = 0; index < input_length; index++) {
    unsigned char value = (unsigned char)windows_path[index];
    if (value == '\\') value = '/';
    if (uri_safe(value)) {
      *cursor++ = (char)value;
    } else {
      *cursor++ = '%';
      *cursor++ = hex[value >> 4];
      *cursor++ = hex[value & 15];
    }
  }
  memcpy(cursor, suffix, sizeof(suffix));
  return result;
}

static int read_key(unsigned char key[KEY_BYTES]) {
  if (_setmode(_fileno(stdin), _O_BINARY) == -1) return 0;
  size_t received = fread(key, 1, KEY_BYTES, stdin);
  int trailing = fgetc(stdin);
  return received == KEY_BYTES && trailing == EOF && !ferror(stdin);
}

typedef enum destination_reserve_result {
  DESTINATION_RESERVE_OK = 0,
  DESTINATION_RESERVE_EXISTS,
  DESTINATION_RESERVE_FAILED
} destination_reserve_result;

static destination_reserve_result reserve_destination(const wchar_t *path) {
  HANDLE handle = CreateFileW(
      path,
      GENERIC_READ | GENERIC_WRITE,
      0,
      NULL,
      CREATE_NEW,
      FILE_ATTRIBUTE_NORMAL,
      NULL);
  if (handle == INVALID_HANDLE_VALUE) {
    DWORD error = GetLastError();
    return error == ERROR_FILE_EXISTS || error == ERROR_ALREADY_EXISTS
        ? DESTINATION_RESERVE_EXISTS
        : DESTINATION_RESERVE_FAILED;
  }
  return CloseHandle(handle) ? DESTINATION_RESERVE_OK : DESTINATION_RESERVE_FAILED;
}

static int exec_sql(sqlite3 *database, const char *sql) {
  return sqlite3_exec(database, sql, NULL, NULL, NULL) == SQLITE_OK;
}

static int copy_database(sqlite3 *source, sqlite3 *destination, int *step_result, int *finish_result) {
  sqlite3_backup *backup = sqlite3_backup_init(destination, "main", source, "main");
  if (backup == NULL) {
    *step_result = sqlite3_errcode(destination);
    *finish_result = SQLITE_OK;
    return 0;
  }
  int result;
  int attempts = 0;
  do {
    result = sqlite3_backup_step(backup, -1);
    if (result == SQLITE_BUSY || result == SQLITE_LOCKED) {
      sqlite3_sleep(10);
      attempts++;
    }
  } while ((result == SQLITE_BUSY || result == SQLITE_LOCKED) && attempts < 100);
  int finish = sqlite3_backup_finish(backup);
  *step_result = result;
  *finish_result = finish;
  return result == SQLITE_DONE && finish == SQLITE_OK;
}

static int integrity_ok(sqlite3 *database) {
  sqlite3_stmt *statement = NULL;
  if (sqlite3_prepare_v2(database, "PRAGMA integrity_check", -1, &statement, NULL) != SQLITE_OK) return 0;
  int rows = 0;
  int valid = 1;
  int step;
  while ((step = sqlite3_step(statement)) == SQLITE_ROW) {
    const unsigned char *value = sqlite3_column_text(statement, 0);
    int length = sqlite3_column_bytes(statement, 0);
    if (value == NULL || length != 2 || memcmp(value, "ok", 2) != 0) valid = 0;
    rows++;
  }
  if (step != SQLITE_DONE) valid = 0;
  sqlite3_finalize(statement);
  return valid && rows > 0;
}

typedef enum schema_comparison_result {
  SCHEMA_COMPARISON_OK = 0,
  SCHEMA_COMPARISON_PREPARE,
  SCHEMA_COMPARISON_ROWS,
  SCHEMA_COMPARISON_TYPE,
  SCHEMA_COMPARISON_NAME,
  SCHEMA_COMPARISON_TABLE,
  SCHEMA_COMPARISON_ROOTPAGE,
  SCHEMA_COMPARISON_SQL,
  SCHEMA_COMPARISON_OVERFLOW
} schema_comparison_result;

static int column_equal(sqlite3_stmt *left, sqlite3_stmt *right, int index) {
  int left_type = sqlite3_column_type(left, index);
  int right_type = sqlite3_column_type(right, index);
  if (left_type != right_type) return 0;
  if (left_type == SQLITE_NULL) return 1;
  if (left_type == SQLITE_INTEGER) {
    return sqlite3_column_int64(left, index) == sqlite3_column_int64(right, index);
  }
  const void *left_value = sqlite3_column_blob(left, index);
  const void *right_value = sqlite3_column_blob(right, index);
  int left_bytes = sqlite3_column_bytes(left, index);
  int right_bytes = sqlite3_column_bytes(right, index);
  return left_bytes == right_bytes &&
         (left_bytes == 0 || memcmp(left_value, right_value, (size_t)left_bytes) == 0);
}

static schema_comparison_result mismatch_for_column(int index) {
  static const schema_comparison_result results[4] = {
      SCHEMA_COMPARISON_TYPE,
      SCHEMA_COMPARISON_NAME,
      SCHEMA_COMPARISON_TABLE,
      SCHEMA_COMPARISON_SQL,
  };
  return index >= 0 && index < 4 ? results[index] : SCHEMA_COMPARISON_PREPARE;
}

static schema_comparison_result compare_schema(sqlite3 *source, sqlite3 *destination, uint32_t *count) {
  static const char query[] =
      "SELECT type,name,tbl_name,sql FROM sqlite_schema "
      "ORDER BY type,name,tbl_name,sql";
  sqlite3_stmt *left = NULL;
  sqlite3_stmt *right = NULL;
  if (sqlite3_prepare_v2(source, query, -1, &left, NULL) != SQLITE_OK ||
      sqlite3_prepare_v2(destination, query, -1, &right, NULL) != SQLITE_OK) {
    if (left != NULL) sqlite3_finalize(left);
    if (right != NULL) sqlite3_finalize(right);
    return SCHEMA_COMPARISON_PREPARE;
  }
  uint32_t rows = 0;
  schema_comparison_result result = SCHEMA_COMPARISON_OK;
  for (;;) {
    int left_step = sqlite3_step(left);
    int right_step = sqlite3_step(right);
    if (left_step == SQLITE_DONE && right_step == SQLITE_DONE) break;
    if (left_step != SQLITE_ROW || right_step != SQLITE_ROW) {
      result = SCHEMA_COMPARISON_ROWS;
      break;
    }
    for (int index = 0; index < 4; index++) {
      if (!column_equal(left, right, index)) {
        result = mismatch_for_column(index);
        break;
      }
    }
    if (result != SCHEMA_COMPARISON_OK) break;
    if (rows == UINT32_MAX) {
      result = SCHEMA_COMPARISON_OVERFLOW;
      break;
    }
    rows++;
  }
  sqlite3_finalize(left);
  sqlite3_finalize(right);
  if (result == SCHEMA_COMPARISON_OK) *count = rows;
  return result;
}

static int write_success(uint32_t schema_objects) {
  unsigned char frame[12];
  memcpy(frame, success_magic, sizeof(success_magic));
  frame[8] = (unsigned char)(schema_objects & 0xffu);
  frame[9] = (unsigned char)((schema_objects >> 8) & 0xffu);
  frame[10] = (unsigned char)((schema_objects >> 16) & 0xffu);
  frame[11] = (unsigned char)((schema_objects >> 24) & 0xffu);
  if (_setmode(_fileno(stdout), _O_BINARY) == -1 || fwrite(frame, 1, sizeof(frame), stdout) != sizeof(frame)) {
    secure_zero(frame, sizeof(frame));
    return 0;
  }
  secure_zero(frame, sizeof(frame));
  return fflush(stdout) == 0;
}

int wmain(int argc, wchar_t **argv) {
  if (argc != 3) return fail_with("E_USAGE", 2);
  unsigned char key[KEY_BYTES] = {0};
  unsigned char raw_key[RAW_KEY_BYTES] = {'r', 'a', 'w', ':'};
  char *source_path = NULL;
  char *destination_path = NULL;
  char *source_uri = NULL;
  sqlite3 *source = NULL;
  sqlite3 *destination = NULL;
  int status = 2;
  uint32_t schema_objects = 0;
  int backup_step = SQLITE_OK;
  int backup_finish = SQLITE_OK;
  schema_comparison_result schema_result = SCHEMA_COMPARISON_OK;
  destination_reserve_result reserve_result = DESTINATION_RESERVE_OK;

  if (!read_key(key)) {
    status = fail_with("E_KEY_PIPE", 2);
    goto cleanup;
  }
  memcpy(raw_key + 4, key, KEY_BYTES);
  secure_zero(key, sizeof(key));
  source_path = wide_to_utf8(argv[1]);
  destination_path = wide_to_utf8(argv[2]);
  source_uri = source_path == NULL ? NULL : readonly_uri(source_path);
  if (source_path == NULL || destination_path == NULL || source_uri == NULL) {
    status = fail_with("E_PATH", 2);
    goto cleanup;
  }
  if (sqlite3_open_v2(source_uri, &source, SQLITE_OPEN_READONLY | SQLITE_OPEN_URI | SQLITE_OPEN_NOMUTEX, NULL) != SQLITE_OK) {
    status = fail_with("E_OPEN_SOURCE", 3);
    goto cleanup;
  }
  if (!exec_sql(source, "PRAGMA cipher='sqlcipher';PRAGMA legacy=4;") ||
      sqlite3_key(source, raw_key, RAW_KEY_BYTES) != SQLITE_OK) {
    status = fail_with("E_CIPHER", 3);
    goto cleanup;
  }
  if (!exec_sql(source, "BEGIN")) {
    status = fail_with("E_BEGIN", 3);
    goto cleanup;
  }
  sqlite3_stmt *probe = NULL;
  int probe_step = SQLITE_ERROR;
  if (sqlite3_prepare_v2(source, "SELECT name FROM sqlite_schema LIMIT 1", -1, &probe, NULL) == SQLITE_OK) {
    probe_step = sqlite3_step(probe);
  }
  if (probe == NULL || (probe_step != SQLITE_ROW && probe_step != SQLITE_DONE)) {
    if (probe != NULL) sqlite3_finalize(probe);
    status = fail_with("E_READ_SOURCE", 3);
    goto cleanup;
  }
  sqlite3_finalize(probe);
  reserve_result = reserve_destination(argv[2]);
  if (reserve_result != DESTINATION_RESERVE_OK) {
    status = reserve_result == DESTINATION_RESERVE_EXISTS
        ? fail_with("E_DESTINATION_EXISTS", 4)
        : fail_with("E_RESERVE_DESTINATION", 4);
    goto cleanup;
  }
  if (sqlite3_open_v2(destination_path, &destination, SQLITE_OPEN_READWRITE | SQLITE_OPEN_NOMUTEX, NULL) != SQLITE_OK) {
    status = fail_with("E_OPEN_DESTINATION", 4);
    goto cleanup;
  }
  if (!exec_sql(destination, "PRAGMA cipher='sqlcipher';PRAGMA legacy=4;") ||
      sqlite3_key(destination, raw_key, RAW_KEY_BYTES) != SQLITE_OK) {
    status = fail_with("E_CIPHER_DESTINATION", 4);
    goto cleanup;
  }
  secure_zero(raw_key, sizeof(raw_key));
  if (!copy_database(source, destination, &backup_step, &backup_finish)) {
    if (backup_step == SQLITE_READONLY) status = fail_with("E_BACKUP_READONLY", 4);
    else if (backup_step == SQLITE_BUSY) status = fail_with("E_BACKUP_BUSY", 4);
    else if (backup_step == SQLITE_LOCKED) status = fail_with("E_BACKUP_LOCKED", 4);
    else if (backup_finish != SQLITE_OK) status = fail_with("E_BACKUP_FINISH", 4);
    else status = fail_with("E_BACKUP", 4);
    goto cleanup;
  }
  if (!exec_sql(destination, "PRAGMA journal_mode=DELETE") || sqlite3_rekey(destination, NULL, 0) != SQLITE_OK) {
    status = fail_with("E_DECRYPT_DESTINATION", 4);
    goto cleanup;
  }
  if (!integrity_ok(destination)) {
    status = fail_with("E_INTEGRITY", 4);
    goto cleanup;
  }
  schema_result = compare_schema(source, destination, &schema_objects);
  if (schema_result != SCHEMA_COMPARISON_OK) {
    if (schema_result == SCHEMA_COMPARISON_ROWS) status = fail_with("E_SCHEMA_ROWS", 4);
    else if (schema_result == SCHEMA_COMPARISON_TYPE) status = fail_with("E_SCHEMA_TYPE", 4);
    else if (schema_result == SCHEMA_COMPARISON_NAME) status = fail_with("E_SCHEMA_NAME", 4);
    else if (schema_result == SCHEMA_COMPARISON_TABLE) status = fail_with("E_SCHEMA_TABLE", 4);
    else if (schema_result == SCHEMA_COMPARISON_ROOTPAGE) status = fail_with("E_SCHEMA_ROOTPAGE", 4);
    else if (schema_result == SCHEMA_COMPARISON_SQL) status = fail_with("E_SCHEMA_SQL", 4);
    else status = fail_with("E_SCHEMA", 4);
    goto cleanup;
  }
  if (!write_success(schema_objects)) {
    status = fail_with("E_PIPE", 5);
    goto cleanup;
  }
  status = 0;

cleanup:
  secure_zero(key, sizeof(key));
  secure_zero(raw_key, sizeof(raw_key));
  if (source != NULL) {
    sqlite3_exec(source, "ROLLBACK", NULL, NULL, NULL);
    sqlite3_close_v2(source);
  }
  if (destination != NULL) sqlite3_close_v2(destination);
  free(source_uri);
  free(source_path);
  free(destination_path);
  return status;
}
