import { describe, expect, it } from "vitest";
import { stepTabIndex } from "./tabs-step.js";

describe("stepTabIndex", () => {
  it("左右循环", () => {
    expect(stepTabIndex(0, "ArrowRight", 3)).toBe(1);
    expect(stepTabIndex(2, "ArrowRight", 3)).toBe(0);
    expect(stepTabIndex(0, "ArrowLeft", 3)).toBe(2);
  });

  it("Home / End", () => {
    expect(stepTabIndex(2, "Home", 4)).toBe(0);
    expect(stepTabIndex(0, "End", 4)).toBe(3);
  });

  it("其它键不动", () => {
    expect(stepTabIndex(1, "Enter", 3)).toBe(1);
  });
});
