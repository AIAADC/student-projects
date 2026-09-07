import { type RefObject, useEffect, useMemo, useState } from 'react'

export type FixedListWindowInput = {
  count: number
  gap: number
  itemHeight: number
  listTop: number
  overscan: number
  retainedIndices: readonly number[]
  scrollTop: number
  viewportHeight: number
}

export type FixedListWindow = {
  start: number
  end: number
  indices: number[]
  totalHeight: number
}

export function calculateFixedListWindow(input: FixedListWindowInput): FixedListWindow {
  const count = Math.max(0, Math.floor(input.count))
  if (count === 0) return { start: 0, end: 0, indices: [], totalHeight: 0 }

  const pitch = Math.max(1, input.itemHeight + input.gap)
  const overscan = Math.max(0, Math.floor(input.overscan))
  const viewportStart = Math.max(0, input.scrollTop - input.listTop)
  const viewportEnd = input.scrollTop + Math.max(0, input.viewportHeight) - input.listTop
  let start = Math.min(count, Math.max(0, Math.floor(viewportStart / pitch) - overscan))
  let end = Math.min(count, Math.max(overscan, Math.ceil(Math.max(0, viewportEnd) / pitch) + overscan))

  if (end <= start) {
    start = Math.max(0, count - Math.max(1, overscan))
    end = count
  }

  const indexSet = new Set<number>()
  for (let index = start; index < end; index += 1) indexSet.add(index)
  for (const index of input.retainedIndices) {
    if (Number.isInteger(index) && index >= 0 && index < count) indexSet.add(index)
  }

  return {
    start,
    end,
    indices: [...indexSet].sort((left, right) => left - right),
    totalHeight: count * pitch - input.gap,
  }
}

export function useFixedListVirtualizer(
  scrollRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLElement | null>,
  count: number,
  options: {
    itemHeight: number
    gap: number
    overscan?: number
    retainedIndices?: readonly number[]
  },
) {
  const { itemHeight, gap, overscan = 6, retainedIndices = [] } = options
  const [measurement, setMeasurement] = useState({ listTop: 0, scrollTop: 0, viewportHeight: 0 })

  useEffect(() => {
    const scroller = scrollRef.current
    const list = listRef.current
    if (!scroller || !list) return

    let animationFrame = 0
    const measure = () => {
      animationFrame = 0
      const scrollerRect = scroller.getBoundingClientRect()
      const listRect = list.getBoundingClientRect()
      const next = {
        listTop: listRect.top - scrollerRect.top + scroller.scrollTop,
        scrollTop: scroller.scrollTop,
        viewportHeight: scroller.clientHeight,
      }
      setMeasurement((current) => (
        current.listTop === next.listTop
        && current.scrollTop === next.scrollTop
        && current.viewportHeight === next.viewportHeight
          ? current
          : next
      ))
    }
    const scheduleMeasure = () => {
      if (!animationFrame) animationFrame = requestAnimationFrame(measure)
    }

    scheduleMeasure()
    scroller.addEventListener('scroll', scheduleMeasure, { passive: true })
    const resizeObserver = new ResizeObserver(scheduleMeasure)
    resizeObserver.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', scheduleMeasure)
      resizeObserver.disconnect()
      if (animationFrame) cancelAnimationFrame(animationFrame)
    }
  }, [count, listRef, scrollRef])

  return useMemo(() => calculateFixedListWindow({
    ...measurement,
    count,
    gap,
    itemHeight,
    overscan,
    retainedIndices,
  }), [count, gap, itemHeight, measurement, overscan, retainedIndices])
}
