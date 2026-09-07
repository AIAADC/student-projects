import { type RefObject, useEffect, useState } from 'react'

export interface GridWindow {
  cols: number
  start: number // first item index to mount (inclusive)
  end: number // last item index to mount (exclusive)
  translateY: number // px offset for the mounted window
  totalHeight: number // full virtual height of the scroller
}

/**
 * Viewport windowing for a fixed-pitch CSS grid — the web equivalent of a
 * RecyclerView / UICollectionView. Instead of growing a slice forever (which
 * keeps every scrolled-past <img>/<video> mounted), we mount ONLY the rows
 * intersecting the viewport plus a small overscan and unmount the rest, so the
 * live element count is bounded by screen size, not list size. The scroller is
 * sized to `totalHeight` and the mounted window is translated to its real row.
 *
 * Column count is derived from the scroller width (mirrors `auto-fill` /
 * `minmax(minCol, 1fr)`); recomputed on scroll (rAF-throttled) and resize.
 *
 * @param scrollRef  the `overflow:auto` scroll container
 * @param total      number of items in the full list
 * @param o.minCol   minimum card width (px) — sets the column count
 * @param o.rowH     row pitch (card height + gap, px)
 * @param o.gap      grid gap (px)
 * @param o.padX     horizontal gutter inside the scroller (px)
 * @param o.padY     vertical gutter inside the scroller (px)
 * @param o.overscan extra rows mounted above/below the viewport
 */
export function useGridVirtualizer(
  scrollRef: RefObject<HTMLElement | null>,
  total: number,
  o: { minCol: number; rowH: number; gap: number; padX: number; padY: number; overscan?: number },
): GridWindow {
  const { minCol, rowH, gap, padX, padY, overscan = 4 } = o
  const [win, setWin] = useState<GridWindow>({ cols: 1, start: 0, end: 0, translateY: padY, totalHeight: 0 })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let raf = 0
    const measure = () => {
      raf = 0
      const avail = el.clientWidth - padX * 2
      const cols = Math.max(1, Math.floor((avail + gap) / (minCol + gap)))
      const rows = Math.ceil(total / cols)
      const totalHeight = padY * 2 + Math.max(0, rows * rowH - gap)
      const top = Math.max(0, el.scrollTop - padY)
      const firstRow = Math.max(0, Math.floor(top / rowH) - overscan)
      const visRows = Math.ceil(el.clientHeight / rowH) + overscan * 2
      const lastRow = Math.min(rows, firstRow + visRows)
      setWin({
        cols,
        start: firstRow * cols,
        end: Math.min(total, lastRow * cols),
        translateY: padY + firstRow * rowH,
        totalHeight,
      })
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(onScroll)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      ro.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scrollRef, total, minCol, rowH, gap, padX, padY, overscan])

  return win
}
