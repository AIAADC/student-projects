import type { CipherDatabase, SnapshotFileIo } from './readOnlyCipherSnapshot.js'
import type { SafeWalState } from './walState.js'

export const safeWal: SafeWalState = {
  kind: 'active',
  safeForReadonlyShm: true,
  mxFrame: 2,
  nBackfill: 2,
  nBackfillAttempted: 2,
  pageSize: 4096,
  physicalFrameSlots: 2,
  generationFingerprint: 'fixture-generation-a',
}

export class FakeDatabase implements CipherDatabase {
  readonly events: string[]
  readonly schema: Array<Record<string, unknown>>
  readonly integrity: Array<Record<string, unknown>>
  readonly beginError?: Error
  keyReference?: Buffer

  constructor(options: {
    events: string[]
    schema?: Array<Record<string, unknown>>
    integrity?: Array<Record<string, unknown>>
    beginError?: Error
  }) {
    this.events = options.events
    this.schema = options.schema ?? [{ type: 'table', name: '消息', tbl_name: '消息', rootpage: 2, sql: 'CREATE TABLE 消息(id)' }]
    this.integrity = options.integrity ?? [{ integrity_check: 'ok' }]
    this.beginError = options.beginError
  }

  pragma(source: string) {
    this.events.push(`pragma:${source}`)
    if (source === 'integrity_check') return this.integrity
    return []
  }

  key(key: Buffer) {
    this.events.push('key')
    this.keyReference = key
    return 0
  }

  exec(source: string) {
    this.events.push(`exec:${source}`)
    if (source === 'BEGIN' && this.beginError) throw this.beginError
  }

  prepare(source: string) {
    this.events.push(source.includes('sqlite_schema') ? 'prepare:schema' : 'prepare:other')
    return { all: () => this.schema }
  }

  async backup(destination: string) {
    this.events.push(`backup:${destination}`)
    return { totalPages: 1, remainingPages: 0 }
  }

  close() {
    this.events.push('close')
  }
}

export function fakeIo(events: string[]): SnapshotFileIo {
  return {
    async reserveNewFile(filePath) {
      events.push(`reserve:${filePath}`)
    },
  }
}
