import { describe, expect, it } from "vitest";
import type { SkillRecord } from "@skills-hub/core";
import { resolveNames, resolveSkill } from "../src/resolve-skill.js";

function rec(dirName: string, hash: string): SkillRecord {
  return {
    hash,
    dirName,
    meta: { name: dirName, description: dirName },
    origins: [{ kind: "authored", reference: dirName }],
    visibleIn: [],
    installedAt: "2026-01-01T00:00:00.000Z",
  };
}

/** other 在前:旧 HTTP 实现 Array.find 会先命中哈希前缀 cafe*。 */
const skills: SkillRecord[] = [
  rec("other", "cafe9999" + "0".repeat(56)),
  rec("bravo", "abcd2222" + "0".repeat(56)),
  rec("cafe", "1111aaaa" + "0".repeat(56)),
  rec("alpha", "abcd1111" + "0".repeat(56)),
];

describe("resolveSkill(#190)", () => {
  it("exact dirName 命中", () => {
    const hit = resolveSkill("bravo", skills);
    expect(hit.ok).toBe(true);
    if (hit.ok) expect(hit.skill.dirName).toBe("bravo");
    expect(resolveNames("bravo", skills)).toEqual(["bravo"]);
  });

  it("唯一哈希前缀命中(大小写不敏感)", () => {
    const hit = resolveSkill("ABCD1111", skills);
    expect(hit.ok).toBe(true);
    if (hit.ok) expect(hit.skill.dirName).toBe("alpha");
  });

  it("歧义哈希前缀 → ambiguous,不取第一条", () => {
    const hit = resolveSkill("abcd", skills);
    expect(hit.ok).toBe(false);
    if (!hit.ok) {
      expect(hit.code).toBe("ambiguous");
      expect(hit.message).toMatch(/不唯一/);
    }
    expect(() => resolveNames("abcd", skills)).toThrow(/不唯一/);
  });

  it("dirName 与另一条哈希前缀冲突时 dirName 胜出", () => {
    const hit = resolveSkill("cafe", skills);
    expect(hit.ok).toBe(true);
    if (hit.ok) {
      expect(hit.skill.dirName).toBe("cafe");
      expect(hit.skill.hash.startsWith("1111")).toBe(true);
    }
  });

  it("0 命中 → not-found", () => {
    const hit = resolveSkill("zzzz", skills);
    expect(hit.ok).toBe(false);
    if (!hit.ok) expect(hit.code).toBe("not-found");
  });
});
