import type { DatabaseSync } from 'node:sqlite'

export const CANONICAL_SCHEMA_VERSION = 2

export function createCanonicalSchema(out: DatabaseSync) {
  out.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE people(
      person_id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT NOT NULL,
      display_name_source TEXT NOT NULL,
      evidence_json TEXT NOT NULL,
      UNIQUE(owner, username)
    );
    CREATE TABLE contacts(
      account TEXT, owner TEXT, username TEXT, display TEXT, nick TEXT, remark TEXT, alias TEXT, is_group INTEGER
    );
    CREATE TABLE conversations(
      id TEXT PRIMARY KEY,
      account TEXT NOT NULL,
      owner TEXT NOT NULL,
      owner_person_id TEXT NOT NULL REFERENCES people(person_id),
      peer_person_id TEXT REFERENCES people(person_id),
      username TEXT NOT NULL,
      display TEXT NOT NULL,
      is_group INTEGER NOT NULL,
      msg_count INTEGER NOT NULL,
      text_count INTEGER NOT NULL,
      first_time INTEGER NOT NULL,
      last_time INTEGER NOT NULL,
      summary TEXT NOT NULL,
      UNIQUE(owner, username)
    );
    CREATE TABLE messages(
      conv_id TEXT NOT NULL REFERENCES conversations(id),
      message_uid TEXT NOT NULL,
      seq INTEGER NOT NULL,
      canonical_seq INTEGER NOT NULL,
      occurred_at_epoch_s INTEGER NOT NULL,
      time_precision TEXT NOT NULL CHECK(time_precision='second'),
      archive_day TEXT NOT NULL,
      source_adapter TEXT NOT NULL,
      source_snapshot TEXT NOT NULL,
      source_db TEXT NOT NULL,
      source_table TEXT NOT NULL,
      local_id INTEGER NOT NULL,
      server_id TEXT NOT NULL,
      sort_seq INTEGER NOT NULL,
      source_sort_seq INTEGER NOT NULL,
      time INTEGER NOT NULL,
      sender TEXT NOT NULL,
      person_id TEXT REFERENCES people(person_id),
      sender_name TEXT NOT NULL,
      sender_name_snapshot TEXT NOT NULL,
      sender_prefix TEXT NOT NULL,
      is_own INTEGER NOT NULL,
      sender_source TEXT NOT NULL,
      sender_audit TEXT NOT NULL,
      raw_type INTEGER NOT NULL,
      type INTEGER NOT NULL,
      type_label TEXT NOT NULL,
      content_kind TEXT NOT NULL,
      structured_content_json TEXT NOT NULL,
      text TEXT NOT NULL,
      UNIQUE(conv_id, canonical_seq)
    );
    CREATE TABLE source_inventory(
      source_snapshot TEXT NOT NULL,
      domain TEXT NOT NULL,
      source_db TEXT NOT NULL,
      source_table TEXT NOT NULL,
      discovered_rows INTEGER NOT NULL,
      parsed_rows INTEGER NOT NULL,
      deduplicated_rows INTEGER NOT NULL,
      excluded_rows INTEGER NOT NULL,
      exclusion_reason TEXT,
      PRIMARY KEY(source_snapshot, source_db, source_table)
    );
    CREATE TABLE parse_runs(
      run_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      schema_version INTEGER NOT NULL,
      time_zone TEXT NOT NULL,
      selected_snapshot_count INTEGER NOT NULL,
      selected_source_count INTEGER NOT NULL,
      source_unit_count INTEGER NOT NULL,
      source_conversation_count INTEGER NOT NULL,
      source_message_count INTEGER NOT NULL,
      excluded_source_row_count INTEGER NOT NULL,
      output_conversation_count INTEGER NOT NULL,
      output_message_count INTEGER NOT NULL,
      output_text_count INTEGER NOT NULL,
      deduplicated_message_count INTEGER NOT NULL
    );
    CREATE TABLE bundle_metadata(
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX idx_conv_last ON conversations(last_time DESC);
    CREATE INDEX idx_msg_conv_canonical ON messages(conv_id, canonical_seq);
    CREATE INDEX idx_msg_conv_day ON messages(conv_id, archive_day, canonical_seq);
    CREATE INDEX idx_msg_sender ON messages(conv_id, sender, canonical_seq);
    CREATE UNIQUE INDEX idx_msg_uid ON messages(message_uid);
    CREATE UNIQUE INDEX idx_msg_evidence ON messages(conv_id, source_db, source_table, local_id);
    CREATE UNIQUE INDEX idx_msg_server ON messages(conv_id, server_id)
      WHERE server_id IS NOT NULL AND trim(server_id)<>'' AND server_id<>'0';
  `)
}
