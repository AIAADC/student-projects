import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { app } from 'electron';
import * as path from 'path';
import { validateDesktopCommand } from './permissions';

export interface CliRunResult {
  ok: boolean;
  output: string;
}

export type AiLaunchMode = 'chat' | 'agent' | 'plan';

export interface AiLaunchRequest {
  mode?: unknown;
}

export interface AiLaunchResult {
  ok: boolean;
  output: string;
}

const CLI_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 256_000;
const AI_LAUNCH_MODES = new Set<AiLaunchMode>(['chat', 'agent', 'plan']);

function resolveCliEntrypoint(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'dist', 'cli', 'index.js')
    : path.resolve(__dirname, '..', '..', '..', 'dist', 'index.js');
}

function resolveWorkspaceRoot(): string {
  return path.resolve(__dirname, '..', '..', '..');
}

export function resolveAiLaunchMode(value: unknown): AiLaunchMode {
  if (value === 'agent' || value === 'plan') return value;
  return 'chat';
}

function trimCliOutput(value: string): string {
  if (value.length <= MAX_OUTPUT_CHARS) return value;
  return `${value.slice(0, MAX_OUTPUT_CHARS)}\n\n[output truncated after ${MAX_OUTPUT_CHARS} characters]`;
}

export function runDesktopCli(command: string): Promise<CliRunResult> {
  const validation = validateDesktopCommand(command);
  if (!validation.allowed) {
    return Promise.resolve({ ok: false, output: validation.reason || `Command not allowed: ${command}` });
  }

  const [entrypoint, ...args] = validation.normalized.split(/\s+/).filter(Boolean);
  const cliPath = resolveCliEntrypoint();

  return new Promise((resolve) => {
    let settled = false;
    let output = '';
    let child: ChildProcessWithoutNullStreams | null = null;

    const finish = (result: CliRunResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      resolve({ ok: result.ok, output: trimCliOutput(result.output) });
    };

    child = spawn(process.execPath, [cliPath, `--${entrypoint}`, ...args], {
      cwd: resolveWorkspaceRoot(),
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });

    const timeoutHandle = setTimeout(() => {
      child?.kill();
      finish({
        ok: false,
        output: `${output}\n\nCommand timed out after ${Math.round(CLI_TIMEOUT_MS / 1000)} seconds.`,
      });
    }, CLI_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => { output += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { output += chunk.toString('utf8'); });
    child.on('error', (error) => finish({ ok: false, output: error.message }));
    child.on('close', (code) => finish({ ok: code === 0, output: output || (code === 0 ? 'Done.' : 'Command failed.') }));
  });
}

export function launchDesktopAiSession(request?: AiLaunchRequest): Promise<AiLaunchResult> {
  const mode = resolveAiLaunchMode(request?.mode);
  if (request?.mode !== undefined && !AI_LAUNCH_MODES.has(mode)) {
    return Promise.resolve({ ok: false, output: 'Invalid AI mode.' });
  }

  const cliPath = resolveCliEntrypoint();
  const cwd = resolveWorkspaceRoot();
  const launchEnv = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  const launchArgs = [cliPath, '--ai'];

  try {
    if (process.platform === 'win32') {
      spawn('cmd.exe', ['/c', 'start', 'My-CLI AI', 'cmd', '/k', process.execPath, ...launchArgs], {
        cwd,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        env: launchEnv,
      }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', ['-a', 'Terminal', process.execPath, '--args', ...launchArgs], {
        cwd,
        detached: true,
        stdio: 'ignore',
        env: launchEnv,
      }).unref();
    } else {
      spawn('x-terminal-emulator', ['-e', process.execPath, ...launchArgs], {
        cwd,
        detached: true,
        stdio: 'ignore',
        env: launchEnv,
      }).unref();
    }

    return Promise.resolve({
      ok: true,
      output: `Opened interactive AI session in terminal. Desktop mode: ${mode}. Use /${mode}, /chat, /agent, or /plan inside the CLI session.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to launch AI session.';
    return Promise.resolve({ ok: false, output: message });
  }
}
