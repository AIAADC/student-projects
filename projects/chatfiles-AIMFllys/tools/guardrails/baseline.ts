import type { GuardrailBaseline } from './runner.js'

/**
 * 受控历史债 baseline：只允许这里逐条列出的现有问题。
 * 新问题会产生不同签名并失败；旧问题被修复后应删除对应条目。
 */
export const GUARDRAIL_BASELINE = {
  architecture: {
    allowedIssueSignatures: [
      'dependency-direction:scripts->server:scripts/e2e/agentDockAssertions.ts->server/routes/aiAgent.ts',
      'dependency-direction:scripts->server:scripts/e2e/chatLibrary.e2e.ts->server/app.ts',
      'dependency-direction:scripts->server:scripts/e2e/chatLibrary.e2e.ts->server/routes/wechat.ts',
      'dependency-direction:server->scripts:server/wechat/artifactSourceResolver.ts->scripts/localEnv.ts',
    ],
  },
  repository: {
    allowedReplacementSignatures: [],
    oversizedLineCaps: {
      'tools/sqlcipher-snapshot/main.c': 355,
    },
  },
} satisfies GuardrailBaseline
