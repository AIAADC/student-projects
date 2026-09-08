import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Readable } from 'node:stream'
import type {
  WechatDatVersion,
  WechatMediaKeyProvider,
} from '../pipeline/media/wechatDat.js'
import { materializeConversationMediaBundle } from './wechat/conversationMediaMaterializer.js'

export type ConversationMediaCliOptions = {
  bundleDir: string
  accountRoot: string
  keyFromStdin: boolean
  keyVersion: WechatDatVersion
  xorKey: number
  concurrency: number
}

export function parseConversationMediaArguments(
  args: readonly string[],
  projectRoot = path.resolve(process.cwd()),
): ConversationMediaCliOptions {
  let bundleDir: string | null = null
  let accountRoot: string | null = null
  let keyFromStdin = false
  let keyVersion: WechatDatVersion = 'v2'
  let xorKey = 0x88
  let concurrency = 2
  for (let index = 0; index < args.length; index++) {
    const argument = args[index]
    if (argument === '--key-stdin') {
      keyFromStdin = true
      continue
    }
    const value = args[++index]
    if (!argument?.startsWith('--') || value === undefined) {
      throw new Error(`Unknown argument: ${argument ?? ''}`)
    }
    if (argument === '--bundle') bundleDir = path.resolve(projectRoot, value)
    else if (argument === '--account-root') accountRoot = path.resolve(projectRoot, value)
    else if (argument === '--key-version' && (value === 'v1' || value === 'v2')) keyVersion = value
    else if (argument === '--xor-key') {
      xorKey = Number(value)
      if (!Number.isSafeInteger(xorKey) || xorKey < 0 || xorKey > 0xff) {
        throw new Error('Invalid media XOR key')
      }
    }
    else if (argument === '--concurrency') {
      concurrency = Number(value)
      if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 8) {
        throw new Error('Invalid media concurrency')
      }
    } else throw new Error(`Unknown argument: ${argument}`)
  }
  if (!bundleDir || !accountRoot) throw new Error('Media bundle and account root are required')
  return { bundleDir,accountRoot,keyFromStdin,keyVersion,xorKey,concurrency }
}

export function createEphemeralKeyProvider(input: Uint8Array, version: WechatDatVersion) {
  const key = Uint8Array.from(input)
  input.fill(0)
  if (key.length !== 16) {
    key.fill(0)
    throw new Error('MEDIA_KEY_INVALID')
  }
  let disposed = false
  const provider: WechatMediaKeyProvider = {
    provide: async (requested) => (
      disposed || requested !== version ? null : Uint8Array.from(key)
    ),
  }
  return {
    provider,
    dispose() {
      if (disposed) return
      disposed = true
      key.fill(0)
    },
  }
}

function hexNibble(value: number) {
  if (value >= 0x30 && value <= 0x39) return value - 0x30
  if (value >= 0x61 && value <= 0x66) return value - 0x61 + 10
  if (value >= 0x41 && value <= 0x46) return value - 0x41 + 10
  return -1
}

function decodeStdinKey(bytes: Uint8Array) {
  const compact = Buffer.allocUnsafe(bytes.length)
  let compactLength = 0
  try {
    for (const value of bytes) {
      if (value !== 0x09 && value !== 0x0a && value !== 0x0d && value !== 0x20) {
        compact[compactLength++] = value
      }
    }
    if (compactLength === 16) return Buffer.from(compact.subarray(0, compactLength))
    if (compactLength === 32) {
      const key = Buffer.alloc(16)
      for (let index = 0; index < key.length; index++) {
        const high = hexNibble(compact[index * 2]!)
        const low = hexNibble(compact[index * 2 + 1]!)
        if (high < 0 || low < 0) {
          key.fill(0)
          throw new Error('MEDIA_KEY_INVALID')
        }
        key[index] = (high << 4) | low
      }
      return key
    }
    throw new Error('MEDIA_KEY_INVALID')
  } finally {
    compact.fill(0)
  }
}

async function readBoundedKey(stream: Readable) {
  const chunks: Buffer[] = []
  let total = 0
  try {
    for await (const value of stream) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array)
      total += chunk.length
      if (total > 128) throw new Error('MEDIA_KEY_INVALID')
      chunks.push(chunk)
    }
    const combined = Buffer.concat(chunks)
    try {
      return decodeStdinKey(combined)
    } finally {
      combined.fill(0)
    }
  } finally {
    for (const chunk of chunks) chunk.fill(0)
  }
}

async function main() {
  const options = parseConversationMediaArguments(process.argv.slice(2))
  const ephemeral = options.keyFromStdin
    ? createEphemeralKeyProvider(await readBoundedKey(process.stdin), options.keyVersion)
    : null
  try {
    const result = await materializeConversationMediaBundle({
      bundleDir: options.bundleDir,
      accountRoot: options.accountRoot,
      keyProvider: ephemeral?.provider ?? { provide: async () => null },
      xorKey: options.xorKey,
      concurrency: options.concurrency,
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } finally {
    ephemeral?.dispose()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write('MEDIA_MATERIALIZATION_FAILED\n')
    process.exitCode = 1
  })
}
