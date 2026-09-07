import { renderInline } from './markdown';
import {
  INDENT,
  renderAssistantHeader,
  renderCodeBlockBottom,
  renderCodeBlockLine,
  renderCodeBlockTop,
  renderQuoteLine,
  divider,
  ui,
} from './ui/theme';

export class StreamRenderer {
  private buffer = '';
  private lineBuffer = '';
  private inCodeBlock = false;
  private fullText = '';
  private firstToken = true;
  private inlinePending = '';
  private flushTimer: NodeJS.Timeout | null = null;
  private static readonly FLUSH_INTERVAL = 16;
  private static readonly FLUSH_THRESHOLD = 64;

  push(token: string): void {
    this.fullText += token;
    this.buffer += token;
    this.processBuffer();
  }

  finish(): string {
    this.flushInline();
    if (this.lineBuffer) {
      this.flushLine(this.lineBuffer);
      this.lineBuffer = '';
    }
    if (this.inCodeBlock) {
      console.log(renderCodeBlockBottom());
      this.inCodeBlock = false;
    }
    return this.fullText;
  }

  private processBuffer(): void {
    while (this.buffer.length > 0) {
      const nlIdx = this.buffer.indexOf('\n');
      if (nlIdx === -1) {
        this.streamInline(this.buffer);
        this.lineBuffer += this.buffer;
        this.buffer = '';
      } else {
        const line = this.lineBuffer + this.buffer.slice(0, nlIdx);
        this.buffer = this.buffer.slice(nlIdx + 1);
        this.lineBuffer = '';
        this.handleCompleteLine(line);
      }
    }
  }

  private streamInline(text: string): void {
    if (!text) return;
    if (this.firstToken) {
      this.firstToken = false;
      this.inlinePending += renderAssistantHeader() + '\n';
    }
    if (this.inCodeBlock) {
      if (!this.lineBuffer) this.inlinePending += ui.muted(`${INDENT}│ `);
      this.inlinePending += ui.code(text);
    } else {
      if (!this.lineBuffer) this.inlinePending += INDENT;
      this.inlinePending += text;
    }
    if (this.inlinePending.length >= StreamRenderer.FLUSH_THRESHOLD) {
      this.flushInline();
    } else {
      this.scheduleFlush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flushInline(), StreamRenderer.FLUSH_INTERVAL);
  }

  private flushInline(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.inlinePending) {
      process.stdout.write(this.inlinePending);
      this.inlinePending = '';
    }
  }

  private handleCompleteLine(line: string): void {
    this.flushInline();
    if (this.firstToken) {
      this.firstToken = false;
      console.log(renderAssistantHeader());
    }

    if (line) {
      process.stdout.write('\r\x1B[K');
    }

    this.flushLine(line);
  }

  private flushLine(line: string): void {
    if (line.trimStart().startsWith('```')) {
      if (!this.inCodeBlock) {
        this.inCodeBlock = true;
        const codeLang = line.trimStart().slice(3).trim();
        console.log(renderCodeBlockTop(codeLang));
      } else {
        this.inCodeBlock = false;
        console.log(renderCodeBlockBottom());
      }
      return;
    }

    if (this.inCodeBlock) {
      console.log(renderCodeBlockLine(line));
      return;
    }

    const h3 = line.match(/^### (.+)/);
    if (h3) { console.log(ui.h3(`   ${h3[1]}`)); return; }
    const h2 = line.match(/^## (.+)/);
    if (h2) { console.log(ui.h2(`  ${h2[1]}`)); return; }
    const h1 = line.match(/^# (.+)/);
    if (h1) { console.log(ui.h1(` ${h1[1]}`)); return; }

    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      console.log(`${INDENT}${divider(56)}`);
      return;
    }

    if (line.trimStart().startsWith('> ')) {
      console.log(renderQuoteLine(renderInline(line.trimStart().slice(2))));
      return;
    }

    const bullet = line.match(/^(\s*)([-*]) (.+)/);
    if (bullet) {
      console.log(bullet[1] + ui.muted(`${INDENT}• `) + renderInline(bullet[3]));
      return;
    }

    const numbered = line.match(/^(\s*)(\d+)\. (.+)/);
    if (numbered) {
      console.log(numbered[1] + ui.muted(`${INDENT}${numbered[2]}. `) + renderInline(numbered[3]));
      return;
    }

    if (!line.trim()) { console.log(''); return; }

    console.log(`${INDENT}${renderInline(line)}`);
  }
}
