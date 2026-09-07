export function isSafeArchiveEntryName(value: string) {
  if (!value || value.length > 4_096) return false
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint <= 0x1f || codePoint === 0x7f) return false
  }
  const portable = value.replaceAll('\\', '/')
  return !portable.startsWith('/')
    && !/^[a-z]:\//iu.test(portable)
    && !portable.split('/').includes('..')
}
