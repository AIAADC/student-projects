import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type ProductFileEvidence = {
  relativePath: string
  size: number
  sha256: string
}

const HASH_BUFFER_BYTES = 1024 * 1024

function contained(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export function digestFile(filename: string) {
  const hash = crypto.createHash('sha256')
  const buffer = Buffer.allocUnsafe(HASH_BUFFER_BYTES)
  const handle = fs.openSync(filename, 'r')
  try {
    let bytesRead = 0
    do {
      bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null)
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead))
    } while (bytesRead > 0)
  } finally {
    fs.closeSync(handle)
  }
  return `sha256:${hash.digest('hex')}`
}

export function digestText(value: string) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`
}

export function strictRealDirectory(candidate: string, code = 'PRODUCT_ROOT_UNSAFE') {
  const lexical = path.resolve(candidate)
  const stat = fs.lstatSync(lexical)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code)
  return fs.realpathSync(lexical)
}

export function ensureDataRoleDirectory(
  dataRootInput: string,
  segments: readonly string[],
  options: { create: boolean;code: string },
) {
  const root = strictRealDirectory(dataRootInput, options.code)
  let current = root
  for (const segment of segments) {
    if (!/^[0-9A-Za-z._-]{1,100}$/u.test(segment) || segment === '.' || segment === '..') {
      throw new Error(options.code)
    }
    const candidate = path.join(current, segment)
    if (!fs.existsSync(candidate)) {
      if (!options.create) throw new Error(options.code)
      fs.mkdirSync(candidate)
    }
    const stat = fs.lstatSync(candidate)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(options.code)
    const real = fs.realpathSync(candidate)
    if (!contained(root, real)) throw new Error(options.code)
    current = real
  }
  return current
}

export function inventoryProductTree(rootInput: string) {
  const root = strictRealDirectory(rootInput)
  const files: ProductFileEvidence[] = []
  const caseFolded = new Set<string>()
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name)
      const stat = fs.lstatSync(target)
      if (entry.isSymbolicLink() || stat.isSymbolicLink()) throw new Error('PRODUCT_LINK_UNSAFE')
      const real = fs.realpathSync(target)
      if (!contained(root, real)) throw new Error('PRODUCT_PATH_ESCAPE')
      const relativePath = path.relative(root, target).split(path.sep).join('/')
      const folded = relativePath.toLocaleLowerCase('en-US')
      if (caseFolded.has(folded)) throw new Error('PRODUCT_CASE_COLLISION')
      caseFolded.add(folded)
      if (entry.isDirectory() && stat.isDirectory()) stack.push(target)
      else if (entry.isFile() && stat.isFile()) {
        if (!Number.isSafeInteger(stat.size) || stat.size < 0) throw new Error('PRODUCT_SIZE_INVALID')
        files.push({ relativePath,size: stat.size,sha256: digestFile(real) })
      } else throw new Error('PRODUCT_SPECIAL_FILE_UNSAFE')
      if (files.length > 1_000_000) throw new Error('PRODUCT_FILE_LIMIT_EXCEEDED')
    }
  }
  return files.sort((left, right) => left.relativePath < right.relativePath ? -1 : 1)
}

export function copyProductFiles(
  sourceRoot: string,
  destinationRoot: string,
  files: readonly ProductFileEvidence[],
) {
  for (const file of files) {
    const segments = file.relativePath.split('/')
    const source = path.resolve(sourceRoot, ...segments)
    const destination = path.resolve(destinationRoot, ...segments)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL)
  }
}
