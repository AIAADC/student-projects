import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = 'C:/project/coding-cli/scripts/logs';

function ensureDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function filename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `clear-a-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.log`;
}

export interface AiRecommendation {
  pid: number;
  name: string;
  reason: string;
  safeToKill: boolean;
}

export interface KillResult {
  pid: number;
  name: string;
  success: boolean;
  error?: string;
}

export interface DriveScanResult {
  target: { name: string; path: string };
  fileCount: number;
  bytes: number;
}

export interface DriveRecommendation {
  path: string;
  name: string;
  sizeMB: number;
  reason: string;
  safeToDelete: boolean;
}

export interface DeleteResult {
  name: string;
  path: string;
  success: boolean;
  error?: string;
}

export class ClearLogger {
  private lines: string[] = [];
  private aiRaw?: string;

  constructor() {
    ensureDir();
    this.lines.push(`=== Clear-A Run: ${timestamp()} ===\n`);
  }

  scan(allCount: number, filteredCount: number): void {
    this.lines.push(`[SCAN] 共发现 ${allCount} 个进程，本地排除后剩余 ${filteredCount} 个进入 AI 判断\n`);
  }

  aiResponse(raw: string, recommendations: AiRecommendation[]): void {
    this.aiRaw = raw;
    this.lines.push(`[AI] 原始回复:\n${raw}\n`);
    this.lines.push(`[AI] 推荐终止 (${recommendations.length} 个):`);
    for (const r of recommendations) {
      this.lines.push(`  - ${r.name} (PID ${r.pid}): ${r.reason}`);
    }
    this.lines.push('');
  }

  userConfirm(selected: AiRecommendation[]): void {
    this.lines.push(`[USER] 确认终止 (${selected.length} 个):`);
    for (const s of selected) {
      this.lines.push(`  - ${s.name} (PID ${s.pid})`);
    }
    this.lines.push('');
  }

  killResults(results: KillResult[]): void {
    this.lines.push(`[KILL] 终止结果:`);
    for (const r of results) {
      if (r.success) {
        this.lines.push(`  ✓ ${r.name} (PID ${r.pid})`);
      } else {
        this.lines.push(`  ✗ ${r.name} (PID ${r.pid}) - ${r.error || '失败'}`);
      }
    }
    this.lines.push('');
  }

  driveScan(results: DriveScanResult[]): void {
    const totalBytes = results.reduce((s, r) => s + r.bytes, 0);
    const totalFiles = results.reduce((s, r) => s + r.fileCount, 0);
    this.lines.push(`[DRIVE SCAN] 发现 ${results.length} 个可扫描目录，${totalFiles} 个文件，${(totalBytes / 1024 / 1024).toFixed(1)}MB`);
    for (const r of results) {
      this.lines.push(`  - ${r.target.name}: ${r.fileCount} files, ${(r.bytes / 1024 / 1024).toFixed(1)}MB`);
    }
    this.lines.push('');
  }

  driveAiResponse(raw: string, recommendations: DriveRecommendation[]): void {
    this.aiRaw = raw;
    this.lines.push(`[DRIVE AI] 原始回复:\n${raw}\n`);
    this.lines.push(`[DRIVE AI] 推荐清理 (${recommendations.length} 个):`);
    for (const r of recommendations) {
      this.lines.push(`  - ${r.name} (${r.path}): ${r.reason}`);
    }
    this.lines.push('');
  }

  driveUserConfirm(selected: DriveRecommendation[]): void {
    this.lines.push(`[USER] 确认清理 (${selected.length} 个):`);
    for (const s of selected) {
      this.lines.push(`  - ${s.name} (${s.path})`);
    }
    this.lines.push('');
  }

  driveDeleteResults(results: DeleteResult[]): void {
    this.lines.push(`[DELETE] 清理结果:`);
    for (const r of results) {
      if (r.success) {
        this.lines.push(`  ✓ ${r.name}`);
      } else {
        this.lines.push(`  ✗ ${r.name} - ${r.error || '失败'}`);
      }
    }
    this.lines.push('');
  }

  save(): void {
    const content = this.lines.join('\n') + '\n';
    const fp = path.join(LOG_DIR, filename());
    fs.writeFileSync(fp, content, 'utf-8');
  }

  getLogPath(): string {
    return path.join(LOG_DIR, filename());
  }

  getAiRaw(): string | undefined {
    return this.aiRaw;
  }
}
