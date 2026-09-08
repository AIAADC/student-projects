/**
 * 相近/冲突分析(#43)。文本判断交给模型,core 不实现相似度算法。
 * 只产出建议,不写盘。无密钥时 not-configured,不编造结论。
 */

import { generateText, Output } from "ai";
import { z } from "zod";
import { readSkillMeta, readStoreIndex, type SkillRecord } from "@skills-hub/core";
import path from "node:path";
import { emitError, emitOk } from "./json-out.js";
import { mapLlmError, type LlmFailureCode } from "./llm/errors.js";
import { createQiniuModel, notConfiguredMessage, qiniuApiKey, resolveModel } from "./llm/provider.js";
import { resolveSkill } from "./resolve-skill.js";

export const MAX_TARGET_DESC_CHARS = 4_000;
export const MAX_STOCK_DESC_CHARS = 200;
export const MAX_STOCK_RECORDS = 400;
export const ANALYZE_TIMEOUT_MS = 90_000;

export interface AnalyzeReportItem {
  name: string;
  reason: string;
}

export interface AnalyzeReport {
  target: string;
  similar: AnalyzeReportItem[];
  conflict: AnalyzeReportItem[];
}

export interface AnalyzeArgs {
  home: string | undefined;
  json: boolean | undefined;
  _: (string | number)[];
}

interface AnalyzeContext {
  targetName: string;
  targetDescription: string;
  stock: Array<{ name: string; description: string }>;
}

const reportSchema = z.object({
  similar: z.array(z.object({ name: z.string(), reason: z.string() })),
  conflict: z.array(z.object({ name: z.string(), reason: z.string() })),
});

export function buildAnalyzeContext(records: SkillRecord[], target: { dirName: string; description: string }): AnalyzeContext {
  const stock = records
    .filter((s) => s.dirName !== target.dirName)
    .slice(0, MAX_STOCK_RECORDS)
    .map((s) => ({
      name: s.dirName,
      description: s.meta.description.slice(0, MAX_STOCK_DESC_CHARS),
    }));
  return {
    targetName: target.dirName,
    targetDescription: target.description.slice(0, MAX_TARGET_DESC_CHARS),
    stock,
  };
}

export function analyzeSystemPrompt(): string {
  return [
    "你是一个 Agent Skill 库存的分析助手。用户给出一个待评估的 skill 的 name 与 description,以及库存中其他 skill 的 name 与 description 列表。",
    "你的任务:判断库存里哪些 skill 与它功能相近(similar),哪些可能冲突(conflict,如职责重叠、命名易混、互相干扰)。",
    "只引用库存列表中真实存在的 name;每条给一句具体理由;没有相近或冲突就输出空数组。",
    "这是建议,绝不执行任何写操作;不要编造库存列表之外的信息。",
  ].join("\n");
}

export type AnalyzeGenerateResult =
  | { ok: true; similar: AnalyzeReportItem[]; conflict: AnalyzeReportItem[] }
  | { ok: false; code: LlmFailureCode; message: string };

export type AnalyzeGenerate = (input: { system: string; prompt: string }) => Promise<AnalyzeGenerateResult>;

async function defaultGenerate(input: { system: string; prompt: string }): Promise<AnalyzeGenerateResult> {
  if (qiniuApiKey() === undefined) {
    return { ok: false, code: "not-configured", message: notConfiguredMessage() };
  }
  try {
    const result = await generateText({
      model: createQiniuModel(resolveModel()),
      system: input.system,
      prompt: input.prompt,
      output: Output.object({ schema: reportSchema }),
      timeout: { totalMs: ANALYZE_TIMEOUT_MS },
    });
    return { ok: true, similar: result.output.similar, conflict: result.output.conflict };
  } catch (e) {
    const mapped = mapLlmError(e);
    return { ok: false, code: mapped.code, message: mapped.message };
  }
}

export interface RunAnalyzeOptions {
  generate?: AnalyzeGenerate;
  allowLocalPath?: boolean | undefined;
}

export type AnalyzeFailureCode = "bad-usage" | "not-found" | "not-configured" | "analyze-failed";

export type AnalyzeOutcome =
  | { ok: true; target: string; similar: AnalyzeReportItem[]; conflict: AnalyzeReportItem[] }
  | { ok: false; code: AnalyzeFailureCode; message: string };

export async function performAnalyze(storeRoot: string, input: string, opts: RunAnalyzeOptions = {}): Promise<AnalyzeOutcome> {
  const needle = input.trim();
  if (needle === "") return { ok: false, code: "bad-usage", message: "需要 target(hash 前缀或 dirName)" };
  const records = await readStoreIndex(storeRoot);
  const hit = resolveSkill(needle, records);
  let target: { dirName: string; description: string } | null = null;
  if (hit.ok) {
    target = { dirName: hit.skill.dirName, description: hit.skill.meta.description };
  } else if (hit.code === "ambiguous") {
    return { ok: false, code: "bad-usage", message: hit.message };
  }
  if (target === null && opts.allowLocalPath === true) {
    const meta = await readSkillMeta(path.resolve(needle)).catch(() => null);
    if (meta !== null) target = { dirName: meta.name, description: meta.description };
  }
  if (target === null) {
    return {
      ok: false,
      code: "not-found",
      message: opts.allowLocalPath === true
        ? "找不到该 skill:既不是库存中的名字,也不是含 SKILL.md 的本地目录 — " + needle
        : "库存中没有: " + needle,
    };
  }

  const ctx = buildAnalyzeContext(records, target);
  const generate = opts.generate ?? defaultGenerate;
  const result = await generate({
    system: analyzeSystemPrompt(),
    prompt:
      "待评估 skill:\nname: " +
      ctx.targetName +
      "\ndescription: " +
      ctx.targetDescription +
      "\n\n库存对照:\n" +
      ctx.stock.map((s) => "- " + s.name + ": " + s.description).join("\n"),
  });
  if (!result.ok) {
    if (result.code === "not-configured") {
      return { ok: false, code: "not-configured", message: "未配置 QINIU_API_KEY,无法分析 — 请配置密钥后重试(不会编造结论)" };
    }
    return { ok: false, code: "analyze-failed", message: "分析调用失败(" + result.code + "): " + result.message };
  }
  return { ok: true, target: ctx.targetName, similar: result.similar, conflict: result.conflict };
}

export async function runAnalyze(args: AnalyzeArgs, opts: RunAnalyzeOptions = {}): Promise<void> {
  const input = args._.filter((p): p is string => typeof p === "string" && p.trim() !== "").join(" ").trim();
  if (input === "") {
    console.error("用法: skills-hub analyze <本地skill目录路径|库存skill名>");
    process.exitCode = 2;
    return;
  }
  const { resolveStoreRootOrFail } = await import("./store-cmds.js");
  const storeRoot = await resolveStoreRootOrFail(args, "analyze");
  if (storeRoot === null) return;

  const res = await performAnalyze(storeRoot, input, { ...opts, allowLocalPath: true });
  if (!res.ok) {
    const code = res.code === "not-found" ? "not-found" : res.code === "bad-usage" ? "bad-usage" : "analyze-failed";
    emitError(args.json === true, "analyze", code, res.message);
    return;
  }
  if (args.json) {
    emitOk("analyze", { target: res.target, similar: res.similar, conflict: res.conflict });
    return;
  }
  console.log("目标: " + res.target);
  console.log(res.similar.length === 0 ? "(未发现相近 skill)" : "相近:");
  for (const s of res.similar) console.log("  ~ " + s.name + " — " + s.reason);
  console.log(res.conflict.length === 0 ? "(未发现冲突)" : "可能冲突:");
  for (const c of res.conflict) console.log("  ! " + c.name + " — " + c.reason);
  console.log("(报告仅为建议,未做任何写操作)");
}
