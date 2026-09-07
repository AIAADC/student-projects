import { createHash } from 'node:crypto'

export function canonicalPersonId(owner: string, username: string) {
  const canonicalOwner = owner.trim()
  const canonicalUsername = username.trim()
  if (!canonicalOwner || !canonicalUsername) {
    throw new TypeError('owner and username are required for a canonical person id')
  }
  const digest = createHash('sha256')
    .update(canonicalOwner, 'utf8')
    .update('\u0000')
    .update(canonicalUsername, 'utf8')
    .digest('hex')
  return `wxp:${digest}`
}
