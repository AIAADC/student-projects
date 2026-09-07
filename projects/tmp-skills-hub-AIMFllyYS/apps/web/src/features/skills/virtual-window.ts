/**
 * 集合列虚拟窗口(无第三方依赖)。
 * 行高取 ui-design-v1 的 4px 网格:h-10 = 40px。
 */
export const SKILL_ROW_HEIGHT_PX = 40;
export const SKILL_ROW_OVERSCAN = 8;

export interface VirtualWindow {
  /** 含,渲染起点 */
  start: number;
  /** 不含,渲染终点 */
  end: number;
  topPad: number;
  bottomPad: number;
}

export function virtualWindow(
  count: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number = SKILL_ROW_HEIGHT_PX,
  overscan: number = SKILL_ROW_OVERSCAN,
): VirtualWindow {
  if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0, topPad: 0, bottomPad: 0 };
  const y = Math.max(0, scrollTop);
  const view = Math.max(0, viewportHeight);
  const start = Math.max(0, Math.floor(y / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((y + view) / rowHeight) + overscan);
  return {
    start,
    end,
    topPad: start * rowHeight,
    bottomPad: (count - end) * rowHeight,
  };
}

/** 让 index 行落入视口,返回新的 scrollTop。 */
export function ensureRowVisible(
  index: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number = SKILL_ROW_HEIGHT_PX,
): number {
  if (viewportHeight <= 0) return 0;
  const top = index * rowHeight;
  const bottom = top + rowHeight;
  if (top < scrollTop) return top;
  if (bottom > scrollTop + viewportHeight) return bottom - viewportHeight;
  return scrollTop;
}

export function stepIndex(current: number | null, delta: number, count: number): number {
  if (count <= 0) return 0;
  if (current === null) return delta > 0 ? 0 : count - 1;
  return Math.max(0, Math.min(count - 1, current + delta));
}
