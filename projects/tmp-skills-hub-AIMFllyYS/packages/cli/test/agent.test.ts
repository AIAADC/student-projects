import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { convertArrayToReadableStream, MockLanguageModelV3 } from "ai/test";
import { createSkillsHubAgent, parseWritePolicy } from "../src/agent/agent.js";
import { createAgentTools, WRITE_TOOL_NAMES, type ToolEnv } from "../src/agent/tools.js";

const usage = {
  inputTokens: { total: 1, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

describe("writePolicy", () => {
  it("缺省 ask,仅 allow 字面量放行", () => {
    expect(parseWritePolicy(undefined)).toBe("ask");
    expect(parseWritePolicy("ask")).toBe("ask");
    expect(parseWritePolicy("allow")).toBe("allow");
    expect(parseWritePolicy("other")).toBe("ask");
  });

  it("写工具名单含启用/归档/收录,不含 list/read", () => {
    expect(WRITE_TOOL_NAMES.has("enable_skills")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("archive_skill")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("adopt_skill")).toBe(true);
    expect(WRITE_TOOL_NAMES.has("list_skills")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("read_skill_file")).toBe(false);
    expect(WRITE_TOOL_NAMES.has("run_cli")).toBe(false);
  });
});

describe("createAgentTools", () => {
  it("库存未配置时读工具返回可读失败", async () => {
    const env: ToolEnv = { home: "/tmp/fake-home", storeRoot: null };
    const tools = createAgentTools(env);
    const listed = await tools.list_skills.execute!({}, { messages: [], abortSignal: new AbortController().signal, toolCallId: "t" });
    expect(listed).toEqual({ ok: false, message: expect.stringContaining("库存未配置") });
  });

  it("read_skill_file:真实库存读 SKILL.md;不存在 target 失败", async () => {
    const storeRoot = await mkdtemp(path.join(os.tmpdir(), "skills-hub-agent-store-"));
    const skillDir = path.join(storeRoot, "skills", "demo");
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: d\n---\n\n# demo\n", "utf8");
    await writeFile(
      path.join(storeRoot, "index.json"),
      JSON.stringify({
        version: 1,
        skills: [{ hash: "ab12cdef", dirName: "demo", meta: { name: "demo", description: "d" }, origins: [], installedAt: "2026-01-01T00:00:00.000Z" }],
      }),
      "utf8",
    );
    const tools = createAgentTools({ home: "/tmp/fake-home", storeRoot });
    const opts = { messages: [], abortSignal: new AbortController().signal, toolCallId: "t" };
    const ok = await tools.read_skill_file.execute!({ target: "demo", path: "SKILL.md" }, opts);
    expect(ok).toMatchObject({ ok: true });
    if (ok !== undefined && "content" in ok) expect(String(ok.content)).toContain("# demo");
    const byPrefix = await tools.read_skill_file.execute!({ target: "ab12", path: "SKILL.md" }, opts);
    expect(byPrefix).toMatchObject({ ok: true });
    const missing = await tools.read_skill_file.execute!({ target: "ghost", path: "SKILL.md" }, opts);
    expect(missing).toMatchObject({ ok: false });
  });
});

describe("createSkillsHubAgent", () => {
  it("无工具调用时 generate 返回正文", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: {
        content: [{ type: "text", text: "库存里有 1 个 skill" }],
        finishReason: "stop",
        usage,
        warnings: [],
      },
      doStream: {
        stream: convertArrayToReadableStream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t0" },
          { type: "text-delta", id: "t0", delta: "库存里有 1 个 skill" },
          { type: "text-end", id: "t0" },
          { type: "finish", finishReason: "stop", usage },
        ]),
      },
    });
    const agent = createSkillsHubAgent({
      model,
      env: { home: "/tmp/fake-home", storeRoot: null },
      clients: [],
      writePolicy: "ask",
    });
    const result = await agent.generate({ prompt: "列出库存" });
    expect(result.text).toContain("skill");
  });
});
