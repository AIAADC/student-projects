import { exec } from 'child_process';

export interface ProcessInfo {
  name: string;
  pid: number;
  memoryMB: number;
  cpuSeconds: number;
  path?: string;
  windowTitle?: string;
}

// System-critical processes that should NEVER be considered for killing
const SYSTEM_PROCS = new Set([
  'csrss', 'smss', 'services', 'lsass', 'svchost', 'wininit', 'winlogon',
  'system', 'registry', 'memory compression', 'fontdrvhost', 'dwm',
  'searchindexer', 'sihost', 'taskhostw', 'runtimebroker', 'shell_experience_host',
  'startmenuexperiencehost', 'searchapp', 'securityhealthsystray',
  'applicationframemodel', 'textinputhost', 'video.ui', 'audiodg',
  'spoolsv', 'wlanext', 'conhost', 'dllhost', 'msteamsupdate',
  'onedrive', 'dropbox', 'googledrivesync', 'steam', 'discord',
]);

// Protected well-known apps (user-facing, should not be killed)
const PROTECTED_APPS = new Set([
  'code', 'cursor', 'chrome', 'msedge', 'firefox', 'slack', 'notion',
  'obsidian', 'terminal', 'windows_terminal', 'wt', 'spotify',
  'wechat', 'qq', 'tim', 'dingtalk', 'feishu', 'lark',
]);

function normalize(name: string): string {
  return name.toLowerCase().replace(/\.exe$/, '').replace(/[-_]/g, '');
}

/**
 * Scan all running processes via PowerShell Get-Process.
 * Returns full list; filtering happens in filterLocal.
 */
export function scanProcesses(): Promise<ProcessInfo[]> {
  return new Promise((resolve) => {
    const psCmd = `Get-Process | Select-Object Name, Id, @{N='MemoryMB';E={[math]::Round($_.WorkingSet64/1MB,1)}}, @{N='CPUS';E={[math]::Round($_.CPU,1)}}, Path, MainWindowTitle | ConvertTo-Json -Compress -Depth 1`;

    exec(`powershell -NoProfile -Command "${psCmd}"`, { encoding: 'utf-8', timeout: 15000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const procs: ProcessInfo[] = list
          .filter((p: any) => p && typeof p.Id === 'number')
          .map((p: any) => ({
            name: String(p.Name || ''),
            pid: Number(p.Id),
            memoryMB: Number(p.MemoryMB) || 0,
            cpuSeconds: Number(p.CPUS) || 0,
            path: p.Path ? String(p.Path) : undefined,
            windowTitle: p.MainWindowTitle ? String(p.MainWindowTitle) : undefined,
          }));
        resolve(procs);
      } catch {
        resolve([]);
      }
    });
  });
}

/**
 * Local filter: remove system processes, protected apps, self, and user-active windowed apps.
 */
export function filterLocal(procs: ProcessInfo[], selfPid: number): ProcessInfo[] {
  return procs.filter(p => {
    const n = normalize(p.name);

    // Exclude self
    if (p.pid === selfPid) return false;

    // Exclude system-critical processes
    if (SYSTEM_PROCS.has(n)) return false;

    // Exclude protected user-facing apps
    if (PROTECTED_APPS.has(n)) return false;

    // Exclude processes with visible window titles (likely user-active)
    // But allow known background services even if they have a tray icon
    if (p.windowTitle && p.windowTitle.trim().length > 0) {
      // If window title looks like a real app window (not just tray), protect it
      const trayOnly = /^(\s*|Notification Area|System Tray)$/i.test(p.windowTitle);
      if (!trayOnly) return false;
    }

    return true;
  });
}
