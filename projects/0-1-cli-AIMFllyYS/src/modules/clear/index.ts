import { runClearProcess } from './process';
import { runClearDrive } from './drive';

export async function runClear(type: 'process' | 'drive' | 'all'): Promise<void> {
  if (type === 'process' || type === 'all') {
    await runClearProcess();
  }
  if (type === 'drive' || type === 'all') {
    await runClearDrive();
  }
}

export { runClearProcess, runClearDrive };
