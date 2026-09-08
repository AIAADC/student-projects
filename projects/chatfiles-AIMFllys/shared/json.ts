function isMissingFile(error: unknown) {
  return Boolean(error) && typeof error === 'object'
    && (error as { code?: unknown }).code === 'ENOENT'
}

export function readJsonSource<T>(read: () => string, fallback: T): T {
  try {
    return JSON.parse(read()) as T
  } catch (error) {
    if (isMissingFile(error)) return fallback
    throw error
  }
}
