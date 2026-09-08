# 设计基准（DESIGN）

本文件是 PocketWebShell 视觉设计的权威基准。任何 UI 改动必须与本文件一致；AGENTS.md 引用本文件。

## 1. 配色理念

以苹果设计理念为准：

- **浅色模式 = iOS 分组灰底白卡**：背景 `#F2F2F7`（systemGroupedBackground）托纯白卡片，层次靠"灰底/白卡/发丝描边"与留白区分，不靠彩色块、不靠阴影堆叠。
- **深色模式 = 纯黑基底**：背景 `#000000` 体系，卡片 `#1C1C1E`，文字近白。
- **次要文字 AAA 级可读**：副标题/备注统一 `onSurfaceVariant = #55555B`（白卡上 7.4:1，达 WCAG AAA）；禁用踩线灰。
- **中性灰统一冷调**：全站灰阶与品牌蓝同温区，杜绝"粉肉色"观感。
- **强调色克制**：全局单一强调色，只用于选中态、关键操作与进度指示，不大面积铺色。
- 不支持动态取色的设备同样遵守以上基底，不回退到彩色主题。
- **主屏壁纸例外（0.1.14）**：主屏采用内置静态蓝色流线壁纸（深色模式对应低亮度版本），照片模式由用户照片替换；上述中性背景约束适用于添加、浏览器及设置等功能页面。壁纸不引入动态主题色，且无常驻动画。

## 2. 主题模式

应用提供四种主题模式，体验对齐手机系统"换壁纸即换主题"：

| 模式 | 行为 |
|---|---|
| 跟随系统 | 随系统深浅色切换纯白/纯黑基底 |
| 纯白 | 固定浅色 |
| 纯黑 | 固定深色 |
| 照片壁纸 | 用户上传照片作为主页壁纸，并从照片提取主色生成整套配色 |

照片主题规则：

- 照片只作为主页壁纸背景（`ContentScale.Crop`），网格区叠加可读性 scrim，保证图标与文字可读。
- 主色用 AndroidX Palette 从壁纸提取；取色与图片解码必须在后台线程。
- 照片复制到应用私有目录后持久化路径，不直接持久化 content URI。

## 3. 玻璃拟态（Liquid Glass）基准

底部导航及浮层组件以 iOS Liquid Glass 为视觉基准：

- 半透明材质 + 背景实时模糊（backdrop blur）；
- 边缘 1dp 量级的高光描边，模拟玻璃受光；
- 悬浮胶囊形态，大圆角，与内容之间留有间距；
- 选中态指示器动画不得改变布局边界。

实现统一使用 Haze 库（`dev.chrisbanes.haze`），禁止自绘第二套模糊实现。当前显式半径为 20dp；HazeStyle 浅/深色 tint 为 0.38/0.48，旧平台 fallback tint 为 0.88/0.90。`staticGlassSurface` 为其他浮层提供静态材质与边缘光，不含第二处实时模糊。Android 实现不等同于 Apple 私有的折射引擎。

## 4. 组件库选型原则

- **优先引入成熟开源组件库/SDK**，不自己造轮子；自绘模仿达不到成熟库的真实效果。
- **同一功能只引入一个统一的库**（例如玻璃模糊统一用 Haze），不为同类效果堆砌多个库。
- 引入前确认：开源协议兼容（项目本身开源，Apache-2.0/MIT 等可直接使用）、维护活跃、支持 minSdk 29。
- 选型结论记录在本文件或相关模块文档中，避免重复调研。
- **禁止保留未使用的库声明**：曾声明未用的 Lottie、reorderable 已于 0.2.0 清理。

### 4.1 前端设计组件库完整清单（权威）

| 能力 | 库 / 版本 | 说明 |
|---|---|---|
| UI 基座 | Jetpack Compose BOM 2026.08.00（`ui` / `ui-graphics` / `material3`） | 唯一 UI 框架，M3 组件为素材底座 |
| 图标 | `material-icons-core` + `material-icons-extended` 1.7.8 | 全端统一图标来源，禁止引入第二套图标库 |
| 玻璃模糊 / backdrop blur | Haze 1.7.2（`dev.chrisbanes.haze:haze` + `haze-materials`） | 全屏至多 1 处实时模糊（底部导航），见 PERFORMANCE.md |
| 图片加载 | Coil 3.6.0（`coil-compose` + `coil-network-okhttp`） | 网站图标、壁纸预览统一入口 |
| 壁纸主色提取 | AndroidX Palette 1.0.0（`palette-ktx`） | 照片主题取色，后台线程执行 |
| 字体 | 内置 MiSans（regular / medium / semibold，子集化 TTF） | 全设备字度量一致，杜绝系统字体替换导致的文字截半 |
| 动效 | Compose Animation（随 BOM）+ `AppMotion` token | 150–250ms 过渡 + 弹簧曲线，不引入 Lottie/GIF 动图库 |

已确认不引入：Lottie（动效需求由 Compose Animation 覆盖）、第三方拖拽库（主页 DragLayer 为自研且受 launcher 不变量约束）。

## 5. 统一设计系统层（core/designsystem）

自 0.2.0 起，全部页面必须构建在统一设计系统层之上，禁止绕过。

### 5.1 设计 token

| token | 位置 | 规则 |
|---|---|---|
| 配色 | `theme/Color.kt` | 浅/深两套全量 M3 token 显式定义；副标题/次要文字一律 `onSurfaceVariant`，`outline`/`outlineVariant` 只用于描边与分割线 |
| 字体 | `theme/Type.kt` | MiSans 字阶：标题 Semibold、功能文本 Medium、正文 Regular；行高 ≥ 1.3× 字号 |
| 圆角 | `theme/Shape.kt` | 8 / 12 / 16 / 20 / 28 五档 |
| 间距 | `theme/Spacing.kt` | `AppSpacing`：4 / 8 / 12 / 16 / 24 / 32 六档 |
| 动效 | `theme/Motion.kt` | `AppMotion`：fast 150ms / normal 250ms / spring |

### 5.2 统一组件

| 组件 | 用途 |
|---|---|
| `AppCard` | 分组卡片：20dp 圆角、`surfaceContainerLow` 底（浅色纯白）、0.5dp 低透明度发丝描边、零阴影 |
| `AppListRow` | 列表行：单行 ≥56dp、双行 ≥72dp；21dp 图标，可配 30dp 彩色圆角底；副标题强制 `onSurfaceVariant` |
| `AppListDivider` | 卡片内分割线，左缩进对齐文字起点 |
| `AppSectionHeader` | 分组标题，置于卡片上方（iOS 分组列表风格） |
| `AppBadge` | 红色通知徽标（最大 99） |
| `AppConfirmDialog` | 居中 304dp 最大宽度、28dp 圆角、等宽双按钮的确认框 |
| `Modifier.glassSurface` | 玻璃材质修饰符（Haze 实时模糊 + 高光描边），底部导航等浮层唯一实现 |
| `Modifier.staticGlassSurface` | 菜单、文件夹、搜索胶囊的缓存静态材质，无实时 blur |
| `AppNavigationBar` / `AppSwitch` | 固定居中标题与返回入口 / 具有原生无障碍语义的绿色开关 |

### 5.3 页面结构约定

- 设置类页面 = iOS 分组列表：`AppSectionHeader` + `AppCard(contentPadding = 0)` + 若干 `AppListRow` + `AppListDivider`。
- 文本输入框高度 < 56dp 时禁止使用 M3 `OutlinedTextField`（固定内边距会截字）；用 `BasicTextField` 自绘胶囊容器，文本垂直居中。
- 任何副标题、占位、说明文字使用 `onSurfaceVariant`；禁止把 `outline` 用作文字色。
- 设计验收常驻入口：我的 → 开发者选项 → 设计 Playbook（实时预览全部 token 与组件）。

## 6. 主屏图标与情境菜单（iOS 主屏基准）

### 6.1 应用图标

对齐 iOS 主屏：图标本体直接落在壁纸上，**禁止底座/卡片容器**。

- 圆角由图标本体自行裁剪（`RoundedCornerShape(cornerRadiusPercent)`，默认 26%，用户可调）；
- favicon/官方 logo 以白底衬底（兼容透明 PNG）+ `ContentScale.Crop` 等比放大贴满圆角边界，不内缩加边距；加载失败回退首字母色块（不留白底空块）；
- 首字母兜底按标题 hash 取高对比配色：浅色主题 pastel 底 + 深色字，深色主题深饱和底 + 近白字（不用 `primaryContainer`，对比度不足）；
- 文件夹 = 静态半透明材质与细边缘光 + 3×3 成员预览（不引入第二处实时模糊）；展开采用九个成员一页、可横向翻页的有界面板；
- 收藏应用用 2dp `primary` 边框标识；
- 添加入口 = 低不透明度静态玻璃方块和加号，明确"非应用"的从属身份。
- 默认图标 60dp（仅未保存尺寸的用户）；已有图标尺寸设置保留。网格由 `LauncherGeometry` 根据可用宽高、行列与字体缩放确定，不读取图片固有尺寸。
- 主屏 Dock 为 88dp 高四图标托盘；功能页切为 66dp 高标签栏；系统导航安全区单独计算，禁止用硬编码 96dp 替代真实 inset。壁纸位于内容 padding 之外并覆盖整个 Dock 采样源。

### 6.2 情境菜单（`AppContextMenu`）

长按图标的交互遵循 iOS 顺序，由**单通道手势状态机**实现（`awaitEachGesture`，长按与点击互斥）：**长按先弹菜单 → 按住继续移动累计位移超过 16dp（Launcher3 `deep_shortcuts_start_drag_threshold`）后菜单淡出、图标跟手进入拖拽 → ≤16dp 松手则菜单保留**；长按确认前位移超 touchSlop 则取消并交还 pager 滚动。

菜单对齐 HyperOS/iOS 主屏长按的**锚点浮窗**样式（非全屏居中面板）：

- 以**手指按压点**为定位基准（Launcher3 `ArrowPopup.orientAboutObject` 的本地化派生）：**垂直**优先向按压点上方展开，上方放不下且下方空间更大时翻转到下方；**水平**以按压点居中展开；四边以屏幕边距钳制（clamp），任何边缘位置菜单都不被截断；弹出动画锚点（`transformOrigin`）始终指向按压点；
- 菜单体：最大宽 252dp、20dp 圆角、`surfaceContainerHigh` 94% 静态材质与 0.5dp 边缘光；受可用高度限制，超高可滚动（不新增第二处实时模糊，见 PERFORMANCE.md）；
- 动作项为**纵向列表**：左文字、右侧 21dp 单色图标，行高至少 48dp，行间细分隔线；
- 破坏性操作（删除）`error` 红色文字、与常规项以整分隔线隔开置底；
- 弹出动画统一走 `AppMotion.popupEnter`（scale 0.92→1 + 淡入，锚点指向按压点），点击外部 scrim 关闭。

### 6.3 编辑（jiggle）模式

**双指捏合（内划）**进入编辑模式，**双指外扩 / 完成按钮 / 返回手势**退出。对齐 HyperOS 桌面编辑态：

- 进入时所有图标做 iOS 式小幅旋转抖动（±1.6°，130ms 往返）；
- 每个图标左上角圆形勾选角标：选中 `primary` 实心 + 对勾，未选中半透 `surface` + 描边空心；
- 右上角半透明"完成"胶囊按钮；
- 底部半透明操作行：选中计数 + 全选/清空；
- 编辑模式下点按切换勾选（不启动应用、不弹长按菜单、不进入拖拽）。

### 6.4 统一动效（`AppMotion`）

全局过渡复用 `core/designsystem/theme/Motion.kt` 中同一组规格，禁止各页面自造参数：

- **主 Tab 切换**：`Crossfade`（250ms，不改布局）；
- **二级/三级页面进入/退出**：`enterDetail`/`exitDetail`（右滑入 28% + 淡入 / 右滑出 + 淡出），我的、开发者中心、Playbook 全部接入 `AnimatedContent`；
- **菜单/弹窗弹出**：`popupEnter`/`popupExit`（scale 0.92→1 + 淡入，弹簧 640/0.82）；
- 装饰动画不得改变布局 bounds（PERFORMANCE.md）。

### 6.5 开发者选项

我的 → 开发者选项为一级全屏页面（iOS 设置层级），内含应用信息、日志查看（`AppLog` 环形缓冲，500 条，纯内存）、图标缓存清理与设计 Playbook 入口。日志禁止记录浏览内容、Cookie、凭证、完整查询串（AGENTS.md 安全条款）。

### 6.6 自由摆放与自动整理（`autoArrangeHome`）

对齐主流 Android 桌面（Pixel Launcher / HyperOS / One UI 均为此模型），主页布局提供「自动整理桌面」开关，**默认关闭 = 自由摆放**：

- **自由摆放（默认）**：网格为稀疏模型，每个图标保持自己持久的 `(page, slot)`，空槽是真实占位；拖拽松手后吸附到最近的网格槽（含空槽）并停留在那里，绝不自动压实回前排。落到空槽直接落子；落到已占用槽则双方交换（文件夹整体交换）。新应用追加到末页首个空槽；解散文件夹时首个成员占原槽位、其余顺序填充后续空槽；移出文件夹的成员落在文件夹旁首个空槽。
- **自动整理（开启）**：恢复传统压实排列，拖拽即按 hover 位置插入重排，无空槽概念。
- 两种模式共用同一套持久化字段，切换开关不丢任何位置数据；持久化的 `page/index` 在各自模式下保持稠密或稀疏的确定性（AGENTS.md launcher 不变量）。

### 6.7 桌面滑动模式与全部应用入口（0.1.11 起）

- **桌面滑动模式**（主页布局 → 桌面滑动）：`pager` 左右翻页（默认）/ `vertical` 上下滚动。vertical 模式把所有页摊平成一条 LazyVerticalGrid，空槽保留占位，落子换算回 `(homePage, homeCellIndex)`（数据模型不变）；拖拽悬停顶部/底部边缘自动滚动；页码指示器仅 pager 模式显示。
- **拖到左右边缘开新屏**（pager 模式）：末屏右缘/首屏左缘悬停约 900ms 在该侧插入临时空白屏并翻过去（左侧落子经 `HomePages.resolvePrependMove` 新开首屏、其余页后移），未落子即裁掉；一次拖拽最多开一个临时屏。
- **交互层拆分**（0.1.13 起）：`HomeInteractionState` 集中持有全部拖拽/菜单/编辑模式会话状态（手势协程只捕获该稳定持有者，杜绝组合期快照过期）；`HomeGestures.kt` 承载 cell 手势检测（tap/长按/即拖）、根级拖拽会话 `homeDragSession`（翻页后源 cell 随旧页移出组合，会话挂在 cell 上会被取消——必须活在根级）、空白长按菜单、双指捏合编辑模式与 `HomeDragEffects` 边缘悬停状态机（单 `snapshotFlow` 循环，非 key 重启式 Effect；写 `tempPageSide` 后须等帧再滚动，否则被旧 pageCount 钳制）。
- **「全部应用」浮动入口**：与 AppIcon 同尺寸圆角方块 + `Icons.Filled.Apps`，半透明 `surfaceContainerHigh` 底（不新增实时模糊，见 PERFORMANCE.md），默认右下角，可自由拖动（位置归一化 0..1 持久化）；点按打开抽屉，长按菜单/空白处长按菜单/设置页三处共用 `allAppsEntryVisible` 显隐。
- **搜索与浮动入口默认值（0.1.14）**：主屏底部搜索胶囊可直接打开 App 资源库，支持标题/URL 搜索。翻页/拖拽期间按设置显示页码点；新用户和未保存显隐值的用户默认关闭旧浮动入口，已保存的 true/false 与归一化位置完全保留。
- **全部应用抽屉**：全屏 Dialog，按标题首字符分区（汉字经 pinyin4j 取拼音首字母，其余归 `#`），右侧 A→Z/# 字母索引条支持点按与按住滑动跳转，当前字母放大气泡，空分区置灰。
- **空白处长按菜单**：根布局 Initial pass 手势通道（先于子级图标/pager 手势收到事件），按压点落在已占用 cell 或浮动入口上时不响应。
