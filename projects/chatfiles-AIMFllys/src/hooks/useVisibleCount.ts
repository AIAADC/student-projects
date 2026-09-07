import { useEffect, useRef, useState } from 'react'

/**
 * Incrementally reveal items as a sentinel scrolls into view, so heavy lists
 * (media grids with thousands of <img>/<video>, nugget walls) never mount
 * everything at once — which would fire thousands of network requests and
 * freeze the tab. Render `items.slice(0, count)` and drop `sentinelRef` on a
 * node just below the rendered slice.
 *
 * @param total     full length of the underlying list
 * @param step      how many more to reveal each time the sentinel appears
 * @param resetKey  changing this snaps the window back to the first batch
 *                  (e.g. when the active filter / category changes)
 */
export function useVisibleCount(total: number, step = 48, resetKey?: unknown) {
  const [count, setCount] = useState(() => Math.min(step, total))
  const sentinelRef = useRef<HTMLDivElement>(null)

  // snap back to the first batch whenever the list identity or size changes
  useEffect(() => {
    const frame = requestAnimationFrame(() => setCount(Math.min(step, total)))
    return () => cancelAnimationFrame(frame)
  }, [total, step, resetKey])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || count >= total) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((c) => Math.min(c + step, total))
        }
      },
      { rootMargin: '300px 0px' },
    )
    io.observe(node)
    return () => io.disconnect()
  }, [count, total, step])

  return { count, sentinelRef, done: count >= total }
}
