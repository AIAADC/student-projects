import chalk from 'chalk';
import { glyphs } from '../terminal-ui';

export const UI_WIDTH = 64;
export const PANEL_WIDTH = 48;
export const INDENT = '  ';
export const MAX_VISIBLE_WIDTH = UI_WIDTH + INDENT.length;

let colorEnabled = !process.env.NO_COLOR;

export function setColorEnabled(enabled: boolean): void {
  colorEnabled = enabled;
}

export function isColorEnabled(): boolean {
  return colorEnabled;
}

function paint(style: chalk.Chalk, value: string): string {
  return colorEnabled && chalk.level > 0 ? style(value) : value;
}

export const ui = {
  // Claude Code brand orange rgb(215,119,87) and blue-purple accent rgb(177,185,249).
  brand: (value: string) => paint(chalk.hex('#d77757'), value),
  accent: (value: string) => paint(chalk.hex('#b1b9f9'), value),
  muted: (value: string) => paint(chalk.gray, value),
  warning: (value: string) => paint(chalk.yellow, value),
  danger: (value: string) => paint(chalk.red, value),
  success: (value: string) => paint(chalk.green, value),
  strong: (value: string) => paint(chalk.bold.white, value),
  code: (value: string) => paint(chalk.green, value),
  link: (value: string) => paint(chalk.blue.underline, value),
  h1: (value: string) => paint(chalk.bold.cyan, value),
  h2: (value: string) => paint(chalk.bold.magenta, value),
  h3: (value: string) => paint(chalk.bold.yellow, value),
  italic: (value: string) => paint(chalk.italic, value),
  inlineCode: (value: string) => (colorEnabled && chalk.level > 0 ? chalk.bgGray.white(` ${value} `) : ` ${value} `),
  // Claude Code renders codespans with a single accent color (no background box).
  inlineCodeFlat: (value: string) => paint(chalk.hex('#b1b9f9'), value),
  strike: (value: string) => paint(chalk.strikethrough.gray, value),
};

function charVisibleWidth(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code <= 0xff) return 1;
  if (code >= 0x2500 && code <= 0x257f) return 1;
  if (code === 0x25c6 || code === 0x25c7 || code === 0x2022) return 1;
  return 2;
}

export function visibleLength(value: string): number {
  const clean = value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
  let width = 0;
  for (const char of clean) {
    width += charVisibleWidth(char);
  }
  return width;
}

export function truncateVisible(value: string, maxWidth: number): string {
  if (visibleLength(value) <= maxWidth) return value;
  const ellipsis = '…';
  const ellipsisWidth = visibleLength(ellipsis);
  if (maxWidth <= ellipsisWidth) return ellipsis.slice(0, Math.max(0, maxWidth));
  let width = 0;
  let output = '';
  for (const char of value) {
    const nextWidth = charVisibleWidth(char);
    if (width + nextWidth > maxWidth - ellipsisWidth) break;
    output += char;
    width += nextWidth;
  }
  return output + ellipsis;
}

export function divider(width = UI_WIDTH, title?: string): string {
  const char = glyphs.divider;
  if (!title) {
    return ui.muted(char.repeat(width));
  }

  const titleWidth = visibleLength(title) + 2;
  const sideWidth = Math.max(0, width - titleWidth);
  const leftWidth = Math.floor(sideWidth / 2);
  const rightWidth = sideWidth - leftWidth;
  return ui.muted(`${char.repeat(leftWidth)} ${title} ${char.repeat(rightWidth)}`);
}

export function panelDivider(width = PANEL_WIDTH): string {
  return divider(width);
}

export function line(width = UI_WIDTH): string {
  return divider(width);
}

export function renderKeyboardHint(
  shortcut: string,
  action: string,
  options?: { bold?: boolean; parens?: boolean },
): string {
  const shortcutText = options?.bold ? ui.strong(shortcut) : shortcut;
  const core = `${shortcutText} to ${action}`;
  return options?.parens ? `(${core})` : core;
}

export function renderByline(items: string[]): string {
  const valid = items.filter(Boolean);
  if (!valid.length) return '';
  return valid.join(ui.muted(` ${glyphs.separator} `));
}

export function renderInputGuide(
  hints: Array<{ shortcut: string; action: string; bold?: boolean; parens?: boolean }>,
): string {
  return ui.muted(renderByline(hints.map((hint) => renderKeyboardHint(hint.shortcut, hint.action, hint))));
}

export function renderAssistantHeader(label = 'AI'): string {
  return `\n${ui.strong(`${INDENT}${label}`)}\n${INDENT}${divider(UI_WIDTH)}`;
}

export function renderCodeBlockTop(lang: string): string {
  const label = lang ? ui.muted(` ${lang} `) : '';
  const fill = Math.max(0, 50 - (lang.length + 4));
  return ui.muted(`${INDENT}┌──${label}${glyphs.divider.repeat(fill)}`);
}

export function renderCodeBlockBottom(): string {
  return ui.muted(`${INDENT}└${glyphs.divider.repeat(52)}`);
}

export function renderCodeBlockLine(value: string): string {
  return ui.muted(`${INDENT}│ `) + ui.code(value);
}

export function renderQuoteLine(value: string): string {
  return ui.muted(`${INDENT}│ `) + ui.italic(value);
}
