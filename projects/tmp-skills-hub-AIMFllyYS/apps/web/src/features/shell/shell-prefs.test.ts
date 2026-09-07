import { describe, expect, it } from "vitest";
import { parseShellPrefs, SIDEBAR_DEFAULT_PX, SIDEBAR_MAX_PX, SIDEBAR_MIN_PX } from "./shell-prefs.js";

describe("parseShellPrefs", () => {
  it("空值回落到默认展开宽", () => {
    expect(parseShellPrefs(null)).toEqual({ collapsed: false, width: SIDEBAR_DEFAULT_PX });
    expect(parseShellPrefs("")).toEqual({ collapsed: false, width: SIDEBAR_DEFAULT_PX });
  });

  it("读出折叠与宽度", () => {
    expect(parseShellPrefs(JSON.stringify({ collapsed: true, width: 240 }))).toEqual({
      collapsed: true,
      width: 240,
    });
  });

  it("宽度夹在允许区间", () => {
    expect(parseShellPrefs(JSON.stringify({ collapsed: false, width: 10 })).width).toBe(SIDEBAR_MIN_PX);
    expect(parseShellPrefs(JSON.stringify({ collapsed: false, width: 9999 })).width).toBe(SIDEBAR_MAX_PX);
  });

  it("坏 JSON 不抛", () => {
    expect(parseShellPrefs("{")).toEqual({ collapsed: false, width: SIDEBAR_DEFAULT_PX });
    expect(parseShellPrefs("[]")).toEqual({ collapsed: false, width: SIDEBAR_DEFAULT_PX });
  });
});
