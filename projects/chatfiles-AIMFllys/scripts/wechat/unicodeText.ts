export function truncateCodePoints(value: string, maximum: number) {
  if (!Number.isSafeInteger(maximum) || maximum < 0) {
    throw new RangeError('maximum must be a non-negative safe integer')
  }
  return [...value].slice(0, maximum).join('')
}
