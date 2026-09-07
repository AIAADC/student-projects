// Ported from: src/utils/markdown.ts (formatToken token walker) and src/components/Markdown.tsx
// Adapted: marked.lexer + a string-producing token walker with terminal-width wrapping;
// removed Ink/React, syntax-highlight Suspense, and Anthropic-only paths. Provider-neutral.
import { marked } from 'marked';
import stringWidth from 'string-width';
import {
  INDENT,
  divider,
  isColorEnabled,
  renderCodeBlockBottom,
  renderCodeBlockLine,
  renderCodeBlockTop,
  ui,
} from './ui/theme';
import { getGlyphMode, glyphs } from './terminal-ui';

marked.setOptions({ gfm: true, breaks: false });

export interface RenderMarkdownOptions {
  width?: number;
}

type StyleTag = 'bold' | 'italic' | 'strike' | 'code' | 'link' | 'dim';

interface Segment {
  text: string;
  tags: StyleTag[];
}

interface Atom {
  ch: string;
  w: number;
  tags: StyleTag[];
  space: boolean;
  wide: boolean;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|nbsp|#39|#x27);/g, (match) => ENTITIES[match] ?? match);
}

function stripHtml(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, ''));
}

function resolveWidth(opts?: RenderMarkdownOptions): number {
  const cols = opts?.width ?? (process.stdout && process.stdout.columns) ?? 80;
  return Math.max(40, Math.min(cols, 100));
}

function sameTags(a: StyleTag[], b: StyleTag[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function applyStyle(text: string, tags: StyleTag[]): string {
  if (!text) return text;
  if (!isColorEnabled()) {
    // Keep codespans visually distinct even without color.
    return tags.includes('code') ? `\`${text}\`` : text;
  }
  if (tags.includes('code')) return ui.inlineCodeFlat(text);
  if (tags.includes('link')) return ui.link(text);
  if (tags.includes('dim')) return ui.muted(text);
  let styled = text;
  if (tags.includes('bold')) styled = ui.strong(styled);
  if (tags.includes('italic')) styled = ui.italic(styled);
  if (tags.includes('strike')) styled = ui.strike(styled);
  return styled;
}

function inlineSegments(tokens: any[] | undefined, tags: StyleTag[] = []): Segment[] {
  if (!tokens || !tokens.length) return [];
  const segs: Segment[] = [];
  for (const token of tokens) {
    const t = token as any;
    switch (t.type) {
      case 'text':
        if (t.tokens && t.tokens.length) segs.push(...inlineSegments(t.tokens, tags));
        else segs.push({ text: decodeEntities(t.text ?? ''), tags });
        break;
      case 'escape':
        segs.push({ text: t.text ?? '', tags });
        break;
      case 'strong':
        segs.push(...inlineSegments(t.tokens, [...tags, 'bold']));
        break;
      case 'em':
        segs.push(...inlineSegments(t.tokens, [...tags, 'italic']));
        break;
      case 'del':
        segs.push(...inlineSegments(t.tokens, [...tags, 'strike']));
        break;
      case 'codespan':
        segs.push({ text: decodeEntities(t.text ?? ''), tags: [...tags, 'code'] });
        break;
      case 'link': {
        segs.push(...inlineSegments(t.tokens, [...tags, 'link']));
        const href = String(t.href ?? '');
        const label = segsPlain(inlineSegments(t.tokens));
        if (href && href !== label && !href.startsWith('mailto:')) {
          segs.push({ text: ` (${href})`, tags: [...tags, 'dim'] });
        }
        break;
      }
      case 'image':
        segs.push({ text: t.text || t.href || '', tags: [...tags, 'dim'] });
        break;
      case 'br':
        segs.push({ text: '\n', tags });
        break;
      case 'html':
        segs.push({ text: stripHtml(t.text ?? ''), tags });
        break;
      default:
        if (t.tokens && t.tokens.length) segs.push(...inlineSegments(t.tokens, tags));
        else if (typeof t.text === 'string') segs.push({ text: decodeEntities(t.text), tags });
    }
  }
  return segs;
}

function segsPlain(segs: Segment[]): string {
  return segs.map((s) => s.text).join('');
}

function segsStyled(segs: Segment[]): string {
  return segs.map((s) => applyStyle(s.text, s.tags)).join('');
}

function toAtoms(segs: Segment[]): Atom[] {
  const atoms: Atom[] = [];
  for (const seg of segs) {
    for (const ch of Array.from(seg.text)) {
      if (ch === '\n') {
        atoms.push({ ch: '\n', w: 0, tags: seg.tags, space: false, wide: false });
        continue;
      }
      const w = stringWidth(ch);
      atoms.push({ ch, w, tags: seg.tags, space: /\s/.test(ch), wide: w >= 2 });
    }
  }
  return atoms;
}

function renderAtoms(atoms: Atom[]): string {
  let out = '';
  let i = 0;
  while (i < atoms.length) {
    const { tags } = atoms[i];
    let chunk = '';
    let j = i;
    while (j < atoms.length && sameTags(atoms[j].tags, tags)) {
      chunk += atoms[j].ch;
      j += 1;
    }
    out += applyStyle(chunk, tags);
    i = j;
  }
  return out;
}

function trimTrailingSpaces(atoms: Atom[]): Atom[] {
  let end = atoms.length;
  while (end > 0 && atoms[end - 1].space) end -= 1;
  return atoms.slice(0, end);
}

function wrapSegments(segs: Segment[], width: number): string[] {
  const safeWidth = Math.max(4, width);
  const atoms = toAtoms(segs);
  const lines: string[] = [];
  let line: Atom[] = [];
  let lineWidth = 0;
  let lastBreak = -1;

  const flush = (atomsToRender: Atom[]) => {
    lines.push(renderAtoms(trimTrailingSpaces(atomsToRender)));
  };

  for (const atom of atoms) {
    if (atom.ch === '\n') {
      flush(line);
      line = [];
      lineWidth = 0;
      lastBreak = -1;
      continue;
    }
    line.push(atom);
    lineWidth += atom.w;
    if (atom.space || atom.wide) lastBreak = line.length;
    if (lineWidth > safeWidth && line.length > 1) {
      if (lastBreak > 0 && lastBreak < line.length) {
        const head = line.slice(0, lastBreak);
        const rest = line.slice(lastBreak);
        flush(head);
        line = rest;
      } else {
        const last = line.pop() as Atom;
        flush(line);
        line = [last];
      }
      lineWidth = line.reduce((sum, a) => sum + a.w, 0);
      lastBreak = -1;
      for (let k = 0; k < line.length; k += 1) {
        if (line[k].space || line[k].wide) lastBreak = k + 1;
      }
    }
  }
  if (line.length) flush(line);
  return lines.length ? lines : [''];
}

function wrapPlain(text: string, width: number): string[] {
  return wrapSegments([{ text, tags: [] }], width);
}

function truncatePlain(text: string, max: number): string {
  if (stringWidth(text) <= max) return text;
  const budget = Math.max(1, max - 1);
  let out = '';
  let w = 0;
  for (const ch of Array.from(text)) {
    const cw = stringWidth(ch);
    if (w + cw > budget) break;
    out += ch;
    w += cw;
  }
  return `${out}…`;
}

function quoteBar(): string {
  return getGlyphMode() === 'ascii' ? '|' : '▎';
}

function renderHeading(t: any, width: number, prefix: string): string[] {
  const fn = t.depth === 1 ? ui.h1 : t.depth === 2 ? ui.h2 : ui.h3;
  const content = segsPlain(inlineSegments(t.tokens));
  const lines = wrapPlain(content, width - stringWidth(prefix));
  return lines.map((l) => fn(`${prefix}${l}`));
}

function renderParagraph(tokens: any[], width: number, prefix: string): string[] {
  const segs = inlineSegments(tokens);
  return wrapSegments(segs, width - stringWidth(prefix)).map((l) => `${prefix}${l}`);
}

function renderCode(t: any, width: number, prefix: string): string[] {
  const out: string[] = [`${prefix}${renderCodeBlockTop(String(t.lang ?? ''))}`];
  const codeWidth = width - stringWidth(prefix) - 4;
  for (const raw of String(t.text ?? '').replace(/\n$/, '').split('\n')) {
    const shown = stringWidth(raw) > codeWidth ? truncatePlain(raw, codeWidth) : raw;
    out.push(`${prefix}${renderCodeBlockLine(shown)}`);
  }
  out.push(`${prefix}${renderCodeBlockBottom()}`);
  return out;
}

function renderBlockquote(t: any, width: number, prefix: string): string[] {
  const inner = renderBlocks(t.tokens as any[], width - 2, '');
  const bar = ui.muted(quoteBar());
  return inner.map((l) => (l.trim() === '' ? `${prefix}${bar}` : `${prefix}${bar} ${ui.italic(l.replace(/^\s+/, ''))}`));
}

function renderList(t: any, width: number, prefix: string): string[] {
  const out: string[] = [];
  let n = Number.isFinite(t.start) && t.start ? Number(t.start) : 1;
  for (const item of t.items as any[]) {
    const markerStr = t.ordered ? `${n}. ` : `${glyphs.bullet} `;
    const markerW = stringWidth(markerStr);
    const contentPrefix = prefix + ' '.repeat(markerW);
    const contentWidth = width - stringWidth(contentPrefix);
    const checkbox = item.task ? (item.checked ? '[x] ' : '[ ] ') : '';
    let firstEmitted = false;
    for (const child of item.tokens as any[]) {
      if (child.type === 'list') {
        out.push(...renderList(child, width, contentPrefix));
        continue;
      }
      if (child.type === 'space') continue;
      if (child.type === 'code') {
        out.push(...renderCode(child, width, contentPrefix));
        firstEmitted = true;
        continue;
      }
      const tokens = child.tokens || [{ type: 'text', text: child.text ?? '' }];
      const segs = inlineSegments(tokens);
      const wrapped = wrapSegments(segs, contentWidth - stringWidth(checkbox));
      wrapped.forEach((l, idx) => {
        if (!firstEmitted && idx === 0) {
          out.push(`${prefix}${ui.muted(markerStr)}${checkbox ? ui.muted(checkbox) : ''}${l}`);
        } else {
          out.push(`${contentPrefix}${l}`);
        }
      });
      firstEmitted = true;
    }
    if (!firstEmitted) out.push(`${prefix}${ui.muted(markerStr)}`);
    if (t.ordered) n += 1;
  }
  return out;
}

function renderTable(t: any, width: number, prefix: string): string[] {
  const aligns: string[] = t.align || [];
  const headerPlain = (t.header as any[]).map((c) => segsPlain(inlineSegments(c.tokens)));
  const rowsPlain = (t.rows as any[]).map((row) => row.map((c: any) => segsPlain(inlineSegments(c.tokens))));
  const ncol = headerPlain.length;
  const colWidth: number[] = [];
  for (let i = 0; i < ncol; i += 1) {
    let w = stringWidth(headerPlain[i]);
    for (const row of rowsPlain) w = Math.max(w, stringWidth(row[i] ?? ''));
    colWidth[i] = Math.min(Math.max(w, 3), 40);
  }

  const pad = (text: string, i: number): string => {
    const shown = stringWidth(text) > colWidth[i] ? truncatePlain(text, colWidth[i]) : text;
    const space = colWidth[i] - stringWidth(shown);
    if (aligns[i] === 'right') return ' '.repeat(space) + shown;
    if (aligns[i] === 'center') {
      const left = Math.floor(space / 2);
      return ' '.repeat(left) + shown + ' '.repeat(space - left);
    }
    return shown + ' '.repeat(space);
  };

  const border = (left: string, mid: string, right: string): string =>
    `${prefix}${ui.muted(left + colWidth.map((w) => '─'.repeat(w + 2)).join(mid) + right)}`;
  const vbar = ui.muted('│');
  const rowLine = (cells: string[], styler?: (s: string) => string): string => {
    const inner = cells
      .map((cell, i) => {
        const padded = ` ${pad(cell, i)} `;
        return styler ? styler(padded) : padded;
      })
      .join(vbar);
    return `${prefix}${vbar}${inner}${vbar}`;
  };

  const out: string[] = [border('┌', '┬', '┐'), rowLine(headerPlain, ui.strong), border('├', '┼', '┤')];
  for (const row of rowsPlain) {
    out.push(rowLine(headerPlain.map((_, i) => row[i] ?? '')));
  }
  out.push(border('└', '┴', '┘'));
  return out;
}

function renderBlocks(tokens: any[], width: number, prefix: string): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    const t = token as any;
    switch (t.type) {
      case 'space':
        out.push('');
        break;
      case 'heading':
        out.push(...renderHeading(t, width, prefix));
        break;
      case 'paragraph':
        out.push(...renderParagraph(t.tokens, width, prefix));
        break;
      case 'text':
        out.push(...renderParagraph(t.tokens || [{ type: 'text', text: t.text ?? '' }], width, prefix));
        break;
      case 'blockquote':
        out.push(...renderBlockquote(t, width, prefix));
        break;
      case 'list':
        out.push(...renderList(t, width, prefix));
        break;
      case 'code':
        out.push(...renderCode(t, width, prefix));
        break;
      case 'hr':
        out.push(`${prefix}${divider(Math.max(10, width - stringWidth(prefix)))}`);
        break;
      case 'table':
        out.push(...renderTable(t, width, prefix));
        break;
      case 'html': {
        const text = stripHtml(t.text ?? '').trim();
        if (text) out.push(...renderParagraph([{ type: 'text', text }], width, prefix));
        break;
      }
      case 'def':
        break;
      default:
        if (t.tokens && t.tokens.length) out.push(...renderParagraph(t.tokens, width, prefix));
        else if (typeof t.text === 'string' && t.text.trim()) {
          out.push(...renderParagraph([{ type: 'text', text: t.text }], width, prefix));
        }
    }
  }
  return out;
}

export function renderMarkdown(text: string, opts?: RenderMarkdownOptions): string {
  const width = resolveWidth(opts);
  const tokens = marked.lexer(text ?? '') as any[];
  return renderBlocks(tokens, width, INDENT).join('\n');
}

export function renderInline(text: string): string {
  if (!text) return '';
  const tokens = marked.lexer(text) as any[];
  const paragraph = tokens.find((t) => (t as any).type === 'paragraph') as any;
  if (paragraph?.tokens) return segsStyled(inlineSegments(paragraph.tokens));
  const firstWithTokens = tokens.find((t) => (t as any).tokens) as any;
  if (firstWithTokens?.tokens) return segsStyled(inlineSegments(firstWithTokens.tokens));
  return text;
}
