import { exec, execFile } from 'child_process';

export interface DesktopClearProcess {
  pid: number;
  name: string;
  memoryMB: number;
  cpuSeconds: number;
  path?: string;
  windowTitle?: string;
  reason: string;
  selected?: boolean;
}

export interface DesktopClearScanResult {
  ok: boolean;
  processes: DesktopClearProcess[];
  total: number;
  filtered: number;
  output: string;
}

export interface DesktopClearKillRequest {
  pids: number[];
  confirm?: boolean;
}

export interface DesktopClearKillResult {
  ok: boolean;
  output: string;
  results?: { pid: number; success: boolean; error?: string }[];
  requiresConfirmation?: boolean;
}

const SYSTEM_PROCS = new Set([
  'csrss', 'smss', 'services', 'lsass', 'svchost', 'wininit', 'winlogon',
  'system', 'registry', 'memorycompression', 'fontdrvhost', 'dwm',
  'searchindexer', 'sihost', 'taskhostw', 'runtimebroker', 'shellexperiencehost',
  'startmenuexperiencehost', 'searchapp', 'securityhealthsystray',
  'applicationframemodel', 'textinputhost', 'videoui', 'audiodg',
  'spoolsv', 'wlanext', 'conhost', 'dllhost', 'msteamsupdate',
  'onedrive', 'dropbox', 'googledrivesync', 'steam', 'discord',
]);

const PROTECTED_APPS = new Set([
  'code', 'cursor', 'chrome', 'msedge', 'firefox', 'slack', 'notion',
  'obsidian', 'terminal', 'windowsterminal', 'wt', 'spotify',
  'wechat', 'qq', 'tim', 'dingtalk', 'feishu', 'lark',
]);

function normalize(name: string): string {
  return name.toLowerCase().replace(/\.exe$/, '').replace(/[-_\s.]/g, '');
}

function isVisibleWindow(title?: string): boolean {
  if (!title || title.trim().length === 0) return false;
  return !/^(\s*|Notification Area|System Tray)$/i.test(title);
}

function describeCandidate(item: Omit<DesktopClearProcess, 'reason'>): string {
  if (item.memoryMB >= 500) return `High memory background process (${item.memoryMB.toFixed(1)} MB).`;
  if (item.cpuSeconds >= 120) return `Long-running background process (${item.cpuSeconds.toFixed(1)} CPU seconds).`;
  return 'Background process without a visible app window.';
}

function parsePowerShellProcess(value: unknown): Omit<DesktopClearProcess, 'reason'>[] {
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .filter((item) => typeof item.Id === 'number')
    .map((item) => ({
      name: String(item.Name || ''),
      pid: Number(item.Id),
      memoryMB: Number(item.MemoryMB) || 0,
      cpuSeconds: Number(item.CPUS) || 0,
      path: item.Path ? String(item.Path) : undefined,
      windowTitle: item.MainWindowTitle ? String(item.MainWindowTitle) : undefined,
      selected: false,
    }));
}

function scanRawProcesses(): Promise<Omit<DesktopClearProcess, 'reason'>[]> {
  return new Promise((resolve) => {
    const psCmd = "Get-Process | Select-Object Name, Id, @{N='MemoryMB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, @{N='CPUS';E={[math]::Round($_.CPU,1)}}, Path, MainWindowTitle | ConvertTo-Json -Compress -Depth 1";
    exec(`powershell -NoProfile -Command "${psCmd}"`, { encoding: 'utf-8', timeout: 15000, windowsHide: true }, (error, stdout) => {
      if (error || !stdout) {
        resolve([]);
        return;
      }
      try {
        resolve(parsePowerShellProcess(JSON.parse(stdout.trim())));
      } catch {
        resolve([]);
      }
    });
  });
}

export async function scanDesktopClearProcesses(): Promise<DesktopClearScanResult> {
  const all = await scanRawProcesses();
  const processes = all
    .filter((item) => {
      const name = normalize(item.name);
      if (!Number.isInteger(item.pid) || item.pid <= 0) return false;
      if (item.pid === process.pid) return false;
      if (SYSTEM_PROCS.has(name)) return false;
      if (PROTECTED_APPS.has(name)) return false;
      if (isVisibleWindow(item.windowTitle)) return false;
      return true;
    })
    .map((item) => ({ ...item, reason: describeCandidate(item) }))
    .sort((a, b) => b.memoryMB - a.memoryMB)
    .slice(0, 24);

  return {
    ok: true,
    processes,
    total: all.length,
    filtered: processes.length,
    output: processes.length
      ? `Found ${processes.length} background process candidates. Select PIDs and confirm before ending them.`
      : 'No safe background process candidates were found.',
  };
}

function killPid(pid: number): Promise<{ pid: number; success: boolean; error?: string }> {
  return new Promise((resolve) => {
    execFile('taskkill', ['/PID', String(pid), '/F'], { encoding: 'utf-8', timeout: 10000, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve({ pid, success: false, error: stderr || stdout || error.message });
        return;
      }
      resolve({ pid, success: true });
    });
  });
}

export async function killDesktopClearProcesses(request: DesktopClearKillRequest): Promise<DesktopClearKillResult> {
  const uniquePids = [...new Set((request.pids || []).filter((pid) => Number.isInteger(pid) && pid > 0))];
  if (request.confirm !== true) {
    return {
      ok: false,
      requiresConfirmation: true,
      output: 'Confirm before ending selected processes.',
    };
  }
  if (uniquePids.length === 0) {
    return { ok: false, output: 'Choose at least one process.' };
  }

  const results = await Promise.all(uniquePids.map((pid) => killPid(pid)));
  const successCount = results.filter((item) => item.success).length;
  return {
    ok: successCount === results.length,
    results,
    output: `Ended ${successCount}/${results.length} selected processes.`,
  };
}
