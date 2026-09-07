export function formatBytes(size: number) {
  if (!size) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const level = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  return `${(size / 1024 ** level).toFixed(level ? 1 : 0)} ${units[level]}`
}

export function fileNameFromPath(value: string) {
  return value.split(/[\\/]+/).filter(Boolean).at(-1) ?? value
}

/** unix-seconds → YYYY.MM.DD (empty string for 0/falsy) */
export function fmtDate(unixSeconds: number) {
  if (!unixSeconds) return ''
  const d = new Date(unixSeconds * 1000)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
