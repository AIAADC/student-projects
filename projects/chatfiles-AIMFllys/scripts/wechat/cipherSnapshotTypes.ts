export type CipherSnapshotErrorCode =
  | 'KEY_LENGTH_INVALID'
  | 'DATABASE_READ_FAILED'
  | 'DESTINATION_RESERVE_FAILED'
  | 'BACKUP_FAILED'
  | 'VALIDATION_OPEN_FAILED'
  | 'INTEGRITY_CHECK_FAILED'
  | 'SCHEMA_MISMATCH'
  | 'WAL_GENERATION_CHANGED'

export class CipherSnapshotError extends Error {
  readonly code: CipherSnapshotErrorCode

  constructor(code: CipherSnapshotErrorCode) {
    super(code)
    this.name = 'CipherSnapshotError'
    this.code = code
  }
}

export interface CipherStatement {
  all(...parameters: unknown[]): unknown[]
}

export interface CipherDatabase {
  pragma(source: string, options?: unknown): unknown
  key?(key: Buffer): number
  exec(source: string): unknown
  prepare(source: string): CipherStatement
  backup?(destination: string): Promise<unknown>
  close(): void
}

export interface CipherSnapshotAdapter {
  open(filename: string, options: { readonly: boolean; fileMustExist: boolean }): CipherDatabase
}

export interface SnapshotFileIo {
  reserveNewFile(filePath: string): Promise<void>
}
