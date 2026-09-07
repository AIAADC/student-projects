import { execFile } from 'child_process';
import { isDangerousPath, PermissionDecision, resolveExistingWorkspacePath, resolveWorkspacePath } from '../permissions/engine';

export type ShellCommandLevel = 'safe' | 'destructive' | 'catastrophic';

export interface ShellCommandClassification {
  level: ShellCommandLevel;
  warning: string | null;
}

interface DestructivePattern {
  test: (command: string, args: string[]) => boolean;
  level: ShellCommandLevel;
  warning: string;
}

const CATASTROPHIC_EXECUTABLES = new Set([
  'format-volume',
  'clear-disk',
  'stop-computer',
  'restart-computer',
]);

const CATASTROPHIC_PATH_TARGETS = [
  '/', '~', 'C:\\', 'C:\\Windows', 'C:\\Windows\\System32',
  '/etc', '/usr', '/bin', '/sbin', '/var', '/home',
  'C:\\Program Files', 'C:\\Program Files (x86)',
];

function normalizeCommand(command: string): string {
  const base = command.replace(/\\/g, '/').split('/').pop() || command;
  return base.replace(/\.exe$/i, '').toLowerCase();
}

function argsContain(args: string[], ...targets: string[]): boolean {
  const lower = args.map(a => a.toLowerCase());
  return targets.every(t => lower.some(a => a === t || a.startsWith(t + '=')));
}

function argsContainAny(args: string[], ...targets: string[]): boolean {
  const lower = args.map(a => a.toLowerCase());
  return targets.some(t => lower.some(a => a === t || a.startsWith(t)));
}

function hasDestructiveRemovalTarget(args: string[]): boolean {
  for (const arg of args) {
    if (arg.startsWith('-')) continue;
    const normalized = arg.replace(/\\/g, '/').replace(/\/+$/, '').replace(/^['"]|['"]$/g, '');
    for (const target of CATASTROPHIC_PATH_TARGETS) {
      const nt = target.replace(/\\/g, '/').replace(/\/+$/, '');
      if (normalized.toLowerCase() === nt.toLowerCase()) return true;
    }
  }
  return false;
}

const DESTRUCTIVE_PATTERNS: DestructivePattern[] = [
  {
    test: (cmd, args) => {
      const n = normalizeCommand(cmd);
      const isRemoval = ['remove-item', 'rm', 'del', 'rd', 'rmdir', 'ri'].includes(n);
      if (!isRemoval) return false;
      return hasDestructiveRemovalTarget(args);
    },
    level: 'catastrophic',
    warning: 'Removal targets a protected system path',
  },
  {
    test: (cmd) => CATASTROPHIC_EXECUTABLES.has(normalizeCommand(cmd)),
    level: 'catastrophic',
    warning: 'Command is catastrophic and always blocked',
  },
  {
    test: (cmd, args) => {
      const n = normalizeCommand(cmd);
      const isRemoval = ['remove-item', 'rm', 'del', 'rd', 'rmdir', 'ri'].includes(n);
      if (!isRemoval) return false;
      return argsContain(args, '-recurse') && argsContain(args, '-force');
    },
    level: 'destructive',
    warning: 'Note: may recursively force-remove files',
  },
  {
    test: (cmd, args) => {
      const n = normalizeCommand(cmd);
      const isRemoval = ['remove-item', 'rm', 'del', 'rd', 'rmdir', 'ri'].includes(n);
      if (!isRemoval) return false;
      if (argsContainAny(args, '-recurse')) return true;
      if (argsContainAny(args, '-rf', '-fr')) return true;
      return false;
    },
    level: 'destructive',
    warning: 'Note: may recursively remove files',
  },
  {
    test: (cmd, args) => {
      if (normalizeCommand(cmd) !== 'git') return false;
      return args[0] === 'reset' && argsContainAny(args, '--hard');
    },
    level: 'destructive',
    warning: 'Note: may discard uncommitted changes',
  },
  {
    test: (cmd, args) => {
      if (normalizeCommand(cmd) !== 'git') return false;
      return args[0] === 'push' && argsContainAny(args, '--force', '--force-with-lease', '-f');
    },
    level: 'destructive',
    warning: 'Note: may overwrite remote history',
  },
  {
    test: (cmd, args) => {
      if (normalizeCommand(cmd) !== 'git') return false;
      if (args[0] !== 'clean') return false;
      const hasDryRun = argsContainAny(args, '-n', '--dry-run');
      if (hasDryRun) return false;
      return argsContainAny(args, '-f', '-fd', '-fx', '-fxd', '-df', '-xf', '-xdf');
    },
    level: 'destructive',
    warning: 'Note: may permanently delete untracked files',
  },
  {
    test: (cmd, args) => {
      if (normalizeCommand(cmd) !== 'git') return false;
      return args[0] === 'stash' && (args[1] === 'drop' || args[1] === 'clear');
    },
    level: 'destructive',
    warning: 'Note: may permanently remove stashed changes',
  },
  {
    test: (cmd, args) => {
      const n = normalizeCommand(cmd);
      if (!['powershell', 'pwsh'].includes(n)) return false;
      const joined = args.join(' ').toLowerCase();
      return joined.includes('invoke-expression') || joined.includes('iex ');
    },
    level: 'destructive',
    warning: 'Note: Invoke-Expression can execute arbitrary code',
  },
  {
    test: (cmd, args) => {
      const n = normalizeCommand(cmd);
      if (!['powershell', 'pwsh'].includes(n)) return false;
      return argsContainAny(args, '-encodedcommand', '-e', '-enc');
    },
    level: 'destructive',
    warning: 'Note: encoded command parameters obscure intent',
  },
  {
    test: (cmd) => normalizeCommand(cmd) === 'clear-recyclebin',
    level: 'destructive',
    warning: 'Note: permanently deletes recycled files',
  },
];

export function classifyShellCommand(command: string, args: string[]): ShellCommandClassification {
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command, args)) {
      return { level: pattern.level, warning: pattern.warning };
    }
  }
  return { level: 'safe', warning: null };
}

export function getDestructiveCommandWarning(command: string, args: string[]): string | null {
  const classification = classifyShellCommand(command, args);
  return classification.warning;
}

export function runShellTool(input: {
  command: string;
  args?: string[];
  cwd: string;
  workspaceRoot: string;
  permissionDecision?: PermissionDecision;
}): Promise<string> {
  const args = input.args || [];
  const classification = classifyShellCommand(input.command, args);

  if (classification.level === 'catastrophic') {
    return Promise.resolve(`Error: command blocked — ${classification.warning}. This operation is catastrophic and cannot be approved.`);
  }

  if (input.permissionDecision?.decision !== 'allow') return Promise.resolve('Error: permission required');
  const cwd = resolveWorkspacePath(input.workspaceRoot, input.cwd);
  if (isDangerousPath(input.workspaceRoot, cwd)) return Promise.resolve('Error: cwd outside workspace');
  const realCwd = resolveExistingWorkspacePath(input.workspaceRoot, cwd);
  if (!realCwd) return Promise.resolve('Error: cwd outside workspace');
  return new Promise((resolve) => {
    execFile(input.command, args, { cwd: realCwd, encoding: 'utf8', timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        resolve('Error: ' + (stderr || error.message));
        return;
      }
      resolve(stdout || stderr || '');
    });
  });
}
