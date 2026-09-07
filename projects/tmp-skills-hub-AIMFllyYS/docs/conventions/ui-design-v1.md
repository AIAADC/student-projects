# UI 设计规范 v1:克制灰阶 + 统一组件 + UX 铁律

> 状态:生效 | 适用范围:`apps/web` 全部界面
> 取代 [ui-design-v0.md](./ui-design-v0.md)（#30）。v0 的视觉硬约束全部保留；v1 补上人用旅程规则，并把控件收口到同一套组件。
> 信息架构仍服从 [app-shell-v2.md](../designs/app-shell-v2.md)。数据层仍服从 [panel-ia-v1.md](../designs/panel-ia-v1.md)。
> 修订理由:人用壳四页已经落地，但按钮、输入、对话框、Toast 各写一套 class；批 9 的分组 / 分析 / 分享从主路径消失却仍留在死代码里。需要一份同时约束视觉、组件来源与旅程的口径，否则每个页面会再次各自发挥。
> **批 14 修订（2026-08-20）**：批 13 把 class 收口到 `components/ui/`，但规范 §6 仍禁止页切、骨架、位移，设置仍是主区第四页，长名单是纯文字。按旧禁令做完就会「生硬」。本修订允许反馈动效、Skeleton、侧栏收起/拖宽、长名单折叠；灰阶 / 无渐变 / 无毛玻璃 / 无大阴影仍硬。`docs/designs/design.pen` 若仍按旧 token / 三栏草图，以本文为准，该文件视为过时。
> **批 15 修订（2026-08-20）**：统计图若全用灰阶细柱，20 条会挤成马赛克，也无法区分查看/启用。控件/导航/按钮仍灰阶；**统计图与内容区文件树**允许一组固定系列色。用量/应用的全集走排行表，图只画前 8 名粗柱。Skills 内容详情用层级树 + 元信息网格，不是扁平路径清单。
> **批 16 修订（2026-08-20）**：150ms 线性过渡让切页、Tab、图表显得抽搐。本修订把动效收口为分层时长 + 弹簧/平滑缓动（`--ease-spring` / `--ease-smooth`）；Tab 改为分段胶囊控制器；图表入场可到 600ms。灰阶 / 无渐变 / 无毛玻璃 / 无大阴影仍硬；分段选中块与总览 KPI hover 允许极弱高度。
> **批 17 修订（2026-08-21）**：token 有了但业务仍复制 `duration-*` / `active:scale` 串，侧栏收起卸载文字、切页只有入场。本修订把动效收成可引用的 `motion-*` 类别；侧栏收起是宽度插值 + 文字淡出。灰阶 / 无渐变 / 无毛玻璃 / 无大阴影 / 无 bounce 仍硬。
> **批 18 修订（2026-08-21）**：批 17 把 View Transition 和 `motion-enter` 叠在一起，切页双重卡顿并闪现。本修订**只保留** `key` + `motion-enter` 这一套缓动刷新；禁止再引入 View Transition / `withViewTransition`。侧栏导航必须是纵向 flex 栏（不能随拖宽变成横排）。

这是给自己人天天用的工具面板，不是宣传页。高端感来自克制与秩序：留白、层级清晰、字重与灰阶的节制使用、动效只用于表达状态变化。用户离开时应该能说：That was easy.

## 0. 修订相对 v0

| 仍硬 | v1 新增 | 批 14 / 15 / 16 修订 |
| --- | --- | --- |
| 控件灰阶、三档状态色、无渐变 / 毛玻璃 / 大阴影 | UX 铁律（清晰、少、可预期、点击有理由） | 反馈动效允许：`motion-*` 类别、按压 `scale`、hover 底纹、主区 `motion-enter`、分段 Tab、图表生长、开关拨动 |
| 字号字重档位、4px 间距、标题不超过 semibold | 控件必须来自 `apps/web/src/components/ui/`，禁止第三套手写按钮 | 侧栏 / 图 / 骨架 / 滚动区 / 提示 / 表也必须走组件库 |
| 无深色模式、隐藏滚动条、集合行 `h-10` | 分层动效 token（100/200/300/500ms + spring/smooth）；图标只做微型叙事 | 加载用 Skeleton；`prefers-reduced-motion` 时只留颜色变化 |
| 左下角设置入口 | 第一印象、空状态、反馈（Toast / 对话框）必须统一 | 侧栏可收可拖；设置是 Dialog；长名单折叠；**统计图与文件树允许固定系列色**；分段控件与 KPI hover 允许极弱高度 |

## 1. 原则

1. **清晰，而非困惑。** 用户要感觉自己明白，而不是在猜。
2. **克制。** 一屏一个视觉重点；不用装饰性元素。少即是多：更少颜色、更少字体、更少控件变体。
3. **秩序。** 栅格与间距节奏统一，同类信息同层级。
4. **灰度优先。** 颜色只表达语义（状态），不表达品牌或装饰。
5. **看起来相似的，行为也必须相似。** 主按钮全仓一种；次按钮全仓一种；危险动作全仓一种。
6. **可预期优先于创造。** 用侧栏、页内 Tab、对话框、开关这些用户已经会的东西，不发明新控件。
7. **动效是反馈，不是表演。**
8. **文字即界面。** 能靠字重与灰阶分出的层级，不用色块。图标只在能省字时出现。

## 2. 颜色与灰阶层级

主色板就是灰阶。语义色只保留三个状态色。**控件、导航、按钮不引入品牌色。** 下面两类允许固定系列色（中饱和、浅底，禁止荧光、禁止每个 skill 一种色）：

1. **统计图**：查看次数蓝、启用/覆盖青、来源分类再用琥珀/紫。轴、网格、字仍用 ink / line。图上必须有数字标签或表列，不靠色差读数。排行图只画前 8 名，全集走表。
2. **内容区文件树**：文件夹 / md / json / js·ts 用 Lucide + 对应系列色，只出现在树里。

| 用途 | Token / Tailwind | 参考值 | 说明 |
| --- | --- | --- | --- |
| 页面背景 | `bg-background` / `bg-white` | #ffffff | 浅色模式基底 |
| 主文本 | `text-ink-strong` / `text-foreground` | #030712 | 标题与正文首选 |
| 次级文本 | `text-ink-mid` / `text-muted-foreground` | #4b5563 | 描述、元信息 |
| 弱化文本 | `text-ink-faint` | #9ca3af | 占位符、时间戳 |
| 边框 | `border-line` / `border-border` | #e5e7eb | 卡片、输入框 |
| 悬停边框 | `border-line-strong` | #9ca3af | 可聚焦控件 |
| 底纹 | `bg-surface` / `bg-muted` | #f9fafb | 标签、区块底、hover / 选中 |
| 主按钮底 | `bg-primary` / `bg-ink-strong` | #030712 | 黑底白字 |
| 成功 | `text-green-700` / `bg-green-50` | | 仅「已启用」等状态 |
| 警告 | `text-amber-800` / `bg-amber-50` | | 仅离线提示等 |
| 错误 | `text-red-700` / `bg-red-50` | | 仅失败信息 |
| 图·查看 | 图表 `CHART_COLOR.show` | #3b82f6 | 仅统计图系列，不进按钮 |
| 图·启用 / 覆盖 | 图表 `CHART_COLOR.enable` | #0d9488 | 仅统计图系列 |
| 图·来源琥珀 / 紫 | `#d97706` / `#7c3aed` | | 来源环图 3–4 档；禁止每个 skill 一色 |

规则:文本层级最多用三档；背景层级最多两档（white / surface）；状态色只用浅底深字，不用深底白字，不用高饱和纯色。每一种颜色都必须挣到自己的位置。

## 3. 字号与字重档位

字体家族最多两种：界面无衬线（系统栈），代码 / 路径等宽。不引入第三种展示字体。

| 档 | Tailwind | 字号 | 字重 | 用途 |
| --- | --- | --- | --- | --- |
| 页面标题 | `text-2xl font-semibold tracking-tight` | 24px | 600 | 每页唯一 |
| 区块标题 | `text-base font-medium` | 16px | 500 | 卡片组标题 |
| 条目标题 | `text-sm font-medium` | 14px | 500 | 列表项主名 |
| 正文 | `text-sm` | 14px | 400 | 描述、说明 |
| 次要 | `text-xs` | 12px | 400 | 标签、时间 |
| 代码 | `font-mono text-xs` | 12px | 400 | 命令、路径 |

规则:标题不用 700+ 字重；不用斜体表强调；行高统一 1.5（标题可 1.25）。尺寸拉开层级：重要的更大，不要靠颜色喊。

## 4. 间距节奏

间距只用 4px 网格:

| 层级 | 值 | 用途 |
| --- | --- | --- |
| 页面边距 | `px-6` / `py-10` | 主容器（页头可用 `py-4`） |
| 区块间距 | `mb-8` / `space-y-6` | 页内区块 |
| 卡片间距 | `space-y-3` | 列表项 |
| 卡片内边距 | `p-4` | 内容与边框 |
| 行内间距 | `gap-2` / `gap-3` | 控件组 |
| 元素内距 | `px-3 py-2` | 输入框、按钮 |

留白本身是工具：边缘空着，内容才可读。不要为了「显得满」而填装饰。

## 5. 圆角、边框、层级

- 卡片:`rounded-xl`（12px），1px `border-line`，**默认无阴影**
- 输入 / 下拉 / 对话框面板:`rounded-lg`（8px），1px 边框；focus 无彩色光环，只变边框为 `line-strong`；允许 1px `ring-line-strong` 作为键盘焦点，禁止彩色 glow
- 标签 / 计数胶囊:`rounded-full`，`px-2 py-0.5`，`bg-surface text-ink-mid`。**按钮不用胶囊圆角**——按钮一律 `rounded-lg`，避免和标签抢形状
- 主按钮:`bg-ink-strong text-white`；次按钮:`border border-line bg-white`；危险:`border-red-200 text-red-700 bg-white`（浅底深字，不用红底白字）
- 对话框遮罩:`bg-ink-strong/40`，**无** `backdrop-blur`。用户预期是「背后变暗」，不是白雾
- 层级用实体面 + 边框表达。大阴影、彩色 glow、组件库默认 elevation 禁止
- **极弱高度例外**（只用 token，禁止 `shadow-md` 及以上）：分段控件选中块 `--shadow-thumb`；总览 KPI 卡 hover `--shadow-lift`

## 6. 动效

动效只表达「点到了 / 换页了 / 在加载 / 数据长出来了」，不是装饰。全仓用分层 token，禁止再手写 `150ms` / `ease`。

| Token | 值 | 用途 |
| --- | --- | --- |
| `--duration-instant` | 100ms | 纯微反馈 |
| `--duration-fast` | 200ms | hover、按压 `scale(0.98)`、边框/颜色 |
| `--duration-normal` | 300ms | Tab、弹窗、抽屉、开关拨动、侧栏宽度 |
| `--duration-slow` | 500ms | 排行微进度条、复杂视图 |
| `--ease-spring` | `cubic-bezier(0.34, 1.3, 0.64, 1)` | 分段选中、弹窗缩放、开关拇指、树形 chevron |
| `--ease-smooth` | `cubic-bezier(0.16, 1, 0.3, 1)` | 切页、遮罩、抽屉高度、侧栏收起 |
| `--ease-out-quad` | `cubic-bezier(0.25, 1, 0.5, 1)` | 按钮按压与常规 hover |

业务文件与页面**必须引用**下列类别，禁止复制 `duration-*` / `ease-*` / `active:scale` 串：

| 类别 | 做什么 | 用在哪 |
| --- | --- | --- |
| `motion-press` | `--duration-fast` + `--ease-out-quad`，按下 `scale(0.98)` | `Button`、分段 Tab、KPI 卡 |
| `motion-fill` | 只过渡 `color` / `background-color` / `border-color` | 输入、表行底纹、分隔条 |
| `motion-enter` | 沿用 `page-in`（opacity + `translateY(4px)`，520ms `--ease-smooth`） | **唯一**切页 / 页内 Tab 刷新 |
| `motion-row` | `motion-press` + `motion-fill` 的组合 | 列表行、可点表行、文件树节点、应用列 |

切页与侧栏是结构动效，不在业务文件里手写过渡：

- **主区切页**：只允许一套：`key={page}` 重挂载 + 根节点 `motion-enter`。Skills / 统计的页内 Tab 同样：换页签时面板根节点 `motion-enter`。禁止 View Transition、`document.startViewTransition`、`withViewTransition`，也禁止再叠一层淡出动画。不要整页横向滑入。
- **侧栏收起**：导航 Panel 宽度插值（`flex-grow`，`--duration-normal` `--ease-smooth`）；标签和品牌文案留在 DOM，用 opacity 淡出，宽度由 panel `overflow: hidden` 裁切。禁止 `{!collapsed && label}`，也禁止给品牌单独 `truncate` / `max-width`（会在还没收到 48px 时就出现省略号）。侧栏内部是 **48px 图标列 + 文案列** 同一套 grid，收起/展开不换按钮尺寸、不加一层占满宽度的 Tooltip 盒子。仅按钮收起/展开时开过渡；拖分隔条时关掉。按钮动画期间把 `minSize` 降到图标栏宽，避免中间帧小于展开 `minSize` 被库自动 collapse（收起后再点开无效）。导航是**纵向栏**（`flex-col` + 每项 `w-full`），不随侧栏变宽改成横排。
- **归档区**：用 `Collapsible` 高度过渡，不要卸载再 `animate-page-in`。

允许:

- hover / focus / disabled 的颜色、边框、透明度、底纹
- 按钮、导航、可点行的按压 `scale`（约 `0.98`，走 `motion-press` / `motion-row`）
- 对话框遮罩 opacity fade + 面板 `scale(0.96) → 1`（`--ease-spring`，约 300ms）
- 主区切页 / 页内 Tab：`motion-enter`（opacity + `translateY(4px) → 0`）。不要再叠 View Transition
- 分段胶囊 Tab（`SegmentedTabs`）：浅灰底槽 + 白底选中块；键盘左右/Home/End
- 总览 KPI 卡 hover 轻抬 `translateY(-2px)` + `--shadow-lift`（可叠在 `motion-press` 上）
- 开关拨动、文件树 chevron 旋转（组件内部）
- 图表首次绘制（约 600ms，`ease-out`）；排行表微进度条 `scaleX` 入场
- Skeleton 极弱 pulse（只变透明度，禁止彩色跑条 / shimmer）

禁止:

- bounce 关键帧、循环装饰动画、滚动视差、粒子、彩色 glow
- 入场 zoom 超过弹窗那一次 `0.96→1`；整页横向滑入；View Transition 与 `motion-enter` 叠用
- 彩色 shimmer 或旋转表演当加载反馈
- 把单行「加载中…」当作全壳唯一加载态（查看器文件切换等局部态可用短文案，但主区首次加载必须是 Skeleton）
- 在 `features/` 里复制 `transition-[…] duration-* ease-* active:scale` 长串

`prefers-reduced-motion: reduce`：取消 scale、fade、pulse、位移、图表入场，只留颜色 / 边框变化。`motion-enter` 此时无动画。

## 7. 禁用清单

- 渐变（背景、文字）一律禁止
- 玻璃拟态（`backdrop-blur` 叠层）一律禁止
- `shadow-md` 及以上、超出 `--shadow-thumb` / `--shadow-lift` 的 box-shadow 禁止（含组件库默认阴影，引入后必须剥掉）
- bounce 关键帧、循环入场、滚动视差、粒子禁止
- 装饰性插画、emoji 当图标、花哨 icon 变体禁止
- 荧光色 / 高饱和强调色禁止；状态色与 §2 的图表/文件树系列色除外
- 主按钮必须黑底白字；灰底灰字的「主按钮」禁止
- 圆角超过 16px 的元素禁止（胶囊标签除外）
- 页面里手写第三套按钮 / 输入 / Tab 样式禁止——必须走 §8 的组件

## 8. 组件与 token（Tailwind 4 + 组件源码）

跨页复用的纯展示控件放 [`apps/web/src/components/`](../../apps/web/src/components/)（见 [project-structure.md](./project-structure.md) 第三节）。页面与 feature 只组合这些变体，不在业务文件里复制 `rounded-lg bg-ink-strong px-3 py-2`。

`index.css` 同时声明产品 token 与组件库 CSS 变量，数值必须一致:

```css
@import "tailwindcss";

@theme {
  --color-ink-strong: #030712;
  --color-ink-mid: #4b5563;
  --color-ink-faint: #9ca3af;
  --color-line: #e5e7eb;
  --color-line-strong: #9ca3af;
  --color-surface: #f9fafb;
  --ease-spring: cubic-bezier(0.34, 1.3, 0.64, 1);
  --ease-smooth: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-out-quad: cubic-bezier(0.25, 1, 0.5, 1);
  --duration-instant: 100ms;
  --duration-fast: 200ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
}

:root {
  --background: #ffffff;
  --foreground: #030712;
  --primary: #030712;
  --primary-foreground: #ffffff;
  --muted: #f9fafb;
  --muted-foreground: #4b5563;
  --border: #e5e7eb;
  --ring: #9ca3af;
  --radius: 0.5rem;
}
```

组件规则:

- 文本用 `ink-strong` / `ink-mid` / `ink-faint`，禁止 `text-black` 或随意 hex
- 边框 `border-line`；底纹 `bg-surface`
- 状态色用 Tailwind 语义类（`green-700` 等），禁止自定义
- 条件 class 用 `cn()`（`clsx` + `tailwind-merge`），不要再叠一套字符串拼接惯例
- 图标仅 Lucide 线性、默认 16px、`text-ink-mid`；只在能代替文字或帮助扫读时使用（搜索、设置、添加、更多、侧栏收起后的导航）。**展开侧栏仍以文字为主**；收成图标栏时，图标 + Tooltip 承担名称，不得只留一个无标签方块
- 引用本规范数值时写 Tailwind 类名（如 `text-sm`），不写 px 值
- 跨页复用还必须覆盖：可收起侧栏、拖边改宽、ScrollArea、Skeleton、Tooltip、折叠/手风琴、图表容器、表、**分段胶囊 Tab（`SegmentedTabs`）**、**动效类别（`motion-press` / `motion-fill` / `motion-enter` / `motion-row`）**。禁止在 `features/` 里再手写第三套按钮、侧栏、条形图、下划线 Tab，也禁止复制 duration/ease 串
- 切页只引用 `motion-enter`，不要 `startViewTransition`。侧栏收起的宽度过渡写在 `index.css`（`.sidebar-motion`），拖拽时加 `.sidebar-dragging` 关掉。侧栏主体是纵向 flex 栏，以后树状导航放进同一滚动区，不要改成行内横排

## 9. UX 铁律（旅程）

人用壳的第一性是「用户把事做完」。视觉服从上面各节；旅程服从本节。

1. **第一印象。** 总览必须在约 1 秒内读出：库存是否健康、下一步点哪。健康数字用 §3 的页面标题档拉开；「需要处理」每条可执行，不要只是句子。
2. **每一次点击都有理由。** 能少一步就少一步。收录 / 创建用对话框一次填完，不要先点药丸再展开一截表单。
3. **空状态带主动作。** 「还没有」必须配一个主按钮（去收录、去管应用），不要只留一句灰字。
4. **反馈只有一条通道。** 成功 / 失败走 Toast（成功自动消失，失败可关掉）。危险写盘走确认对话框。不要页脚横条、页内 `result` 字符串、Toast 三套并存。
5. **开关用开关。** 启用 / 停用是二元状态，用 Switch，不用再造一套「开 / 关」文字按钮（批量启用仍用主 / 次 / 危险按钮 + 确认）。
6. **主路径保持干净。** 不放哈希、命令面板、verify / doctor 原文。分组 / 分析 / 分享是 Skills「内容」的次级动作，不是左侧导航。
7. **诚实提示未解的下游。** 链接写盘成功后，说明磁盘已改、运行中应用可能仍要新开对话。不要假装 IDE 已经热加载。
8. **为所有人可完成。** 键盘能走到所有主控件；对话框有焦点陷阱与 Esc；状态不只靠颜色（文字优先，与 panel-ia D4 一致）。

## 10. 深色模式

**v1 仍不做深色模式。** 理由同 v0：高频内部工具，浅色已够用；半吊子深色比没有更伤。再立 issue 的前提：1) 明确用户需求；2) 浅色方案已在本规范组件体系上稳定；3) 只换 `:root` / `@theme` 值，不污染组件。

## 11. 虚拟列表行高

人用 IA 不是三栏。本节只约束仍在用的虚拟列表行高。

| 档 | Tailwind | 用途 |
| --- | --- | --- |
| 集合行 | `h-10` | 技能列表每一行 |

规则:行高只用这一档。实现里的像素常量必须等于 `h-10`（40px）。选中用 `bg-surface`；焦点用内收的 `outline-line-strong` 或 1px `ring-line-strong`。不用阴影表达选中。列间只用 `border-line`，不要 `gap-*` 当分隔。

## 12. 人用壳（侧栏 + 隐藏滚动条）

| 项 | 口径 | 说明 |
| --- | --- | --- |
| 侧栏默认宽 | `w-56`（224px） | 展开态默认；写入 `localStorage` 键 `skills-hub.shell` |
| 侧栏拖宽 | 约 180–360px | 展开时可拖分隔条；收起时不可拖 |
| 侧栏收起 | 图标栏（约 48px） | 宽度插值 + 文字淡出（不卸载标签）；导航项纵向排列；三板块 + 左下角设置仍可达；收起后名称用 Tooltip |
| 主区 | `min-w-0 flex-1` | 吃剩余宽度；切页只用 `motion-enter` 缓动刷新 |
| 分隔 | `border-r border-line` 或 1px 拖条 | 不要 `gap-*` 当列分隔 |
| 设置 | 侧栏底部打开 Dialog | **不是**主区第四页；冒烟 `nav-settings` 留在左下角按钮 |
| 选中项 | `bg-surface text-ink-strong` | 与列表选中同一套 |
| 加载 | Skeleton | 全壳一种；离线横条与 Skeleton 分开，不要两句灰字叠在一起 |
| 长名单 | 超过约 6 项进折叠卡 / 手风琴 | 禁止整页纯文字 `clientId` 清单 |
| 路径 / id | 截断 + Tooltip 全文，等宽 | 不靠把列撑爆来显示 |

滚动保留，滚动条**视觉隐藏**（`scrollbar-width: none`；`::-webkit-scrollbar { display: none }`）。可滚动区域走 `ScrollArea`（或等价封装），避免 Windows 上全局 `*` 选择器漏网。不要装饰性滚动条。页面根 `overflow: hidden`。不做移动端专门设计。虚拟列表仍自己管 `scrollTop`，不要外包一层会抢走滚动事件的容器。

## 13. 例外裁定

与「克制 / 可预期」相冲突且本规范未覆盖的场景，默认按最保守方案。需要突破时先在 PR 里说明理由，由 review 裁定后回写本规范。
