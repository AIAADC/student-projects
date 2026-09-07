import * as readline from 'readline';

export interface ParsedKeystroke {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export type SlashPromptKeyAction =
  | { action: 'dismiss-suggestions' }
  | { action: 'move-selection'; delta: -1 | 1 }
  | { action: 'complete-selection' }
  | { action: 'complete-mid-input' }
  | { action: 'complete-path' }
  | { action: 'submit' }
  | { action: 'backspace' }
  | { action: 'insert'; value: string }
  | { action: 'none' };

export function parseKeystroke(input: string): ParsedKeystroke {
  const parts = input.split('+');
  const keystroke: ParsedKeystroke = {
    key: '',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  };

  for (const part of parts) {
    const lower = part.toLowerCase();
    switch (lower) {
      case 'ctrl':
      case 'control':
        keystroke.ctrl = true;
        break;
      case 'alt':
      case 'opt':
      case 'option':
        keystroke.alt = true;
        break;
      case 'shift':
        keystroke.shift = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
      case 'super':
      case 'win':
        keystroke.meta = true;
        break;
      case 'esc':
        keystroke.key = 'escape';
        break;
      case 'return':
        keystroke.key = 'enter';
        break;
      case 'space':
        keystroke.key = ' ';
        break;
      default:
        keystroke.key = lower;
        break;
    }
  }

  return keystroke;
}

export function keystrokeToString(keystroke: ParsedKeystroke): string {
  const parts: string[] = [];
  if (keystroke.ctrl) parts.push('ctrl');
  if (keystroke.alt) parts.push('alt');
  if (keystroke.shift) parts.push('shift');
  if (keystroke.meta) parts.push('meta');
  parts.push(keystroke.key);
  return parts.join('+');
}

function keyNameFromReadline(str: string | undefined, key: readline.Key): string | null {
  if (key.name === 'escape') return 'escape';
  if (key.name === 'return') return 'enter';
  if (key.name === 'tab') return 'tab';
  if (key.name === 'backspace') return 'backspace';
  if (key.name === 'up') return 'up';
  if (key.name === 'down') return 'down';
  if (key.name === 'left') return 'left';
  if (key.name === 'right') return 'right';
  if (str && str.length === 1) return str.toLowerCase();
  return key.name || null;
}

export type OverlayDismissKeyAction =
  | { action: 'dismiss-overlay' }
  | { action: 'none' };

export function resolveOverlayDismissKeyAction(
  str: string | undefined,
  key: readline.Key,
  overlayActive: boolean,
): OverlayDismissKeyAction {
  if (!overlayActive) return { action: 'none' };
  const name = keyNameFromReadline(str, key);
  if (name === 'escape') return { action: 'dismiss-overlay' };
  if (key.ctrl && name === 'c') return { action: 'dismiss-overlay' };
  return { action: 'none' };
}

export function isGlobalInterruptKey(str: string | undefined, key: readline.Key): boolean {
  const name = keyNameFromReadline(str, key);
  return (key.ctrl && name === 'c') || name === 'escape';
}

export function resolveSlashPromptKeyAction(
  str: string | undefined,
  key: readline.Key,
  suggestionsActive: boolean,
): SlashPromptKeyAction {
  const name = keyNameFromReadline(str, key);
  const overlayDismiss = resolveOverlayDismissKeyAction(str, key, suggestionsActive);
  if (overlayDismiss.action === 'dismiss-overlay') return { action: 'dismiss-suggestions' };

  if (suggestionsActive && key.ctrl && name === 'c') return { action: 'dismiss-suggestions' };
  if (suggestionsActive && name === 'escape') return { action: 'dismiss-suggestions' };
  if (suggestionsActive && (name === 'up' || (!key.ctrl && !key.meta && name === 'k'))) {
    return { action: 'move-selection', delta: -1 };
  }
  if (suggestionsActive && (name === 'down' || (!key.ctrl && !key.meta && name === 'j'))) {
    return { action: 'move-selection', delta: 1 };
  }
  if (name === 'tab' && key.shift && suggestionsActive) return { action: 'dismiss-suggestions' };
  if (name === 'tab' && suggestionsActive) return { action: 'complete-selection' };
  if (name === 'tab') return { action: 'complete-mid-input' };
  if (name === 'enter') return { action: 'submit' };
  if (name === 'backspace') return { action: 'backspace' };
  if (str && !key.ctrl && !key.meta) return { action: 'insert', value: str };
  return { action: 'none' };
}
