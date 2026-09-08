/** 分段控件键盘步进：左右循环，Home/End 到两端。 */
export function stepTabIndex(current: number, key: string, count: number): number {
  if (count <= 0) return 0;
  const i = current < 0 || current >= count ? 0 : current;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowRight") return (i + 1) % count;
  if (key === "ArrowLeft") return (i - 1 + count) % count;
  return i;
}
