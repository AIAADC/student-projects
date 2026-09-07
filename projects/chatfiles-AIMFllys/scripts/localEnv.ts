import fs from 'node:fs'

export type LocalEnvironment = Record<string, string | undefined>

export type LoadLocalEnvOptions = {
  filePath: string
  environment?: LocalEnvironment
  readFile?: (filePath: string) => Buffer
  onNotice?: (message: string) => void
}

export type LocalEnvLoadResult = {
  found: boolean
  loadedKeys: string[]
  preservedKeys: string[]
}

function syntaxError(lineNumber: number) {
  return new Error(`Invalid local environment syntax at line ${lineNumber}`)
}

export function parseSimpleDotEnv(source: Uint8Array): Record<string, string> {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(source)
  } catch {
    throw new Error('Local environment file must be valid UTF-8')
  }

  const values: Record<string, string> = {}
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1
    const line = lines[index]
    if (line === undefined) continue
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) throw syntaxError(lineNumber)
    const key = match[1]
    let value = match[2]
    if (key === undefined || value === undefined || Object.hasOwn(values, key)) throw syntaxError(lineNumber)

    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0]
      if (value.length < 2 || !value.endsWith(quote)) throw syntaxError(lineNumber)
      value = value.slice(1, -1)
    }
    if (value.includes('\u0000')) throw syntaxError(lineNumber)
    values[key] = value
  }

  return values
}

export function loadLocalEnv(options: LoadLocalEnvOptions): LocalEnvLoadResult {
  const environment = options.environment ?? process.env
  const readFile = options.readFile ?? ((filePath: string) => fs.readFileSync(filePath))
  let source: Buffer

  try {
    source = readFile(options.filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { found: false, loadedKeys: [], preservedKeys: [] }
    }
    throw new Error('Unable to read local environment file', { cause: error })
  }

  const values = parseSimpleDotEnv(source)
  const loadedKeys: string[] = []
  const preservedKeys: string[] = []

  for (const [key, value] of Object.entries(values)) {
    if (environment[key] !== undefined) {
      preservedKeys.push(key)
      continue
    }
    environment[key] = value
    loadedKeys.push(key)
  }

  options.onNotice?.(
    `Loaded ${loadedKeys.length} local environment variable(s); preserved ${preservedKeys.length} existing value(s).`,
  )
  return { found: true, loadedKeys, preservedKeys }
}
