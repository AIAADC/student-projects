// Neutral re-export so non-chat CLI modules can render markdown without reaching into src/chat internals.
import { renderMarkdown, renderInline, RenderMarkdownOptions } from '../chat/markdown';

export { renderMarkdown, renderInline, RenderMarkdownOptions };

/** Render markdown and print it to stdout. Convenience for command modules. */
export function printMarkdown(markdown: string, opts?: RenderMarkdownOptions): void {
  console.log(renderMarkdown(markdown, opts));
}
