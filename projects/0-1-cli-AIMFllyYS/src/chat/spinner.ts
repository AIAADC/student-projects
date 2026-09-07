import { ui } from './ui/theme';
import { getGlyphMode } from './terminal-ui';

// Claude Code uses a growing-then-shrinking asterisk cycle (SpinnerGlyph.tsx: frames + reversed).
const UNICODE_FRAMES = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
const ASCII_FRAMES = ['|', '/', '-', '\\'];

export class Spinner {
  private interval: NodeJS.Timeout | null = null;
  private frame = 0;
  private text: string;

  constructor(text: string = '思考中') {
    this.text = text;
  }

  static getFrames(): string[] {
    return getGlyphMode() === 'ascii' ? [...ASCII_FRAMES] : [...UNICODE_FRAMES];
  }

  start(): void {
    this.frame = 0;
    process.stdout.write('\n');
    this.interval = setInterval(() => {
      const frames = Spinner.getFrames();
      const glyph = frames[this.frame % frames.length];
      process.stdout.write(`\r${ui.brand(glyph)} ${ui.muted(`${this.text}...`)}`);
      this.frame++;
    }, 160);
  }

  setText(text: string): void {
    this.text = text;
  }

  isRunning(): boolean {
    return this.interval !== null;
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stdout.write('\r\x1B[K');
    }
  }
}

export function renderSpinnerLine(text: string, frame = 0): string {
  const frames = Spinner.getFrames();
  const glyph = frames[frame % frames.length];
  return `${ui.brand(glyph)} ${ui.muted(text)}`;
}
