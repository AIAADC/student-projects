import chalk from 'chalk';
import * as readline from 'readline';
import { scanProcesses, filterLocal } from './scan';
import { aiFilterProcesses } from './ai-filter';
import { killProcesses } from './kill';
import { ClearLogger, AiRecommendation } from './logger';

function createReadline(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((r) => rl.question(q, r));
}

export async function runClearProcess(): Promise<void> {
  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║          🧹 Clear Process: AI 辅助后台进程清理               ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════╝\n'));

  const log = new ClearLogger();

  // 1. Scan
  console.log(chalk.gray('  扫描进程中...'));
  const allProcs = await scanProcesses();
  if (allProcs.length === 0) {
    console.log(chalk.yellow('  未能获取进程列表，请确保 PowerShell 可用。'));
    return;
  }
  const filtered = filterLocal(allProcs, process.pid);
  log.scan(allProcs.length, filtered.length);
  console.log(chalk.gray(`  发现 ${allProcs.length} 个进程，本地排除后剩余 ${filtered.length} 个\n`));

  // 2. AI filter
  console.log(chalk.gray('  正在请求 AI 分析...'));
  const { recommendations: aiRecs, raw } = await aiFilterProcesses(filtered);
  log.aiResponse(raw, aiRecs);

  if (aiRecs.length === 0) {
    console.log(chalk.green('\n  ✅ 未发现可清理的无用后台进程\n'));
    log.save();
    return;
  }

  // 3. Display table with AI interpretations
  console.log(chalk.bold.cyan('\n  🤖 AI 建议终止以下进程：\n'));
  console.log(chalk.gray('  ' + '─'.repeat(72)));
  aiRecs.forEach((rec, i) => {
    const mem = filtered.find(p => p.pid === rec.pid)?.memoryMB || 0;
    console.log(chalk.cyan(`  [${i + 1}] ${rec.name}`) + chalk.gray(` (PID ${rec.pid}, ${mem}MB)`));
    console.log(chalk.white(`      ${rec.reason}`));
  });
  console.log(chalk.gray('  ' + '─'.repeat(72) + '\n'));

  // 4. Interactive confirm
  const rl = createReadline();
  const input = (await ask(rl, chalk.cyan('  输入编号确认终止（逗号分隔，如 1,3），回车取消: '))).trim();
  rl.close();

  if (!input) {
    console.log(chalk.gray('\n  已取消\n'));
    log.userConfirm([]);
    log.save();
    return;
  }

  const selected = parseSelections(input, aiRecs);
  log.userConfirm(selected);

  if (selected.length === 0) {
    console.log(chalk.yellow('\n  无效选择，已取消\n'));
    log.save();
    return;
  }

  // 5. Kill
  console.log(chalk.gray('\n  正在终止进程...\n'));
  const results = await killProcesses(selected.map(s => ({ pid: s.pid, name: s.name })));
  log.killResults(results);

  // 6. Report
  console.log(chalk.bold.cyan('\n  📋 清理汇报\n'));
  const killed = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  if (killed.length > 0) {
    console.log(chalk.green(`  ✓ 成功终止 ${killed.length} 个进程：`));
    killed.forEach(r => {
      const rec = aiRecs.find(a => a.pid === r.pid);
      console.log(chalk.white(`    - ${r.name} (PID ${r.pid})`));
      if (rec) console.log(chalk.gray(`      ${rec.reason}`));
    });
  }

  if (failed.length > 0) {
    console.log(chalk.red(`\n  ✗ 终止失败 ${failed.length} 个：`));
    failed.forEach(r => {
      console.log(chalk.white(`    - ${r.name} (PID ${r.pid})`) + chalk.gray(`: ${r.error}`));
    });
  }

  // 7. Log path
  log.save();
  console.log(chalk.gray(`\n  📝 日志已保存: ${log.getLogPath()}\n`));
}

function parseSelections(input: string, recs: AiRecommendation[]): AiRecommendation[] {
  const indices = input
    .split(/[,，]/)
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n >= 1 && n <= recs.length);
  return indices.map(i => recs[i - 1]).filter(Boolean);
}
