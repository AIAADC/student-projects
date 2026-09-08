import { describe, expect, it } from "vitest";
import { ensureRowVisible, stepIndex, virtualWindow } from "./virtual-window.js";

describe("virtualWindow", () => {
  it("顶部窗口含 overscan,只切可见附近", () => {
    const w = virtualWindow(1000, 0, 400, 40, 8);
    expect(w.start).toBe(0);
    expect(w.end).toBe(18);
    expect(w.topPad).toBe(0);
    expect(w.bottomPad).toBe((1000 - 18) * 40);
    expect(w.end - w.start).toBeLessThan(30);
  });

  it("滚到中部时起点离开 0", () => {
    const w = virtualWindow(1000, 2000, 400, 40, 8);
    expect(w.start).toBe(42);
    expect(w.end).toBe(68);
    expect(w.topPad).toBe(42 * 40);
    expect(w.bottomPad).toBe((1000 - 68) * 40);
  });

  it("空列表", () => {
    expect(virtualWindow(0, 0, 400)).toEqual({ start: 0, end: 0, topPad: 0, bottomPad: 0 });
  });
});

describe("ensureRowVisible / stepIndex", () => {
  it("行在视口上方则上滚", () => {
    expect(ensureRowVisible(0, 200, 400, 40)).toBe(0);
  });

  it("行在视口下方则下滚", () => {
    expect(ensureRowVisible(20, 0, 400, 40)).toBe(20 * 40 + 40 - 400);
  });

  it("已可见则不动", () => {
    expect(ensureRowVisible(5, 0, 400, 40)).toBe(0);
  });

  it("方向键步进夹紧", () => {
    expect(stepIndex(null, 1, 10)).toBe(0);
    expect(stepIndex(null, -1, 10)).toBe(9);
    expect(stepIndex(0, -1, 10)).toBe(0);
    expect(stepIndex(9, 1, 10)).toBe(9);
    expect(stepIndex(3, 1, 10)).toBe(4);
  });
});
