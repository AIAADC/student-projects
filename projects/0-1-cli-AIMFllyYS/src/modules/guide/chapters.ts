import { GuideChapter } from './types';

export const DEFAULT_GUIDE_KEY = 'intro';

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    key: DEFAULT_GUIDE_KEY,
    title: '从 0 到 1：CLI 和 AI 编程到底是什么',
    summary: '用 Claude Code 做例子，先把 CLI、IDE、API、代理这些词讲明白。',
    body: [
      'CLI 就是命令行工具。你输入一行命令，电脑按这行命令做事。它看起来像黑窗口，但本质上只是更直接、更稳定的按钮。',
      'IDE 是写代码的软件，比如 VS Code、Cursor、Trae、Kiro。CLI 和 IDE 不冲突：IDE 负责看文件、改代码，CLI 负责快速安装、运行、检查和调用 AI。',
      'Claude Code 是一个典型 AI CLI。安装后你可以在项目目录里输入 claude，让它读项目、解释代码、帮你改功能。第一次使用通常需要登录账号或配置 API。',
      '如果你还没装环境，可以先运行 hi --install -cc。这个命令会引导你检查依赖并安装 Claude Code。',
      '如果你不知道从哪里开始，可以先运行 hi --skills 安装入门 skills，再运行 hi --api 找模型平台，运行 hi --pay 找支付和中转资源。',
      '不要害怕 CLI 的交互环境。你可以把它理解成“更认真一点的聊天窗口”：你输入问题，它给出答案；你确认操作，它才继续。',
    ],
  },
  {
    key: 'cc-switch',
    title: 'Claude Code 如何接入其他 AI：CC Switch 入门',
    summary: '解释 CC Switch 是什么，以及如何配合本 CLI 安装环境。',
    body: [
      'CC Switch 是一个跨平台桌面工具，用来管理 Claude Code、Codex、OpenCode、OpenClaw、Gemini CLI、Hermes 等 AI CLI 的配置。',
      '它最适合小白理解“模型供应商”和“CLI 工具”之间的关系：CLI 是外壳，模型/API 是大脑，CC Switch 帮你切换不同大脑。',
      'Windows 下载：https://github.com/farion1231/cc-switch/releases/download/v3.16.2/CC-Switch-v3.16.2-Windows.msi',
      'Mac 下载：https://github.com/farion1231/cc-switch/releases/download/v3.16.2/CC-Switch-v3.16.2-macOS.dmg',
      '本项目里可以先运行 hi --install -cc 安装 Claude Code，再运行 hi --api 找到模型平台，最后用 CC Switch 把 API 信息配置进去。',
      '延伸讲解链接：https://mp.weixin.qq.com/s?scene=1&__biz=MzIyMzA5NjEyMA==&mid=2647682885&idx=1&sn=1ef8656b5ebb661c1d1f29f7ce49fc1f',
    ],
  },
  {
    key: 'vpn',
    title: '什么是 VPN / 代理，怎样访问外网环境',
    summary: '解释订阅链接、Clash Verge、TUN、全局代理和规则模式。',
    body: [
      '很多国外 AI 平台需要稳定外网环境。代理/VPN 的作用，就是让你的电脑通过一个可访问外网的网络出口去访问这些网站。',
      '以这个入口为例：https://www.sibker.com/register?invite_code=LOO3ipxE 。通常流程是注册、付费、获取一个“订阅链接”。',
      '拿到订阅链接后，下载 Clash Verge，导入订阅，再选择节点连接。',
      'Clash Verge Windows：https://www.sibker.com/client/Clash.Verge_2.4.7_x64-setup.exe',
      'Clash Verge Mac Intel：https://www.sibker.com/client/Clash.Verge_2.4.7_x64.dmg',
      'Clash Verge Mac Apple Silicon：https://www.sibker.com/client/Clash.Verge_2.4.7_aarch64.dmg',
      'TUN 模式可以让更多软件自动走代理，不只是浏览器。规则模式会按网站智能分流；全局代理会让几乎所有流量都走代理。新手通常先用规则模式，遇到访问失败再短时间切全局。',
    ],
  },
  {
    key: 'community',
    title: '如何快速入门树成林 AI-IP 社群的学习方式',
    summary: '方向给定，具体内容自己实践、交流、迭代。',
    body: [
      '入门 AI 编程最重要的不是背概念，而是先给方向，然后自己动手试。方向给定，具体内容自己实践去学习。',
      '推荐先安装入门 skill：hi --skills，然后选择 Agent Onboarding Skill。',
      '也可以查看仓库：https://github.com/kaijie0074-art/agent-onboarding-skill',
      '学习节奏建议：先照着教程跑通一次，再在交流群里看大家怎么提问、怎么拆任务、怎么迭代项目。',
      '遇到问题要主动问 AI。问得越具体，AI 越容易帮你定位问题：把报错、你运行的命令、你期望的结果一起发给它。',
    ],
  },
];

export function getGuideChapter(key: string): GuideChapter {
  return GUIDE_CHAPTERS.find((chapter) => chapter.key === key) || GUIDE_CHAPTERS[0];
}

export function renderGuideChapter(key: string): string {
  const chapter = getGuideChapter(key);
  return [
    `# ${chapter.title}`,
    '',
    chapter.summary,
    '',
    ...chapter.body.map((line) => `- ${line}`),
  ].join('\n');
}
