import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { exec } from 'child_process';
import { chatComplete } from '../../chat/provider';
import { getModelById, DEFAULT_MODEL_ID } from '../../chat/models';
import { ClearLogger } from './logger';
import { DRIVE_SYSTEM_PROMPT } from './drive-prompt';
import { getAggressiveTargets, getConservativeTargets, type ScanTarget } from './drive-targets';

interface ScanResult {
  target: ScanTarget;
  fileCount: number;
  bytes: number;
}

interface DriveRecommendation {
  path: string;
  name: string;
  sizeMB: number;
  reason: string;
  safeToDelete: boolean;
}

interface DeleteResult {
  name: string;
  path: string;
  success: boolean;
  error?: string;
}

function createReadline(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, q: string): Promise<string> {
  return new Promise((r) => rl.question(q, r));
}

function scanTarget(target: ScanTarget): ScanResult {
  if (!target.path || !fs.existsSync(target.path)) {
    return { target, fileCount: 0, bytes: 0 };
  }

  let fileCount = 0;
  let bytes = 0;

  function walk(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else {
          try {
            const stat = fs.statSync(fullPath);
            fileCount++;
            bytes += stat.size;
          } catch { /* skip unreadable files */ }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  walk(target.path);
  return { target, fileCount, bytes };
}

async function aiAnalyzeDrive(results: ScanResult[]): Promise<{ recommendations: DriveRecommendation[]; raw: string }> {
  const model = getModelById(DEFAULT_MODEL_ID);
  if (!model) return { recommendations: [], raw: '' };

  const rows = results
    .filter((r) => r.bytes > 0)
    .map((r) => `| ${r.target.name} | ${r.target.path} | ${r.fileCount} | ${(r.bytes / 1024 / 1024).toFixed(1)}MB |`)
    .join('\n');

  const userMsg = [
    '以下是目前扫描到的 C 盘可回收目录列表：',
    '',
    '| 目录名称 | 路径 | 文件数 | 大小 |',
    '|----------|------|--------|------|',
    rows,
    '',
    '请分析并返回 JSON 格式的推荐清理列表。',
  ].join('\n');

  try {
    const raw = await chatComplete(
      [
        { role: 'system', content: DRIVE_SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      model
    );

    let jsonStr = raw.trim();
    const codeBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) jsonStr = codeBlock[1].trim();

    const parsed = JSON.parse(jsonStr);
    const recs: DriveRecommendation[] = (parsed.recommendations || [])
      .filter((r: any) => r.safeToDelete === true)
      .map((r: any) => ({
        path: String(r.path || ''),
        name: String(r.name || ''),
        sizeMB: Number(r.sizeMB) || 0,
        reason: String(r.reason || ''),
        safeToDelete: true,
      }))
      .filter((r: DriveRecommendation) => results.some((res) => res.target.path === r.path));

    return { recommendations: recs, raw };
  } catch {
    return { recommendations: [], raw: '' };
  }
}

function deleteTarget(targetPath: string): Promise<DeleteResult> {
  return new Promise((resolve) => {
    const name = path.basename(targetPath);
    if (!fs.existsSync(targetPath)) {
      resolve({ name, path: targetPath, success: false, error: '路径不存在' });
      return;
    }
    exec(`powershell -NoProfile -Command "Remove-Item -LiteralPath '${targetPath}' -Recurse -Force -ErrorAction SilentlyContinue"`, { windowsHide: true, timeout: 30000 }, (error) => {
      if (error) {
        resolve({ name, path: targetPath, success: false, error: error.message });
      } else {
        resolve({ name, path: targetPath, success: true });
      }
    });
  });
}

function clearRecycleBin(): Promise<DeleteResult> {
  return new Promise((resolve) => {
    exec('powershell -NoProfile -Command "Clear-RecycleBin -DriveLetter C -Force -ErrorAction SilentlyContinue"', { windowsHide: true, timeout: 15000 }, (error) => {
      if (error) {
        resolve({ name: 'Recycle Bin (C:)', path: 'C:\\$Recycle.Bin', success: false, error: error.message });
      } else {
        resolve({ name: 'Recycle Bin (C:)', path: 'C:\\$Recycle.Bin', success: true });
      }
    });
  });
}

export async function runClearDrive(): Promise<void> {
  console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║            🧹 Clear Drive: AI 辅助 C 盘清理                  ║'));
  console.log(chalk.bold.cyan('╚══════════════════════════════════════════════════════════════╝'));
  console.log(chalk.gray('  源代码来自乐事学长\n'));

  if (process.platform !== 'win32') {
    console.log(chalk.yellow('  此功能仅支持 Windows 系统\n'));
    return;
  }

  const log = new ClearLogger();

  // 1. Mode selection
  const rl = createReadline();
  console.log(chalk.bold('  选择清理模式：'));
  console.log(chalk.gray('  1. Conservative - 仅高安全性临时/缓存目录'));
  console.log(chalk.gray('  2. Aggressive   - 保守模式 + 着色器缓存/转储文件'));
  const modeInput = (await ask(rl, chalk.cyan('\n  输入 1 或 2（回车默认 1）: '))).trim();
  const aggressive = modeInput === '2';
  console.log('');

  // 2. Scan
  console.log(chalk.gray('  扫描目标目录...'));
  let targets = getConservativeTargets();
  if (aggressive) {
    targets = targets.concat(getAggressiveTargets());
  }

  const results = targets.map(scanTarget).filter((r) => r.bytes > 0);
  log.driveScan(results);

  const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
  const totalFiles = results.reduce((sum, r) => sum + r.fileCount, 0);
  console.log(chalk.gray(`  发现 ${results.length} 个可扫描目录，共 ${totalFiles} 个文件，${(totalBytes / 1024 / 1024).toFixed(1)}MB\n`));

  if (results.length === 0) {
    console.log(chalk.green('  ✅ 未发现可清理的目录\n'));
    rl.close();
    log.save();
    return;
  }

  // 3. AI analyze
  console.log(chalk.gray('  正在请求 AI 分析...'));
  const { recommendations: aiRecs, raw } = await aiAnalyzeDrive(results);
  log.driveAiResponse(raw, aiRecs);

  if (aiRecs.length === 0) {
    console.log(chalk.green('\n  ✅ AI 未发现可安全清理的目录\n'));
    rl.close();
    log.save();
    return;
  }

  // 4. Display
  console.log(chalk.bold.cyan('\n  🤖 AI 建议清理以下目录：\n'));
  console.log(chalk.gray('  ' + '─'.repeat(72)));
  aiRecs.forEach((rec, i) => {
    console.log(chalk.cyan(`  [${i + 1}] ${rec.name}`) + chalk.gray(` (${rec.sizeMB}MB)`));
    console.log(chalk.white(`      ${rec.reason}`));
    console.log(chalk.gray(`      ${rec.path}`));
  });
  console.log(chalk.gray('  ' + '─'.repeat(72) + '\n'));

  // 5. Confirm
  const input = (await ask(rl, chalk.cyan('  输入编号确认清理（逗号分隔，如 1,3），回车取消: '))).trim();
  rl.close();

  if (!input) {
    console.log(chalk.gray('\n  已取消\n'));
    log.driveUserConfirm([]);
    log.save();
    return;
  }

  const selected = parseSelections(input, aiRecs);
  log.driveUserConfirm(selected);

  if (selected.length === 0) {
    console.log(chalk.yellow('\n  无效选择，已取消\n'));
    log.save();
    return;
  }

  // 6. Delete
  console.log(chalk.gray('\n  正在清理...\n'));
  const deleteResults: DeleteResult[] = [];
  for (const s of selected) {
    const res = await deleteTarget(s.path);
    deleteResults.push(res);
  }

  // 7. Recycle bin
  const recycleResult = await clearRecycleBin();
  deleteResults.push(recycleResult);

  log.driveDeleteResults(deleteResults);

  // 8. Report
  console.log(chalk.bold.cyan('\n  📋 清理汇报\n'));
  const success = deleteResults.filter((r) => r.success);
  const failed = deleteResults.filter((r) => !r.success);

  if (success.length > 0) {
    console.log(chalk.green(`  ✓ 成功清理 ${success.length} 个项目：`));
    success.forEach((r) => {
      const rec = aiRecs.find((a) => a.path === r.path);
      console.log(chalk.white(`    - ${r.name}`));
      if (rec) console.log(chalk.gray(`      ${rec.reason}`));
    });
  }

  if (failed.length > 0) {
    console.log(chalk.red(`\n  ✗ 清理失败 ${failed.length} 个：`));
    failed.forEach((r) => {
      console.log(chalk.white(`    - ${r.name}`) + chalk.gray(`: ${r.error}`));
    });
  }

  log.save();
  console.log(chalk.gray(`\n  📝 日志已保存: ${log.getLogPath()}\n`));
}

function parseSelections(input: string, recs: DriveRecommendation[]): DriveRecommendation[] {
  const indices = input
    .split(/[,，]/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= recs.length);
  return indices.map((i) => recs[i - 1]).filter(Boolean);
}
