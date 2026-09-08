# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow the rules in `docs/VERSIONING.md`.

## [0.1.16] - 2026-09-07

### Added

- 解散文件夹二次确认：主页长按菜单与文件夹展开页的「解散文件夹」均先弹出确认对话框（复用 `AppConfirmDialog`），确认后才解散；文件夹成员移回主屏幕，应用本身不会被删除。
- 长按应用 Logo 的情境菜单新增「复制应用链接」，一键把站点 URL 写入剪贴板并弹出底部浮层提示。
- 设置页「后台会话」收敛为最多展示前 3 条；超过 3 条时提供「全部会话」入口，进入独立页面统一管理全部保活会话（含逐条结束）。

### Testing

- `testDebugUnitTest`、`:app:assembleDebug` 与 `:app:assembleDebugAndroidTest` 通过。
- `:app:connectedDebugAndroidTest` 在 `webshell-ios-qa-api35`（API 35）上全部通过。
- 手动冒烟（API 35 模拟器）：长按图标菜单出现「复制应用链接」并复制成功；解散文件夹弹确认弹窗、取消不生效、确认才解散；后台会话超过 3 条时出现「全部会话」入口并可逐条结束。

## [0.1.15] - 2026-09-07

### Changed

- 清理页面层旧控件与重复实现，统一表单、图标、选择行、弹窗、面板和设置分组；应用层 Playbook 聚合各模块的真实生产组件，并使用隔离夹具演示。
- 设置 → 外观与主题新增 MiSans、系统字体、Noto Sans SC 和 90%–130% 界面字号；字号只影响应用界面，不覆盖网站自身的文字缩放。
- 浏览器顶部收敛为菜单、地址和标签的一行工具栏；进入网页后底部导航直接收成玻璃 Orb（进入网页、切换标签或页内导航时立即收缩，不再依赖滚动检测），Orb 支持边缘停靠并可点击召回完整导航。

### Fixed

- 恢复添加网址时的站点图标发现：补齐 Coil 3 网络加载组件（`coil-network-okhttp`），抓取的网站图标重新作为应用 Logo 显示，无图标站点仍回退为首字符。
- 修复深色模式下浏览器菜单按钮（⋯）呈灰色难以辨认的问题，图标改用 `onSurface` 前景色，随主题自动适配。
- 修复浏览网页时内容区域闪烁：浏览器底部 Dock/Orb 改为静态玻璃材质，不再对 WebView 逐帧实时模糊采样；同时移除阅读手势的 JS 探测注入。
- 保留已有网站的 `textZoomPercent`，新添加的网站固定从 100% 网页字号开始；修复页面层重构过程中旧网站缩放被应用字体设置覆盖的风险。
- 修正 WebView 宿主安全区、会话监听和原生视图绑定，确保回调按 `sessionId` 更新对应标签页，并避免重复网页壳造成的状态串扰。
- 目录回归使用本地化资源查找交互入口，滚动页面的端侧查找只接受实际位于视口内的节点，避免误点被 Dock 覆盖的控件。

### Testing

- `testDebugUnitTest`、`:app:assembleDebug` 与 `:app:assembleDebugAndroidTest` 通过。
- `:app:connectedDebugAndroidTest` 在 `webshell-ios-qa-api35`（API 35）上 17/17 通过；滚动检测手势及其用例随功能一并移除。
- 手动冒烟（API 35 模拟器）：添加 github.com 后主屏显示抓取的网站图标；进入网页、页内导航与新建标签页时底部导航立即收成 Orb，点击 Orb 召回完整 Dock；深色模式下浏览器菜单按钮为白色。
- API 30/31 回退实机/模拟器验收未执行：当前工作环境没有可用的 API 30/31 设备；未将其标记为通过。

## [0.1.14] - 2026-09-06

### Changed

- 主屏视觉对齐 iOS：全屏静态流线壁纸、四图标悬浮 Dock、约束驱动的桌面网格、白色阴影标题、搜索/页码胶囊与 3×3 文件夹预览。已有照片壁纸、图标设置及稀疏位置数据继续保留。
- 统一玻璃材质、文字字阶、分组列表、情境菜单与导航层级；添加页面和浏览器工具栏采用一致的 iOS 风格原生呈现。
- 呈现层职责拆分：应用壳集中管理安全区/壁纸/Dock，主页分离几何与单元呈现，主题状态经 Hilt ViewModel 单独投影，避免位置设置使整棵主题树重组。

### Fixed

- 壁纸延伸至 Dock 后方，修复玻璃采样到空白底色的问题；实时模糊半径显式限制在 24dp 以内，其他浮层使用静态材质。
- 非编辑状态不再维持图标抖动动画；照片取色修复路径清除后的旧色残留、超长图片采样及临时位图回收。
- 安全区随真实 Android 系统栏变化，浅/深主题更新系统栏对比度；外部 URL 打开时保活登记不再被全屏提前返回跳过。

### Testing

- 新增桌面约束几何、壁纸取色采样与端侧视觉/导航回归；以独立 Android 15 模拟器检查标准宽度、紧凑宽度、深色主题、文件夹与多页交互。

## [0.1.13] - 2026-09-02

### Fixed

- 翻页模式拖到右缘/左缘悬停开新屏"没反应"的根因修复（端测截图 + 日志实证）：拖拽跟踪协程此前挂在被拖图标的 composable 上，翻页动画落定后源页被 Pager 移出组合，协程被一并取消——状态清零、临时屏回弹、落子丢失。拖拽会话主循环上移到根级容器（对齐 Launcher3 DragController 分层），翻页/开新屏后源 cell 被 dispose 也不再影响会话。
- 临时屏创建同帧立即滚动会被旧 pageCount 钳制回 0（pageCount 随重组才生效）：写 `tempPageSide` 后等重组帧再翻页。
- 边缘悬停翻页改为单 `snapshotFlow` 循环状态机：旧实现依赖 `LaunchedEffect` key 重启，翻页后 finally 同帧重算的边缘方向（1→0→1）对组合期 key 不可见，二次翻页/连续跳页永远不会发生。

### Changed

- feature/home 交互层拆分重构：新增 `HomeInteractionState`（集中持有拖拽/菜单/编辑模式会话状态与布局注册表，手势协程只捕获该稳定持有者，杜绝组合期快照过期）与 `HomeGestures.kt`（`homeCellGesture` cell 手势检测、`homeDragSession` 根级拖拽会话、`homeBlankAreaMenu` 空白长按菜单、`homePinchEditMode` 双指捏合、`HomeDragEffects` 边缘悬停状态机）；`HomeScreen.kt` 只保留组合根、网格容器与菜单/对话框浮层。
- 新增主页手势仪表化测试 `HomeGestureInstrumentedTest`（真实 MotionEvent 注入 + Room 落库断言）：页内交换拖拽、长按菜单、右缘/左缘开新屏、空白长按菜单、编辑模式即按即拖、全部应用抽屉共 7 条验收路径。

## [0.1.12] - 2026-09-02

### Fixed

- 拖到末屏右边缘无法开新屏：临时屏状态是翻页 `LaunchedEffect` 的 key，写入瞬间 effect 自我取消、正在执行的翻页动画被掐死，随后进入"已有临时屏"分支永久卡住。改为状态不作为 effect key（Launcher3 extra empty screen 语义不变：松手未落子自动裁掉）。
- 拖拽中的页号映射改用现算偏移：组合期捕获的偏移快照在临时屏插入后会过期，导致落点解析/落子页号错误。

### Added

- 首屏左边缘开新屏：拖拽中停在首屏左缘约 900ms 在左侧插入临时空白屏，落子后被拖图标落到新首屏，其余页面整体后移一页（`HomePages.resolvePrependMove`）；右缘行为保持末屏追加。
- 编辑（jiggle）模式即按即拖：图标位移超触摸阈值（touchSlop）直接进入拖拽，原地松手仍为勾选切换，全程不弹长按菜单（对齐 iOS/HyperOS jiggle）。

## [0.1.11] - 2026-09-02

### Added

- 桌面滑动模式设置（主页布局 → 桌面滑动）：左右翻页（默认，现状行为）/ 上下滚动两种模式可切。上下滚动模式把所有页摊平成一条纵向列表（自由摆放保留空槽占位），数据模型不变——落子时全局下标换算回 `(homePage, homeCellIndex)`；拖拽中手指悬停顶部/底部边缘自动滚动并重解析落点；页码指示器仅在该模式隐藏。
- 左右翻页模式：拖拽中手指停在最后一屏右边缘约 900ms 自动追加临时空白页并翻过去，可直接落子；松手未落子则临时页自动裁掉，「默认只有一屏」不被破坏。
- 「全部应用」浮动入口：主屏右下角半透明圆角图标（可自由拖动，位置归一化持久化），点按打开全部应用抽屉，长按弹菜单可隐藏；主页布局新增「显示全部应用入口」开关，空白处长按菜单亦可切换显隐。
- 全部应用抽屉：按标题首字符分区（ASCII 字母大写，汉字经 pinyin4j 取拼音首字母，其余归 #），A→Z、# 殿后；右侧字母索引条支持点按与按住滑动连续跳转，当前字母放大气泡提示，无应用分区置灰不可点。
- 空白处长按菜单（Initial pass 手势通道，不与图标/pager 手势竞争）：「编辑模式」进入 jiggle 批量整理；「隐藏/显示全部应用入口」。

## [0.1.10] - 2026-09-01

### Added

- 应用内日志持久化：`AppLog` 新增 INFO/WARN/ERROR 级别与可插拔持久化汇，日志经 Room（新增 `app_log` 表，v2→v3 显式迁移，不丢存量数据）落盘，进程结束后仍可回看。
- 崩溃捕获：接管未捕获异常，把崩溃堆栈作为 ERROR 级「crash」日志在进程死亡前同步写入数据库，再转发原默认 handler。
- 监测点扩展：页面加载/加载完成/加载失败/SSL 错误（只记 host）、浏览器标签新建/切换/关闭、网页应用会话打开/关闭、前台保活服务启停、添加网站成功与失败（含失败原因）、应用启动版本号。
- 日志查看页新增红色清空按钮（二次确认弹窗），清空全部持久化日志。

### Changed

- 日志查看页重构：从 Room 倒序分页读取（每页 30 条，滚动到底自动加载更多，不再受内存环形缓冲 500 条上限约束），标签过滤走数据库查询。
- 复制/分享改为完整导出：含导出头部（导出时间、应用版本、设备型号、Android SDK、条目总数）与当前过滤条件下的全部条目；分享生成 TXT 文件经 FileProvider 以 `EXTRA_STREAM` 发出。

## [0.1.9] - 2026-09-01

### Fixed

- 长按菜单永远钉在左上角：Popup 内部的全屏 scrim 把 popupContentSize 撑成整个窗口，定位公式的 clamp 把所有结果压到 (margin, margin)。移除内置 scrim——外部点击关闭由 focusable Popup 的 outside-touch → onDismissRequest 承担（该 scrim 本身无视觉背景，无观感损失）。菜单恢复以按压点为中心、在图标附近弹出。

## [0.1.8] - 2026-09-01

### Fixed

- 长按图标误触打开应用：旧实现 clickable 与 detectDragGesturesAfterLongPress 双通道并存，长按原地松手会同时弹菜单并打开应用。图标手势重构为单通道 `awaitEachGesture` 状态机——长按与点击天然互斥，超时前松手算点击、超时前位移超 touchSlop 取消交还 pager；长按弹菜单后继续移动累计位移超过 16dp（Launcher3 `deep_shortcuts_start_drag_threshold`）才进入拖拽，≤16dp 松手菜单保持打开。
- 首字母兜底图标白底无字：远端 logo 加载失败（404/网络拦截/格式不支持）时回退首字母色块（`SubcomposeAsyncImage` error 兜底），不再只剩白底空块；首字母色板新增深色主题配色（深饱和底 + 近白字）。

### Added

- 主页长按菜单新增「重命名」「更改图标」「强制刷新」：重命名走对话框；更改图标支持输入地址或上传本地图片（复制到应用私有 icons 目录）；强制刷新重新抓取站点标题与 logo，结果轻量 toast 提示。

### Changed

- 官方 logo 贴边裁剪：远端 logo 以 `ContentScale.Crop` 等比放大铺满圆角方块（四边贴到圆角边缘），不再内缩留白边。
- 情境菜单定位重写为 Launcher3 派生公式：垂直优先向按压点上方展开（上方放不下且下方空间更大时翻转到下方），水平以按压点居中，四边 clamp 屏幕边距，弹出动画锚点（transformOrigin）始终指向按压点。
- `SiteMetadataFetcher` 从 feature/add 迁至 core/data（含 Hilt 模块、单测与 okhttp/jsoup 依赖），feature/add 与 feature/home 强制刷新共用。

## [0.1.7] - 2026-09-01

### Fixed

- 标签页串台：浏览器进度/加载/返回前进/标题/URL 从屏幕级单一状态改为 per-tab 状态，WebView 回调按 sessionId 归属写回自己的标签，开多标签互切不再互相污染。
- 后台标签回调丢失：`ShellWebView` 新增随会话存活的持久 `sessionListener`（不随 Compose 组合摘除），后台标签加载完成后的标题/URL/历史记录不再丢失。
- 池淘汰失控：`WebViewPool` 从插入序 FIFO 改为真 LRU（access-order），激活会话受保护永不淘汰；淘汰/重建通过池级快照保留返回栈；淘汰时回调通知浏览器同步移除标签。
- 登录态不共享：浏览器标签统一使用 WebView 默认共享 Profile（原先每个会话独立 Profile，cookie/token 互不共享）；网页应用壳保留独立 Profile 隔离。
- 移动模式 UA 改为不含 `Version/4.0` 与 `wv` 标记的 Chrome Android UA，修复部分站点（Google 登录、若干移动站）拒绝/降级服务。
- ShellScreen 新窗口会话泄漏：`onNewWindow` 复用当前会话加载 URL，不再遗留无人销毁的 `browse-*` 孤儿会话。

### Changed

- 切走的后台标签 `onPause` 暂停渲染与媒体，切回 `onResume`（后台音视频不再继续播放）。
- 关闭标签改为彻底销毁（不留会话快照），并同步清理桌面模式记忆与会话监听器。
- `thirdPartyCookies` 显式双向设置，避免跨实例状态泄漏。
- 引擎诊断与选型决策沉淀为 `docs/ENGINE.md`：引擎维持 Chromium（Android System WebView），本版本重构集成层。

## [0.1.6] - 2026-08-31

### Fixed

- Free placement finally works like a real launcher: with 自动整理桌面 off, a dragged icon stays on the exact grid slot it was dropped on (slot 2 → slot 12/9/4/7 stays there) instead of snapping back to the compacted front positions. The home grid is now a sparse model — every cell keeps its persisted `(page, slot)`, empty slots are real placeholders, and drops resolve to the nearest registered slot bounds (including empty ones).
- Context-menu direction was inverted in some cases: the menu now anchors on the actual finger press point and opens toward the side with more room (icon at slot 1 on the left edge opens the menu to its right), computed from the four-direction free space around the press point with edge clamping.
- Custom local-icon paths (starting with `/`) were rejected when saving an app, losing the uploaded icon.

### Added

- 主页布局新增「自动整理桌面」开关（默认关闭 = 自由摆放，对齐主流 Android 桌面；开启后恢复压实排列）。设置项为兼容性契约，旧设备默认进入自由摆放。
- Free-placement drag semantics: dropping on an empty slot moves there directly; dropping on an occupied slot swaps the two cells (folders swap as a whole); new apps append to the first empty slot of the last page instead of always compacting.
- Folder dissolve / remove-from-folder in free-placement mode: the first member keeps the folder's slot, remaining members fill the following empty slots in order; a removed member is placed in the first empty slot near the folder.
- Unit tests for `buildSparse`, `resolveSlotMove`, dissolve and remove-from-folder slot allocation (`HomePagesTest`).

## [0.1.5] - 2026-08-31

### Fixed

- Drag-layer shadow truly follows the icon's large corner radius now: the shadow is cast inside `AppIcon` with the rounded shape and `clip=false`, instead of an outer `graphicsLayer { clip = true }` that clipped the rounded shadow into a square (the recurring "square shadow" on long-press/drag).
- Context-menu horizontal avoidance is now intelligent: an icon on the left half of the screen pops the menu from its right side, and vice versa (previously it only centered near the icon).
- Removed the ugly whole-cell "grid highlight" when tapping an app/folder: the default ripple is disabled and replaced by a subtle press-scale on the icon itself.
- Letter-fallback icons are readable in every theme: the tile color is picked from a high-contrast palette by title hash with near-black text, replacing the low-contrast `primaryContainer` pair.

### Added

- Drag-to-reorder now snaps to the nearest grid slot: the drop target resolves to the closest grid slot (hovered cell, nearest cell center, or page end) and the app snaps there on release instead of jumping back, like a real launcher/desktop.
- Pinch-to-edit gesture rewritten with `awaitEachGesture` two-finger distance tracking (the old `detectTransformGestures` was swallowed by the pager), so pinch-in reliably enters edit mode and pinch-out exits.
- Folder open is redesigned as a HyperOS-style full-screen expanded page: dimmed backdrop, folder name + member count, and a 3-column grid of rounded member icons, replacing the plain AlertDialog list.
- Custom app icon upload in the add flow: pick a local image (copied to the private icons dir) when a site has no logo, with the home grid rendering local file icons edge-to-edge.
- Page-transition style setting under 外观与主题: 滑入 / 淡入 / 缩放 / 无动画 presets, wired through `LocalTransitionStyle` into 我的 sections and the developer center.

## [0.1.4] - 2026-08-31

### Fixed

- Drag-layer shadow now follows the icon's large corner radius instead of rendering as an ugly square rectangle (long-press / drag no longer shows a right-angled shadow).

### Changed

- `AppContextMenu` rebuilt as an anchored floating panel (HyperOS/iOS home-screen style): a `Popup` anchored beside the long-pressed icon with smart vertical flipping, replacing the previous full-screen centered dialog with a giant title and icon grid.
- Context-menu actions are now a vertical list — circular icon badge (primary / errorContainer) + short label, with the destructive action in red at the bottom — and use a semi-transparent frosted surface (no extra live blur, per PERFORMANCE.md).
- Menu pop animation unified via `AppMotion.popupEnter/popupExit` (scale 0.92→1 + fade, anchored to the icon side).

### Added

- Edit (jiggle) mode on the home screen: pinch-in with two fingers enters edit mode (icons wiggle iOS-style, circular selection badges on their top-start corner, a translucent "完成" capsule top-end, and a bottom action row with select-all/clear); pinch-out, the done button or the back gesture exits. Tapping toggles selection instead of launching.
- Unified motion system in `AppMotion`: main-tab `Crossfade`, detail-page `enterDetail/exitDetail` (slide-in-from-right + fade) wired into 我的 sections and the developer center's third-level pages via `AnimatedContent`, and shared popup specs.
- Design Playbook motion section now demonstrates spring, detail slide-in and popup transitions; DESIGN.md §6.2–6.5 updated for the anchored menu, edit mode and unified motion.

## [0.1.3] - 2026-08-31

### Added

- iOS-style home-screen icons: icon bodies now sit directly on the wallpaper with no pedestal card; corner radius is clipped by the icon body itself (sites, letter fallbacks, folders, add cell as outlined ghost).
- `AppContextMenu` design-system component: iOS home-screen context menu with blurred scrim, spring pop-in, optional icon preview, 4-column action grid and separated destructive actions (semi-opaque solid + hairline instead of a second live blur, per `docs/PERFORMANCE.md`).
- Long-press interaction reordered to the iOS sequence: press first opens the menu; dragging past touch-slop fades the menu out and moves the icon into drag mode; releasing in place keeps the menu.
- Developer center is now a full-screen first-level page (我的 → 开发者选项): app/WebView/device info, log viewer, icon cache clear, design Playbook entry.
- In-memory ring-buffer log (`AppLog`, 500 entries, tag filter, copy/share export, auto-cleared when the process dies; no browsing content, cookies or credentials are ever logged).
- Design Playbook gains a context-menu demo section for visual acceptance.

### Changed

- Favorite border thickened to 2dp; folder preview keeps the unified corner radius.
- Home grid long-press logging hooks (`HomeViewModel`) and Me settings logging hooks (`MeViewModel`) feed the new log viewer.

## [0.1.2] - 2026-08-31

### Changed

- Light theme rebuilt on the iOS grouped-list standard: gray background `#F2F2F7` now hosts pure-white cards, replacing the previous white-background/light-gray-card layering.
- All secondary text (`onSurfaceVariant`, `secondary`, `tertiary`) deepened to `#55555B` — 7.4:1 on white cards (WCAG AAA), up from a marginal 4.74:1.
- `surfaceVariant` deepened to `#E5E5EA` so icon placeholders and browser input areas stay visible on the new gray background.
- Dark-theme card surface aligned to iOS grouped dark (`#1C1C1E`).
- Bottom glass bar: selected tab now shows a capsule indicator fill (primary at 12% alpha, color-only animation, no layout change).

### Added

- `AppCard` gains a 1dp `outlineVariant` hairline border (static edge-light, zero performance cost).

### Fixed

- Eliminated the "dirty pink" card appearance caused by near-white gray cards over a pure-white background (simultaneous-contrast effect).

## [0.1.1] - 2026-08-30

### Added

- Unified design-system layer in `core/designsystem`: full light/dark color tokens, MiSans typography scale, shape/spacing/motion tokens, and shared components (`AppCard`, `AppListRow`, `AppListDivider`, `AppSectionHeader`, `AppBadge`, `AppConfirmDialog`, `glassSurface`).
- Bundled subsetted MiSans font (regular/medium/semibold) so text metrics are identical on every device.
- Design Playbook under 我的 → 开发者选项: live preview of color tokens, typography, shapes, spacing, list rows, buttons, dialogs, glass material and motion specs.
- Component-library inventory documented in `docs/DESIGN.md`.

### Changed

- Me settings pages rebuilt on the unified components with iOS-style grouped sections (section header above edge-to-edge cards).
- Browser top bar rebuilt: self-drawn capsule address field keeps text vertically centered; tab-count button uses neutral surface tokens; tonal-elevation tint removed.
- Bottom bar glass effect now consumes the shared `glassSurface` component instead of a one-off implementation.
- Layout sliders use a single primary-color track with a white thumb (gradient track removed).

### Fixed

- Settings subtitle text no longer uses the low-contrast `outline` token (all secondary text now `onSurfaceVariant`, ≥4.5:1 on card backgrounds).
- Browser address-bar placeholder text no longer clipped in half by the fixed 46dp field height.
- Purple tint on cards and badges eliminated by defining every Material 3 color token explicitly.
- Hard-coded Google-blue fallback icon colors replaced with `primaryContainer`/`onPrimaryContainer` theme tokens.

### Removed

- Dropped unused library declarations (Lottie, reorderable) to keep one unified library per capability.

## [0.1.0] - 2026-08-30

> 版本计数从本版本起重置（旧线止于 0.2.0 / versionCode=2）。新线为 versionCode=1 起；
> 已安装旧版 0.2.0 的设备需先卸载再安装。

### Added

- Apple-style theme system: pure-white / pure-black base schemes, follow-system mode, and a photo-wallpaper mode that extracts the accent color from the user's photo (Me → 外观与主题).
- iOS Liquid Glass floating capsule bottom bar powered by the Haze library (live backdrop blur + specular edge highlight).
- Project specification documents: `docs/DESIGN.md`, `docs/VERSIONING.md`, `docs/PERFORMANCE.md`, referenced from `AGENTS.md`.

### Changed

- Version counting restarted from 0.0.0 (versionCode 1); default increment is the third digit only.

## [旧线 0.2.0] - 2026-08-29

### Added

- In-app update-log page under Me → 项目更新日志, kept in sync with this file.
- Two-level settings structure on the Me page with per-section detail pages.

### Changed

- Rebranded the app to 「玄览」 with a new tian-dao themed adaptive launcher icon.
- Compacted the bottom navigation bar height.
- Slimmed the browser top bar into a single row; aligned the address field and tab-switcher button heights; moved bookmark, find-in-page and new-tab actions into the overflow menu.
- Moved running background sessions to the top of the Me page and restyled layout sliders with a gradient track and bordered thumb.

## [旧线 0.1.0] - 2026-08-29

### Added

- Website metadata and icon discovery flow.
- Fixed-capacity launcher pages with folders and persisted ordering.
- DragLayer-based long-press dragging, reorder targets, folder hotspot and edge paging.
- Multi-tab browser with a compact-width tab switcher.
- Managed WebView sessions, site settings and foreground-service integration.
- Notification permission and battery-optimization status surfaces.
- Project, contribution, agent and signed-release operating standards.

### Fixed

- Prevented remote icons and drag scaling from changing launcher cell geometry.
- Rebound WebView listeners and current-tab callbacks after tab switches.
- Applied persisted home-grid settings and paginated large app collections deterministically.
- Connected global keep-alive settings to persistent state and service control.

[0.2.0]: https://github.com/AIMFllyYS/PocketWebShell/releases
[0.1.0]: https://github.com/AIMFllyYS/PocketWebShell/releases
[旧线 0.2.0]: https://github.com/AIMFllyYS/PocketWebShell/releases/tag/v0.2.0
[旧线 0.1.0]: https://github.com/AIMFllyYS/PocketWebShell/releases/tag/v0.1.0

