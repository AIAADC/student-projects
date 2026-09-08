export function nextDialogFocusIndex(currentIndex: number, count: number, backwards: boolean) {
  if (count <= 0) return -1
  if (currentIndex < 0) return backwards ? count - 1 : 0
  return (currentIndex + (backwards ? -1 : 1) + count) % count
}
