/**
 * JSON 输出契约 v0(#28)——唯一实现口径见 docs/specs/json-contract-v0.md。
 * - 成功:stdout 输出 {ok:true, command, ...数据} 
 * - 失败:--json 下 stdout 输出 {ok:false, command, code, message},人类文本同时进 stderr,退出码 2
 */

export type JsonErrorCode =
  | "bad-usage"
  | "auth-required"
  | "store-not-configured"
  | "store-not-reachable"
  | "not-found"
  | "group-exists"
  | "group-not-found"
  | "group-empty"
  | "invalid-skill"
  | "link-failed"
  | "github-fetch-failed"
  | "analyze-failed"
  | "verify-failed"
  | "restore-failed"
  | "github-push-failed"
  | "remote-conflict"
  | "draft-exists"
  | "draft-not-found"
  | "draft-incomplete"
  | "io-error";

/** 失败信封:--json 输出到 stdout,人类文本进 stderr,退出码 2。 */
export function emitError(json: boolean, command: string, code: JsonErrorCode, message: string): void {
  if (json) console.log(JSON.stringify({ ok: false, command, code, message }));
  console.error(message);
  process.exitCode = 2;
}

/** 成功信封:{ok:true, command, ...数据}。 */
export function emitOk(command: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ ok: true, command, ...data }, null, 2));
}
