import { SelectorOption, interactiveSelect } from '../../utils/selector';
import { renderMarkdown } from '../../utils/markdown';
import { renderHomeHeader } from '../home';
import { DEFAULT_GUIDE_KEY, GUIDE_CHAPTERS, getGuideChapter, renderGuideChapter } from './chapters';

export { DEFAULT_GUIDE_KEY, GUIDE_CHAPTERS, renderGuideChapter };

type GuideColorName = 'cyan' | 'magenta' | 'yellow' | 'green';

const GUIDE_COLORS: Record<string, GuideColorName> = {
  [DEFAULT_GUIDE_KEY]: 'cyan',
  'cc-switch': 'magenta',
  vpn: 'yellow',
  community: 'green',
};

export function getGuideChapterColorName(key: string): GuideColorName {
  return GUIDE_COLORS[key] || 'cyan';
}

export function formatGuideChapter(key: string): string {
  // renderGuideChapter is the markdown source-of-truth; render it as styled terminal markdown
  // instead of tinting the raw '#'/'- ' characters with a single chalk color.
  return renderMarkdown(renderGuideChapter(key));
}

export function getGuideMenuOptions(currentKey: string): SelectorOption[] {
  return GUIDE_CHAPTERS
    .filter((chapter) => chapter.key !== currentKey)
    .map((chapter) => ({
      label: chapter.key === DEFAULT_GUIDE_KEY ? `主章节：${chapter.title}` : chapter.title,
      value: chapter.key,
      description: chapter.summary,
    }));
}

function getGuideMenuTitle(currentKey: string): string {
  if (currentKey === DEFAULT_GUIDE_KEY) {
    return '选择下一章节（Esc 退出）';
  }
  return `当前章节：${getGuideChapter(currentKey).title}；选择其他章节（Esc 退出）`;
}

function printChapter(key: string): void {
  console.log(formatGuideChapter(key));
}

function printNonInteractiveMenu(currentKey: string): void {
  const lines = ['## 继续学习章节', '', ...getGuideMenuOptions(currentKey).map((option) => `- ${option.label}`)];
  console.log(renderMarkdown(lines.join('\n')));
}

export async function handleGuide(version = '0.7.0'): Promise<void> {
  let currentKey = DEFAULT_GUIDE_KEY;
  console.log(renderHomeHeader(version));
  printChapter(currentKey);

  if (!process.stdin.isTTY) {
    printNonInteractiveMenu(currentKey);
    return;
  }

  while (true) {
    let selectedKey = '';
    await interactiveSelect({
      title: getGuideMenuTitle(currentKey),
      options: getGuideMenuOptions(currentKey),
      onSelect: (value) => {
        selectedKey = value;
      },
      onCancel: () => {
        selectedKey = '';
      },
    });

    if (!selectedKey) return;
    currentKey = selectedKey;
    console.log('');
    printChapter(currentKey);
  }
}