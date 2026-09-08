export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T, index: number) => R | Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError('Worker limit must be positive')
  }
  const results = new Array<R>(items.length)
  let nextIndex = 0
  let failed = false
  let failure: unknown
  const runWorker = async () => {
    while (!failed) {
      const index = nextIndex++
      if (index >= items.length) return
      try {
        results[index] = await work(items[index]!, index)
      } catch (error) {
        failed = true
        failure = error
      }
    }
  }
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => runWorker(),
  )
  await Promise.all(workers)
  if (failed) throw failure
  return results
}
