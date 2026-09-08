const ALLOWED_COMMANDS = new Set([
  'state',
  'api',
  'pay',
  'help',
]);

export const INTERACTIVE_COMMANDS = new Set([
  'clear',
  'skills',
  'install',
  'ai',
  'guide',
]);

export interface DesktopCommandValidation {
  allowed: boolean;
  normalized: string;
  reason?: string;
}

export function normalizeDesktopCommand(command: string): string {
  return command.trim().replace(/^hi\s+/, '').replace(/^--/, '').toLowerCase();
}

export function isAllowedDesktopCommand(command: string): boolean {
  return validateDesktopCommand(command).allowed;
}

export function validateDesktopCommand(command: string): DesktopCommandValidation {
  const normalized = normalizeDesktopCommand(command);
  const entrypoint = normalized.split(/\s+/)[0] || '';

  if (!entrypoint) {
    return { allowed: false, normalized, reason: 'Command is empty.' };
  }

  if (INTERACTIVE_COMMANDS.has(entrypoint)) {
    return {
      allowed: false,
      normalized,
      reason: `Interactive command blocked from IPC: ${entrypoint}. Use the native desktop panel instead.`,
    };
  }

  if (!ALLOWED_COMMANDS.has(entrypoint)) {
    return {
      allowed: false,
      normalized,
      reason: `Command not allowed: ${command}`,
    };
  }

  return { allowed: true, normalized };
}
