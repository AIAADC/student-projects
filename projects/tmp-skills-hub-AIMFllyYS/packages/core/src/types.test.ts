import { describe, expect, it } from "vitest";
import type { SkillRecord } from "./types.js";

/** 资产模型形状锁:多来源 + 来源/可见性分离(issue #11)。 */

describe("SkillRecord 资产模型", () => {
  it("一条记录可携带多个来源,且来源与客户端可见性是两个独立字段", () => {
    const record: SkillRecord = {
      hash: "0123456789abcdef",
      dirName: "demo-init",
      meta: { name: "demo-init", description: "demo" },
      origins: [
        { kind: "local-scan", reference: "C:/fake-home/.claude/skills/demo-init" },
        { kind: "github", reference: "https://github.com/example/demo-init" },
      ],
      visibleIn: ["claude", "codex"],
      installedAt: "2026-08-16T00:00:00.000Z",
    };
    expect(record.origins).toHaveLength(2);
    expect(record.origins[0]?.kind).toBe("local-scan");
    expect(record.origins[1]?.reference).toContain("github.com");
    expect(record.visibleIn).toEqual(["claude", "codex"]);
  });
});
