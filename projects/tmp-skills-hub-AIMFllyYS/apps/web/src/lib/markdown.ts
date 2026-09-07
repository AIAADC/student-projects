/**
 * Markdown 渲染共用件:hljs 代码块高亮挂在 marked 自定义 renderer 上
 * (marked 新版移除了内置 highlight 选项)。SkillViewer 与 Agent 消息共用。
 */

import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import { marked, type Tokens } from "marked";

marked.use({
  renderer: {
    code(token: Tokens.Code): string {
      const lang = token.lang !== undefined && hljs.getLanguage(token.lang) ? token.lang : "plaintext";
      const html = hljs.highlight(token.text, { language: lang }).value;
      return "<pre><code class='hljs language-" + lang + "'>" + html + "</code></pre>";
    },
  },
});

export function renderMarkdown(md: string): string {
  return marked.parse(md) as string;
}
