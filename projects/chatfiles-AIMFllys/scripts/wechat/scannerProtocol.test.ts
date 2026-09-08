import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import {
  SCANNER_PROTOCOL_MAGIC,
  SCANNER_PROTOCOL_VERSION,
  ScannerProtocolError,
  ScannerProtocolParser,
  resolveContainedDatabasePath,
} from './scannerProtocol.js'

function protocol(records: Array<{ relativePath: string; key: Buffer }>) {
  const header = Buffer.alloc(SCANNER_PROTOCOL_MAGIC.length + 4)
  SCANNER_PROTOCOL_MAGIC.copy(header)
  header.writeUInt32LE(SCANNER_PROTOCOL_VERSION, SCANNER_PROTOCOL_MAGIC.length)
  const encoded = records.map(({ relativePath, key }) => {
    const relativePathBytes = Buffer.from(relativePath, 'utf8')
    const frame = Buffer.alloc(4 + relativePathBytes.length + 32)
    frame.writeUInt32LE(relativePathBytes.length, 0)
    relativePathBytes.copy(frame, 4)
    key.copy(frame, 4 + relativePathBytes.length)
    return frame
  })
  return Buffer.concat([header, ...encoded, Buffer.alloc(4)])
}

function expectProtocolError(code: string, action: () => unknown) {
  assert.throws(action, (error: unknown) => error instanceof ScannerProtocolError && error.code === code)
}

test('incrementally parses Chinese paths and raw keys without retaining pipe chunks', () => {
  const key = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1))
  const wire = protocol([{ relativePath: 'db_storage\\message\\消息_0.db', key }])
  const parser = new ScannerProtocolParser()
  const records = []
  for (const byte of wire) {
    const chunk = Buffer.from([byte])
    records.push(...parser.push(chunk))
    assert.deepEqual(chunk, Buffer.from([0]))
  }
  parser.finish()
  assert.equal(records.length, 1)
  assert.equal(records[0]?.relativePath, 'db_storage\\message\\消息_0.db')
  assert.deepEqual(records[0]?.key, key)
  records[0]?.key.fill(0)
  parser.dispose()
})

test('rejects traversal, absolute Windows paths, and non-database targets', () => {
  const root = path.resolve('C:\\fixture-account')
  expectProtocolError('PATH_OUTSIDE_ROOT', () => resolveContainedDatabasePath(root, '..\\secrets.db'))
  expectProtocolError('PATH_OUTSIDE_ROOT', () => resolveContainedDatabasePath(root, 'C:\\secrets.db'))
  expectProtocolError('PATH_NOT_DATABASE', () => resolveContainedDatabasePath(root, 'db_storage\\message\\note.txt'))
  expectProtocolError('PATH_NOT_DATABASE', () => resolveContainedDatabasePath(root, 'other\\message.db'))

  const safe = resolveContainedDatabasePath(root, 'db_storage\\message\\中文.db')
  assert.equal(safe, path.join(root, 'db_storage', 'message', '中文.db'))
})

test('rejects unsupported headers, invalid UTF-8, truncation, and bytes after the terminator', () => {
  const badVersion = protocol([])
  badVersion.writeUInt32LE(99, SCANNER_PROTOCOL_MAGIC.length)
  expectProtocolError('VERSION_UNSUPPORTED', () => new ScannerProtocolParser().push(badVersion))

  const invalidUtf8 = protocol([{ relativePath: 'x.db', key: Buffer.alloc(32, 7) }])
  invalidUtf8[SCANNER_PROTOCOL_MAGIC.length + 4 + 4] = 0xff
  const utf8Parser = new ScannerProtocolParser()
  expectProtocolError('PATH_UTF8_INVALID', () => utf8Parser.push(invalidUtf8))

  const partial = protocol([{ relativePath: 'db_storage\\a.db', key: Buffer.alloc(32, 9) }])
  const partialParser = new ScannerProtocolParser()
  partialParser.push(Buffer.from(partial.subarray(0, partial.length - 5)))
  expectProtocolError('PROTOCOL_TRUNCATED', () => partialParser.finish())

  const trailing = Buffer.concat([protocol([]), Buffer.from([1])])
  expectProtocolError('TRAILING_DATA', () => new ScannerProtocolParser().push(trailing))
})

test('never includes binary payload or attacker-controlled paths in parser errors', () => {
  const secretKey = Buffer.alloc(32, 0xab)
  const unsafe = protocol([{ relativePath: '..\\绝密.db', key: secretKey }])
  const parser = new ScannerProtocolParser()
  let message = ''
  try {
    parser.push(unsafe)
  } catch (error) {
    message = String((error as Error).message)
  }
  assert.equal(message, 'PATH_OUTSIDE_ROOT')
  assert.equal(message.includes('绝密'), false)
  assert.equal(message.includes('abab'), false)
})
