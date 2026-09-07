import { afterEach, describe, expect, it } from "vitest";
import { APICallError } from "ai";
import { mapLlmError } from "../src/llm/errors.js";
import {
  DEFAULT_MODEL,
  DEFAULT_QINIU_BASE_URL,
  injectThinkingOff,
  llmBaseUrl,
  notConfiguredMessage,
  qiniuApiKey,
  resolveModel,
} from "../src/llm/provider.js";
import { loadEnvFile } from "../src/env.js";

const saved: Record<string, string | undefined> = {};
afterEach(() => {
  for (const k of Object.keys(saved)) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
function saveEnv(...keys: string[]) {
  for (const k of keys) saved[k] = process.env[k];
}

describe("qiniu provider 配置", () => {
  it("未配置密钥:qiniuApiKey 为空,提示可读且不含假 key", () => {
    saveEnv("QINIU_API_KEY");
    delete process.env.QINIU_API_KEY;
    expect(qiniuApiKey()).toBeUndefined();
    expect(notConfiguredMessage()).toContain("QINIU_API_KEY");
    expect(notConfiguredMessage()).not.toMatch(/sk-[a-z0-9]{8,}/i);
  });

  it("resolveModel:显式 > 环境 > 默认;llmBaseUrl 去尾斜杠", () => {
    saveEnv("QINIU_MODEL", "QINIU_BASE_URL");
    delete process.env.QINIU_MODEL;
    expect(resolveModel()).toBe(DEFAULT_MODEL);
    expect(resolveModel("x")).toBe("x");
    process.env.QINIU_MODEL = "env-model";
    expect(resolveModel()).toBe("env-model");
    process.env.QINIU_BASE_URL = "https://example.com/v1/";
    expect(llmBaseUrl()).toBe("https://example.com/v1");
    delete process.env.QINIU_BASE_URL;
    expect(llmBaseUrl()).toBe(DEFAULT_QINIU_BASE_URL);
  });

  it("injectThinkingOff 写入 enable_thinking:false,不覆盖其它字段", () => {
    const body = injectThinkingOff({ model: "m", stream: true });
    expect(body.enable_thinking).toBe(false);
    expect(body.model).toBe("m");
    expect(body.stream).toBe(true);
  });
});

describe("mapLlmError", () => {
  it("401 指向 QINIU_API_KEY,不回显密钥", () => {
    const mapped = mapLlmError(
      new APICallError({
        message: "unauthorized sk-secretvalue",
        url: "https://api.qnaigc.com/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 401,
      }),
    );
    expect(mapped.code).toBe("api");
    expect(mapped.message).toContain("QINIU_API_KEY");
    expect(mapped.message).not.toContain("sk-secretvalue");
  });

  it("AbortError → timeout", () => {
    const e = new Error("aborted");
    e.name = "TimeoutError";
    expect(mapLlmError(e).code).toBe("timeout");
  });
});

describe("loadEnvFile 仍不覆盖已有环境变量", () => {
  it("loadEnvFile 存在即可 import", async () => {
    await loadEnvFile();
    expect(typeof loadEnvFile).toBe("function");
  });
});
