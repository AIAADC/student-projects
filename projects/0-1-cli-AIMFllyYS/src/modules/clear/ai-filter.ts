import { chatComplete } from '../../chat/provider';
import { ProcessInfo } from './scan';
import { AiRecommendation } from './logger';
import { getModelById, DEFAULT_MODEL_ID } from '../../chat/models';

const SYSTEM_PROMPT = `你是 Windows 系统清理助手。用户会给你当前运行的进程列表，请分析哪些是"无用的后台残留进程"。

特别关注：
1. orphaned Node.js 进程（没有终端窗口关联）
2. orphaned Python 进程（无窗口、命令行像是脚本运行完的残留）
3. 高内存占用但没有可见窗口的程序
4. 开发工具残留（旧的编译器、构建工具、热重载进程等）

必须排除的进程（不要推荐终止）：
- Windows 系统关键进程（explorer, dwm, csrss, svchost, lsass 等）
- 用户正在活跃使用的程序（有窗口标题且不是后台服务的）
- 浏览器、杀毒软件、系统托盘程序
- 名称包含 explorer, dwm, fontdrvhost, csrss, winlogon 等系统进程

只返回 JSON，不要任何其他文字解释。格式：
{
  "recommendations": [
    {"pid": 1234, "name": "node.exe", "reason": "无窗口的构建残留，占用 400MB", "safeToKill": true}
  ]
}`;

function buildUserMessage(procs: ProcessInfo[]): string {
  const rows = procs.map(p => {
    const wt = p.windowTitle ? ` | 窗口: ${p.windowTitle}` : '';
    const pt = p.path ? ` | 路径: ${p.path}` : '';
    return `| ${p.pid} | ${p.name} | ${p.memoryMB}MB | ${p.cpuSeconds}s${wt}${pt} |`;
  }).join('\n');

  return [
    '以下是目前运行的进程列表（已通过本地规则过滤掉系统进程）：',
    '',
    '| PID | 名称 | 内存 | CPU时间 |',
    '|-----|------|------|---------|',
    rows,
    '',
    '请分析并返回 JSON 格式的推荐终止列表。',
  ].join('\n');
}

/**
 * Send filtered process list to AI and get kill recommendations.
 */
export async function aiFilterProcesses(procs: ProcessInfo[]): Promise<{ recommendations: AiRecommendation[]; raw: string }> {
  const model = getModelById(DEFAULT_MODEL_ID);
  if (!model) {
    return { recommendations: [], raw: '' };
  }

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: buildUserMessage(procs) },
  ];

  try {
    const raw = await chatComplete(messages, model);

    // Try to extract JSON from markdown code block or raw text
    let jsonStr = raw.trim();
    const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) {
      jsonStr = codeBlock[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    const recs: AiRecommendation[] = (parsed.recommendations || [])
      .filter((r: any) => r.safeToKill === true)
      .map((r: any) => ({
        pid: Number(r.pid),
        name: String(r.name || ''),
        reason: String(r.reason || ''),
        safeToKill: true,
      }))
      .filter((r: AiRecommendation) => procs.some(p => p.pid === r.pid));

    return { recommendations: recs, raw };
  } catch {
    return { recommendations: [], raw: '' };
  }
}
