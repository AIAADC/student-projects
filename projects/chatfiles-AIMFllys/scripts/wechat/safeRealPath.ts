import path from 'node:path'

export type UnsafeRealPathReason =
  | 'path_not_absolute'
  | 'unc_path'
  | 'device_path'
  | 'alternate_data_stream'
  | 'outside_root'

export type SafeRealPathResult =
  | { safe: true; relative_path: string }
  | { safe: false; reason: UnsafeRealPathReason }

function windowsPath(value: string): string {
  return value.replaceAll('/', '\\')
}

function isDeviceNamespace(value: string): boolean {
  const normalized = windowsPath(value)
  return normalized.startsWith('\\\\?\\')
    || normalized.startsWith('\\\\.\\')
    || normalized.startsWith('\\??\\')
    || normalized.startsWith('\\\\??\\')
}

function isUncPath(value: string): boolean {
  return windowsPath(value).startsWith('\\\\')
}

function hasAlternateDataStream(value: string): boolean {
  const normalized = windowsPath(value)
  const withoutDrive = /^[A-Za-z]:/.test(normalized) ? normalized.slice(2) : normalized
  return withoutDrive.includes(':')
}

function hasDosDeviceSegment(value: string): boolean {
  const normalized = windowsPath(value).replace(/^[A-Za-z]:\\?/, '')
  return normalized.split('\\').some((segment) => {
    const withoutTrailingDotsOrSpaces = segment.replace(/[. ]+$/u, '')
    const baseName = withoutTrailingDotsOrSpaces.split('.')[0]?.trimEnd().toUpperCase() ?? ''
    return /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]|CONIN\$|CONOUT\$)$/u.test(baseName)
  })
}

function isDriveAbsolute(value: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(value)
}

// Both arguments are expected to be canonical paths returned by realpath at the I/O boundary.
export function relativePathWithinRoot(
  rootRealPath: string,
  targetRealPath: string,
): SafeRealPathResult {
  if (isDeviceNamespace(rootRealPath) || isDeviceNamespace(targetRealPath)) {
    return { safe: false, reason: 'device_path' }
  }
  if (isUncPath(rootRealPath) || isUncPath(targetRealPath)) {
    return { safe: false, reason: 'unc_path' }
  }
  if (hasAlternateDataStream(rootRealPath) || hasAlternateDataStream(targetRealPath)) {
    return { safe: false, reason: 'alternate_data_stream' }
  }
  if (hasDosDeviceSegment(rootRealPath) || hasDosDeviceSegment(targetRealPath)) {
    return { safe: false, reason: 'device_path' }
  }
  if (!isDriveAbsolute(rootRealPath) || !isDriveAbsolute(targetRealPath)) {
    return { safe: false, reason: 'path_not_absolute' }
  }

  const relative = path.win32.relative(rootRealPath, targetRealPath)
  const isOutside = relative === '..'
    || relative.startsWith(`..${path.win32.sep}`)
    || path.win32.isAbsolute(relative)
  if (isOutside) return { safe: false, reason: 'outside_root' }

  return { safe: true, relative_path: relative || '.' }
}
