import { describe, expect, it } from "vitest";
import { isBuiltinGroup } from "./builtin-groups.js";

describe("isBuiltinGroup", () => {
  it("五个内置 id 为真,用户 id 为假", () => {
    expect(isBuiltinGroup("development")).toBe(true);
    expect(isBuiltinGroup("design")).toBe(true);
    expect(isBuiltinGroup("http-tmp")).toBe(false);
  });
});
