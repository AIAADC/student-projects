import fs from 'node:fs'
import path from 'node:path'
import { hasMaterializedMediaMagic } from '../../shared/media/mediaMagic.js'
import { digestFileContent } from './contentDigest.js'

const dosDevice = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu

function safeSegments(relativePath: string) {
  if (!relativePath || relativePath.includes('\u0000')) return null
  if (path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) return null
  if (/^[a-z]:/iu.test(relativePath) || /^(?:\\\\[?.]\\|\\\?\?\\)/u.test(relativePath)) return null
  const segments = relativePath.split(/[\\/]/u)
  if (segments.some((segment) => (
    !segment
    || segment === '.'
    || segment === '..'
    || segment.includes(':')
    || segment.endsWith('.')
    || segment.endsWith(' ')
    || dosDevice.test(segment)
  ))) return null
  return segments
}

function isContained(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative !== '' && !relative.startsWith(`..${path.sep}`)
    && relative !== '..' && !path.isAbsolute(relative)
}

export function resolveArtifactFile(input: {
  root: string | null
  relativePath: string | null
  expectedSize: number | null
  contentSha256: string | null
  requireContentDigest: boolean
  requireMediaFormat?: boolean
  mediaFormat?: string | null
}) {
  if (!input.root || input.expectedSize === null
    || !Number.isSafeInteger(input.expectedSize) || input.expectedSize < 0) return null
  const segments = input.relativePath ? safeSegments(input.relativePath) : null
  if (!segments) return null
  try {
    const lexicalTarget = path.resolve(input.root, ...segments)
    if (!isContained(input.root, lexicalTarget)) return null
    const target = fs.realpathSync(lexicalTarget)
    if (!isContained(input.root, target)) return null
    const stat = fs.statSync(target)
    if (!stat.isFile() || stat.size !== input.expectedSize) return null
    if (input.requireContentDigest && !/^sha256:[a-f0-9]{64}$/u.test(
      input.contentSha256 ?? '',
    )) return null
    if (input.contentSha256 && digestFileContent(target) !== input.contentSha256) return null
    if (input.requireMediaFormat && !input.mediaFormat) return null
    if (input.mediaFormat && !hasMaterializedMediaMagic(fs.readFileSync(target), input.mediaFormat)) {
      return null
    }
    return target
  } catch {
    return null
  }
}
