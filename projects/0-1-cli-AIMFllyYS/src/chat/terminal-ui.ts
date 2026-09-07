import chalk from 'chalk';

type GlyphMode = 'unicode' | 'ascii';

interface GlyphMap {
  success: string;
  error: string;
  info: string;
  warning: string;
  separator: string;
  pointer: string;
  diamond: string;
  diamondOpen: string;
  bullet: string;
  divider: string;
  boxTopLeft: string;
  boxTopRight: string;
  boxBottomLeft: string;
  boxBottomRight: string;
  boxHorizontal: string;
  boxVertical: string;
}

const UNICODE_GLYPHS: GlyphMap = {
  success: '✓',
  error: '✗',
  info: 'ℹ',
  warning: '⚠',
  separator: '·',
  pointer: '›',
  diamond: '◆',
  diamondOpen: '◇',
  bullet: '•',
  divider: '─',
  boxTopLeft: '╔',
  boxTopRight: '╗',
  boxBottomLeft: '╚',
  boxBottomRight: '╝',
  boxHorizontal: '═',
  boxVertical: '║',
};

const ASCII_GLYPHS: GlyphMap = {
  success: 'v',
  error: 'x',
  info: 'i',
  warning: '!',
  separator: '-',
  pointer: '>',
  diamond: '*',
  diamondOpen: 'o',
  bullet: '*',
  divider: '-',
  boxTopLeft: '+',
  boxTopRight: '+',
  boxBottomLeft: '+',
  boxBottomRight: '+',
  boxHorizontal: '-',
  boxVertical: '|',
};

let currentMode: GlyphMode = 'unicode';

function resolveGlyphs(): GlyphMap {
  return currentMode === 'ascii' ? ASCII_GLYPHS : UNICODE_GLYPHS;
}

export const glyphs: GlyphMap = new Proxy(UNICODE_GLYPHS, {
  get(_target, prop: string) {
    return resolveGlyphs()[prop as keyof GlyphMap];
  },
});

export function setGlyphMode(mode: GlyphMode): void {
  currentMode = mode;
}

export function getGlyphMode(): GlyphMode {
  return currentMode;
}

export function detectGlyphMode(): GlyphMode {
  const env = process.env;
  if (env.HI_GLYPH_MODE === 'ascii') return 'ascii';
  if (env.HI_GLYPH_MODE === 'unicode') return 'unicode';
  const lang = (env.LANG || env.LC_ALL || env.LC_CTYPE || '').toLowerCase();
  if (lang.includes('utf-8') || lang.includes('utf8')) return 'unicode';
  if (process.platform === 'win32') {
    const chcp = env.CHCP || '';
    if (chcp === '65001') return 'unicode';
  }
  return 'unicode';
}

export function drawBox(title: string, subtitle?: string): string {
  const g = resolveGlyphs();
  const width = 60;
  const lines: string[] = [];
  lines.push(chalk.cyan(g.boxTopLeft + g.boxHorizontal.repeat(width) + g.boxTopRight));
  const pad = Math.max(0, Math.floor((width - title.length) / 2));
  lines.push(
    chalk.cyan(g.boxVertical)
    + ' '.repeat(pad)
    + chalk.bold.white(title)
    + ' '.repeat(width - pad - title.length)
    + chalk.cyan(g.boxVertical),
  );
  if (subtitle) {
    const sp = Math.max(0, Math.floor((width - subtitle.length) / 2));
    lines.push(
      chalk.cyan(g.boxVertical)
      + ' '.repeat(sp)
      + chalk.gray(subtitle)
      + ' '.repeat(width - sp - subtitle.length)
      + chalk.cyan(g.boxVertical),
    );
  }
  lines.push(chalk.cyan(g.boxBottomLeft + g.boxHorizontal.repeat(width) + g.boxBottomRight));
  return lines.join('\n');
}

export function printSuccess(msg: string): void {
  console.log(chalk.green(`  ${glyphs.success} `) + msg);
}

export function printError(msg: string): void {
  console.log(chalk.red(`  ${glyphs.error} `) + msg);
}

export function printInfo(msg: string): void {
  console.log(chalk.blue(`  ${glyphs.info} `) + msg);
}

export function printWarning(msg: string): void {
  console.log(chalk.yellow(`  ${glyphs.warning} `) + msg);
}

export function printDivider(): void {
  console.log(chalk.gray(`  ${glyphs.divider.repeat(56)}`));
}
