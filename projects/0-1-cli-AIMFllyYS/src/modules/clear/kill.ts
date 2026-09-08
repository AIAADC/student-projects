import { exec } from 'child_process';
import { KillResult } from './logger';

/**
 * Kill a list of processes by PID using taskkill (Windows).
 */
export function killProcesses(pids: Array<{ pid: number; name: string }>): Promise<KillResult[]> {
  return Promise.all(
    pids.map(
      (p) =>
        new Promise<KillResult>((resolve) => {
          exec(`taskkill /PID ${p.pid} /F`, { windowsHide: true, timeout: 10000 }, (error, stdout, stderr) => {
            if (error) {
              resolve({
                pid: p.pid,
                name: p.name,
                success: false,
                error: (stderr || error.message).trim(),
              });
            } else {
              resolve({ pid: p.pid, name: p.name, success: true });
            }
          });
        })
    )
  );
}
