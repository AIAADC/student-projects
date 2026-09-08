package com.webshell.feature.me

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import com.webshell.core.designsystem.components.AppCard
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

private data class UpdateEntry(
    val version: String,
    val date: String,
    val highlights: List<String>,
)

/** 与 CHANGELOG.md 同步的应用内更新日志。 */
private val updateEntries = listOf(
    UpdateEntry(
        version = "0.1.16",
        date = "2026-09-07",
        highlights = listOf(
            "解散文件夹新增二次确认弹窗，确认后才解散，应用本身不会被删除",
            "长按应用 Logo 的菜单新增「复制应用链接」，一键复制网址到剪贴板",
            "设置页「后台会话」最多显示前 3 条；更多时提供「全部会话」入口，进入独立页面统一管理全部保活会话",
        ),
    ),
    UpdateEntry(
        version = "0.1.15",
        date = "2026-09-07",
        highlights = listOf(
            "清理旧控件与重复实现：统一表单、图标、选择行、弹窗和面板；添加网页不再显示旧字号滑杆，保留已有站点字号",
            "设置 → 外观与主题新增字体与字号：MiSans、系统字体、Noto Sans SC，界面字号90%至130%，不改变网页缩放",
            "浏览器精简为一行菜单、地址、标签；进入网页后导航立即收成玻璃小球，可拖至侧边，点击召回完整导航和地址栏",
            "恢复添加网址自动抓取网站图标作为应用 Logo，无图标的站点仍显示首字符",
            "修复深色模式下浏览器菜单按钮发灰看不清、浏览网页时内容区域闪烁的问题",
            "Playbook 改由应用层聚合所有模块的真实生产组件，涵盖常态、空态、错误、编辑、菜单和弹窗，演示不读写业务数据",
            "修正浏览会话原生视图绑定、安全区及旧网页壳重复会话问题；添加输入、图标导入和日志过滤补充状态保护",
        ),
    ),
    UpdateEntry(
        version = "0.1.14",
        date = "2026-09-06",
        highlights = listOf(
            "iOS 风格主屏：全屏流线壁纸、四图标玻璃 Dock、约束自适应网格、白色阴影标题、搜索/页码胶囊与九宫格文件夹预览",
            "统一玻璃浮层、情境菜单、分组设置、添加页面与浏览器工具栏；保留原有手势、排序和会话隔离",
            "性能重构：壁纸与 Dock 由应用壳独立管理，非编辑状态停用抖动动画，主题只订阅外观字段，模糊半径限制在 24dp 内",
            "修复照片取色旧色残留与超长图片采样，回收临时位图；系统安全区与浅/深色状态栏同步适配",
            "增加网格、图片采样和端侧视觉/导航回归，覆盖多页桌面、紧凑宽度、文件夹与深色模式",
        ),
    ),
    UpdateEntry(
        version = "0.1.13",
        date = "2026-09-02",
        highlights = listOf(
            "修复翻到左右边缘悬停开新屏“没反应”：拖拽会话上移到根级容器（对齐 Launcher3），翻页后不再被页面重组打断，左右两侧悬停约 1 秒均可稳定开新屏",
            "修复边缘悬停翻页状态机：翻页后再次悬停可连续跳页（旧实现第二次翻页永不触发）",
            "内部重构：主页手势层拆分为独立模块（交互状态集中管理 + 手势分层），并新增 7 条真机手势自动化回归测试",
        ),
    ),
    UpdateEntry(
        version = "0.1.12",
        date = "2026-09-02",
        highlights = listOf(
            "修复拖到末屏右边缘无法开新屏：临时屏状态不再中断翻页动画（旧实现自我取消），悬停约 1 秒稳定开出新屏",
            "首屏左边缘同样支持开新屏：悬停约 1 秒在左侧插入新首屏，落子后其余页面整体后移一页",
            "编辑模式改为即按即拖：图标位移超触摸阈值直接拖拽（对齐 iOS/HyperOS jiggle），原地松手仍是勾选，全程不弹长按菜单",
        ),
    ),
    UpdateEntry(
        version = "0.1.11",
        date = "2026-09-02",
        highlights = listOf(
            "桌面滑动模式可切换：左右翻页（默认）/ 上下滚动（所有页摊平成一条纵向列表，空槽保留，数据模型不变）",
            "上下滚动模式拖拽：手指悬停顶部/底部边缘自动滚动并重解析落点；页码指示器仅翻页模式显示",
            "拖到最后一屏右边缘约 1 秒自动开新屏：追加临时空白页可落子，松手未落子自动裁掉",
            "新增「全部应用」浮动入口：右下角半透明图标，可自由拖动（位置持久化），点按打开全部应用抽屉，长按可隐藏",
            "全部应用抽屉：按首字母/拼音首字母分区（A→Z、# 殿后），右侧字母索引条支持点按与按住滑动跳转，当前字母气泡提示",
            "空白处长按弹菜单：一键进入编辑模式、切换全部应用入口显隐；设置页同步新增对应开关",
        ),
    ),
    UpdateEntry(
        version = "0.1.10",
        date = "2026-09-01",
        highlights = listOf(
            "日志改为 Room 持久化存储：进程结束后仍可回看，数据库 v2→v3 显式迁移不影响存量数据",
            "日志分 INFO/WARN/ERROR 三级，新增崩溃捕获：未捕获异常堆栈自动落盘（crash 标签）",
            "新增监测点：页面加载与失败、SSL 错误（只记 host）、标签新建/切换/关闭、会话开关、保活服务启停、添加网站成败、应用启动版本",
            "日志查看页重构：滚动到底自动加载更多（每页 30 条），不再受 500 条内存上限约束",
            "复制/分享升级为完整导出：带版本与设备信息头部，分享生成 TXT 文件经 FileProvider 发出",
            "查看页新增红色清空按钮（二次确认），一键清空全部日志",
        ),
    ),
    UpdateEntry(
        version = "0.1.9",
        date = "2026-09-01",
        highlights = listOf(
            "修复长按菜单永远钉在左上角：Popup 里的全屏遮罩把内容尺寸撑成整个屏幕，定位钳制失效；移除内置遮罩，改用 Popup 自带的外部点击关闭",
            "菜单现在稳定地以按压点为中心、在图标附近弹出",
        ),
    ),
    UpdateEntry(
        version = "0.1.8",
        date = "2026-09-01",
        highlights = listOf(
            "修复长按图标误触打开应用：手势重构为单通道状态机，长按与点击互斥，长按原地松手只弹菜单",
            "长按弹菜单后移动超过 16dp 才进入拖拽（对齐 Launcher3 两段式阈值），小位移松手菜单保留",
            "修复远端 logo 加载失败只剩白底无字：失败时回退首字母色块，首字母配色适配深色主题",
            "官方 logo 贴边裁剪：等比放大铺满圆角图标，不再内缩留白边",
            "长按菜单新增「重命名」「更改图标」「强制刷新」（支持上传本地图片作图标）",
            "情境菜单定位重写：以按压点居中展开、垂直优先向上，边缘自动钳制，动画锚点指向按压点",
        ),
    ),
    UpdateEntry(
        version = "0.1.7",
        date = "2026-09-01",
        highlights = listOf(
            "修复标签页串台：进度/标题/返回状态改为按标签独立记录，多标签互切不再互相污染",
            "修复后台标签回调丢失：新增随会话存活的持久监听器，后台加载的标题/历史不再丢",
            "会话池改真 LRU 且激活标签受保护：不再误杀正在显示的标签，淘汰后返回栈可恢复",
            "浏览器标签统一共享登录 Profile：cookie/登录态全标签互通（网页应用壳仍独立隔离）",
            "移动版 UA 换成标准 Chrome Android：修复 Google 登录等站点拒绝服务的问题",
            "切走的后台标签暂停音视频播放；关闭标签彻底清理会话与桌面模式记忆",
            "修复新窗口会话泄漏：不再遗留无人销毁的孤儿会话",
        ),
    ),
    UpdateEntry(
        version = "0.1.6",
        date = "2026-08-31",
        highlights = listOf(
            "自由摆放真正生效：关闭「自动整理桌面」后，图标拖到哪个网格位就停在哪个网格位，不再自动蹦回前排（对齐主流 Android 桌面）",
            "主页布局新增「自动整理桌面」开关，默认关闭 = 自由摆放；开启后恢复压实排列",
            "拖到空槽直接落子，拖到已占用槽位则双方交换（文件夹整体交换）；新应用追加到末页首个空槽",
            "解散/移出文件夹智能填槽：首个成员占原槽位，其余顺序填充后续空槽",
            "情境菜单方向修复：以手指按压点计算四向空间，往空间更大的一侧弹出（1 号位图标菜单从右侧弹出），边缘自动钳制",
            "修复上传的本地图标路径保存失败的问题",
        ),
    ),
    UpdateEntry(
        version = "0.1.5",
        date = "2026-08-31",
        highlights = listOf(
            "彻底修复长按/拖拽方形阴影：阴影改为图标内部按圆角投影",
            "情境菜单智能避让：图标在左半屏从右侧弹出，右半屏从左侧弹出",
            "去掉点击应用/文件夹时的整格高亮，改为图标轻缩反馈",
            "首字母图标高对比配色，任何主题下清晰可读",
            "拖拽重排支持网格吸附：松手自动对齐最近网格位，不再自动归位",
            "双指捏合进入编辑模式修复（重写手势识别）",
            "文件夹打开重设计：全屏展开页 + 3 列大图标网格",
            "添加网站支持上传本地图片作为图标",
            "外观与主题新增页面切换动效选择（滑入/淡入/缩放/无）",
        ),
    ),
    UpdateEntry(
        version = "0.1.4",
        date = "2026-08-31",
        highlights = listOf(
            "修复长按/拖拽时的方形阴影：阴影改为跟随图标大圆角形状",
            "情境菜单重做：改为贴近图标的锚点浮窗（对齐 HyperOS/iOS），纵向列表 + 圆形图标底",
            "菜单材质改半透明磨砂，弹出动画统一（从图标一侧缩放浮现）",
            "新增编辑模式：双指捏合进入，图标抖动 + 左上角勾选，双指外扩/完成/返回退出",
            "编辑模式含右上「完成」胶囊与底部操作行（全选/清空/计数）",
            "统一动效：主 Tab 淡切、二/三级页面统一右侧滑入 + 淡入",
            "设计 Playbook 新增动效演示（spring / 二级页滑入 / 菜单弹出）",
        ),
    ),
    UpdateEntry(
        version = "0.1.3",
        date = "2026-08-31",
        highlights = listOf(
            "主页图标 iOS 化：移除底座卡片，图标直接落在壁纸上，圆角由图标本体裁剪",
            "长按图标改为 iOS 顺序：先弹情境菜单，拖动超过阈值后菜单淡出、图标跟手进入拖拽",
            "新增统一情境菜单组件：网格动作、图标预览、破坏性操作分组（不新增实时模糊，保性能）",
            "收藏边框加粗至 2dp；新建入口改为描边幽灵样式",
            "「开发者选项」升级为一级全屏页面：应用/WebView/设备信息、日志查看、缓存清理",
            "新增内存环形日志（500 条，支持标签过滤与复制导出，不记录浏览内容等敏感信息）",
            "设计 Playbook 新增情境菜单演示区",
        ),
    ),
    UpdateEntry(
        version = "0.1.2",
        date = "2026-08-31",
        highlights = listOf(
            "浅色模式改为 iOS 分组规范：灰底（#F2F2F7）托纯白卡片，层级分明",
            "次要文字加深至 AAA 级对比度（#55555B，白卡上 7.4:1），备注不再看不清",
            "中性灰统一冷调，消除卡片「粉肉色」观感",
            "卡片新增 1dp 发丝描边（静态拟态边缘光）",
            "底部玻璃栏选中态新增胶囊指示底（弹簧动画，不改布局）",
            "深色模式卡片底色对齐 iOS 深色分组（#1C1C1E）",
        ),
    ),
    UpdateEntry(
        version = "0.1.1",
        date = "2026-08-30",
        highlights = listOf(
            "统一设计系统：全套浅/深色 token、MiSans 字阶、圆角/间距/动效规范",
            "内置 MiSans 字体（子集化），全设备字度量一致，杜绝文字截半",
            "新增统一组件：AppCard / AppListRow / AppSectionHeader / AppBadge / AppConfirmDialog / glassSurface",
            "「我的」新增「开发者选项」：设计 Playbook 实时预览全部组件与动效",
            "浏览器顶栏重做：胶囊地址栏文字垂直居中，修复占位文字截半",
            "修复设置页副标题低对比度（outline → onSurfaceVariant）与卡片紫色偏差",
            "滑杆改单色轨道 + 白色滑块；底部玻璃栏收编为统一组件",
            "清理未使用的组件库声明（Lottie、reorderable）",
        ),
    ),
    UpdateEntry(
        version = "0.1.0",
        date = "2026-08-30",
        highlights = listOf(
            "版本计数重置：新线从 0.1.0 起（versionCode=1）",
            "全新主题系统：纯白 / 纯黑 / 跟随系统三种苹果式配色",
            "照片壁纸主题：上传照片作主页壁纸，自动从照片提取主题色",
            "底部导航重做：iOS 液态玻璃风格悬浮胶囊（Haze 实时模糊 + 高光描边）",
            "「我的」新增「外观与主题」设置页",
            "新增设计 / 版本号 / 性能三份项目规范文档",
            "注意：旧版 0.2.0 设备需先卸载再安装本版本",
        ),
    ),
    UpdateEntry(
        version = "旧线 0.2.0",
        date = "2026-08-29",
        highlights = listOf(
            "品牌焕新：应用更名「玄览」，启用天道主题新图标",
            "底部导航栏压缩上下间距，整体更紧凑",
            "浏览器顶栏瘦身：地址栏与标签按钮高度对齐",
            "浏览器收藏、页内查找等入口统一收纳至右上角菜单",
            "「我的」改版为一/二级菜单结构，按板块进入设置",
            "「运行中的后台会话」移至页面顶部，滑杆样式美化",
            "新增「项目更新日志」页面",
        ),
    ),
    UpdateEntry(
        version = "旧线 0.1.0",
        date = "2026-08-29",
        highlights = listOf(
            "网站元数据与图标发现流程",
            "固定容量桌面分页、文件夹与持久化排序",
            "DragLayer 长按拖拽、排序落点与文件夹热点",
            "多标签浏览器与紧凑宽度标签切换",
            "托管 WebView 会话、站点设置与前台服务保活",
            "通知权限与电池优化状态面板",
        ),
    ),
)

/** 二级页：项目更新日志。 */
@Composable
internal fun UpdateLogPage(onBack: () -> Unit) {
    DetailPage(title = "项目更新日志", onBack = onBack) {
        updateEntries.forEachIndexed { index, entry ->
            if (index > 0) Spacer(Modifier.height(12.dp))
            AppCard(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            entry.version,
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(Modifier.weight(1f))
                        Text(
                            entry.date,
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    entry.highlights.forEach { item ->
                        Row(Modifier.padding(vertical = 3.dp)) {
                            Text(
                                "•",
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(end = 8.dp),
                            )
                            Text(item, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}
