package com.webshell.feature.home

import android.graphics.Rect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.Composable
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp

/**
 * 主页交互会话状态（对齐 Launcher3 DragController 的集中式状态管理）：
 * 拖拽会话、长按菜单、编辑模式、布局注册表全部集中在单一 @Stable 持有者中。
 *
 * 手势 lambda / pointerInput 协程只捕获这个稳定对象，属性读写都落到同一份
 * 快照状态上，从根上消灭“组合期快照过期”（stale closure）这类缺陷——
 * 历史上两个 P0 缺陷都源于状态散落在数十个 remember 中被手势闭包按值捕获：
 * 1. 翻页后源 cell 随旧页被 Pager 移出组合，挂在 cell 上的拖拽协程被取消；
 * 2. 边缘悬停 LaunchedEffect 依赖 key 重启，同帧重算的方向对组合期不可见。
 */
@Stable
class HomeInteractionState {

    // ---------- 拖拽会话 ----------

    /** 正在拖拽的 cell key；非 null 即拖拽会话进行中（pager/列表滚动随之禁用）。 */
    var draggingKey by mutableStateOf<String?>(null)

    /** 手指在根布局坐标系中的位置（拖拽跟手锚点）。 */
    var dragPosition by mutableStateOf(Offset.Zero)

    /** 按下点在图标内的注册偏移：拖拽时图标中心不在手指下跳变。 */
    var dragRegistration by mutableStateOf(Offset.Zero)

    /** 悬停命中的其它 cell key（重排/合并目标高亮）。 */
    var dragHoverTarget by mutableStateOf<String?>(null)

    /** 拖拽吸附的最近网格槽（页内 cellIndex；含空槽）。 */
    var dragTargetCellIndex by mutableStateOf(-1)

    /** 拖拽吸附的最近网格槽所在页（翻页模式为 pager 页号，上下滚动模式为数据页号）。 */
    var dragTargetPage by mutableIntStateOf(-1)

    /** 文件夹合并候选目标（悬停热点内）。 */
    var folderCandidate by mutableStateOf<String?>(null)

    /** 悬停计时到点、合并已武装（松手即合并）。 */
    var folderArmed by mutableStateOf(false)

    /** 左右翻页模式的边缘悬停方向：-1 左缘 / +1 右缘 / 0 不在边缘。 */
    var edgeDirection by mutableIntStateOf(0)

    /** 上下滚动模式的边缘悬停方向：-1 顶部 / +1 底部 / 0 不在边缘。 */
    var verticalEdgeDirection by mutableIntStateOf(0)

    /**
     * 拖拽中悬停末屏右缘/首屏左缘约 900ms 时插入的临时空白屏
     * （对齐 Launcher3 extra empty screen，扩展到左侧；未落子则松手即裁掉）。
     * 0 = 无临时屏；1 = 右侧追加；-1 = 左侧插入（pager 页 0 为临时屏，数据页整体 +1 偏移）。
     */
    var tempPageSide by mutableIntStateOf(0)

    // ---------- 编辑（jiggle）模式 ----------

    var editMode by mutableStateOf(false)
    val editSelection = mutableStateMapOf<String, Boolean>()

    // ---------- 长按菜单 ----------

    /** 图标长按情境菜单的目标 cell。 */
    var menuFor by mutableStateOf<HomeCell?>(null)

    /** 图标长按按压点（根布局坐标）：情境菜单以此为定位准心。 */
    var menuPressPoint by mutableStateOf<Offset?>(null)

    /** 空白处长按菜单的按压点（根布局坐标）。 */
    var blankMenuPoint by mutableStateOf<Offset?>(null)

    /** 「全部应用」浮动入口的屏幕区域（空白长按需排除入口自身）。 */
    var allAppsEntryRect by mutableStateOf<Rect?>(null)

    // ---------- 布局注册表（onGloballyPositioned 写入，dispose 移除） ----------

    /** 已占用 cell 的根布局坐标区域：cell.key → Rect。 */
    val cellBounds = mutableStateMapOf<String, Rect>()

    /** 全部网格槽（含空槽）的根布局坐标区域："page:slot" → Rect，松手吸附用。 */
    val slotBounds = mutableStateMapOf<String, Rect>()

    /** 根容器在根布局坐标系中的原点（屏幕坐标 → 容器坐标的换算基准）。 */
    var rootOrigin by mutableStateOf(Offset.Zero)

    /** pager 页号 → 数据页号的左偏移：左侧临时屏存在时数据页 = pager 页 - 1。 */
    val tempLeftOffset: Int get() = if (tempPageSide == -1) 1 else 0

    // Pointer moves are high-frequency. Cache membership by the immutable page-list identity,
    // not by a drag coordinate; avoid rebuilding sets and scanning every app for every MOVE.
    private var indexedPages: List<List<HomeCell?>>? = null
    private var keysByPage: List<Set<String>> = emptyList()
    private var cellsByKey: Map<String, HomeCell> = emptyMap()

    /**
     * 落点/悬停解析：拖拽中每个 MOVE 事件调用。依次更新重排目标、最近网格槽
     * 吸附（空槽也是合法落点，与真实安卓桌面一致）、文件夹合并热点、边缘
     * 翻页/滚动方向。坐标一律使用根布局坐标系。
     *
     * [currentPage] 必须由调用方在调用瞬间现读 pagerState.currentPage ——
     * 本函数被手势协程捕获，组合期快照在拖拽中会过期。
     */
    fun updateDropTargets(
        position: Offset,
        pages: List<List<HomeCell?>>,
        currentPage: Int,
        verticalMode: Boolean,
        containerWidthPx: Float,
        containerHeightPx: Float,
        iconSize: Dp,
        density: Density,
        haptics: HapticFeedback,
    ) {
        // An edge-page animation's finally block can report its last pointer after the root
        // drag session has already reset. Never let that delayed callback re-arm idle state.
        if (draggingKey == null) return
        if (indexedPages !== pages) {
            indexedPages = pages
            keysByPage = pages.map { page -> page.mapNotNull { it?.key }.toSet() }
            cellsByKey = pages.asSequence().flatten().filterNotNull().associateBy { it.key }
        }
        // 上下滚动模式：所有已组合的 cell 都是合法目标（列表内全部页摊平展示）；
        // 翻页模式：只命中当前页的 cell。
        val currentKeys = if (verticalMode) {
            null
        } else {
            // pager 页号减左偏移才是数据页号；临时屏（映射后越界）无命中目标。
            keysByPage.getOrNull(currentPage - tempLeftOffset).orEmpty()
        }
        val target = cellBounds.entries.firstOrNull { (key, rect) ->
            key != draggingKey && (currentKeys == null || key in currentKeys) &&
                rect.contains(position.x.toInt(), position.y.toInt())
        }
        val targetKey = target?.key
        if (targetKey != dragHoverTarget) {
            dragHoverTarget = targetKey
            if (targetKey != null) {
                haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
            }
        }
        // 网格吸附：在全部网格槽（含空槽）中取几何中心距手指最近的槽。
        // 翻页模式只看当前页的槽；上下滚动模式看全部可见槽（页号随 slotKey 解析）。
        val pagePrefix = "$currentPage:"
        var nearestSlotKey: String? = null
        var nearestDistance = Float.POSITIVE_INFINITY
        slotBounds.forEach { (key, rect) ->
            if (verticalMode || key.startsWith(pagePrefix)) {
                val dx = rect.exactCenterX() - position.x
                val dy = rect.exactCenterY() - position.y
                val distance = dx * dx + dy * dy
                if (distance < nearestDistance) {
                    nearestDistance = distance
                    nearestSlotKey = key
                }
            }
        }
        if (verticalMode) {
            dragTargetPage = nearestSlotKey?.substringBefore(':')?.toIntOrNull() ?: -1
            dragTargetCellIndex = nearestSlotKey?.substringAfter(':')?.toIntOrNull() ?: -1
        } else {
            dragTargetCellIndex = nearestSlotKey?.substringAfter(':')?.toIntOrNull() ?: -1
            dragTargetPage = if (dragTargetCellIndex >= 0) currentPage else -1
        }
        // 文件夹合并热点：悬停目标图标中心附近（不依赖重组推导的 draggedCell ——
        // 首个 MOVE 事件可能先于重组到达，单点移入即静置也必须能武装合并）。
        val inFolderHotspot = target?.value?.let { rect ->
            val centerX = rect.exactCenterX()
            val centerY = rect.top + with(density) { iconSize.toPx() } / 2f
            val radius = with(density) { iconSize.toPx() } * 0.55f
            val dx = position.x - centerX
            val dy = position.y - centerY
            dx * dx + dy * dy <= radius * radius
        } == true
        val sourceCanMerge = cellsByKey[draggingKey]?.isFolder == false
        folderCandidate = targetKey.takeIf { inFolderHotspot && sourceCanMerge }

        if (verticalMode) {
            // 上下滚动：手指停在顶部/底部边缘区域时自动滚动列表。
            val localY = position.y - rootOrigin.y
            val edgeZone = containerHeightPx.coerceAtLeast(1f) * 0.10f
            verticalEdgeDirection = when {
                localY < edgeZone -> -1
                localY > containerHeightPx - edgeZone -> 1
                else -> 0
            }
        } else {
            val localX = position.x - rootOrigin.x
            val edgeZone = containerWidthPx.coerceAtLeast(1f) * 0.10f
            val lastPagerPage = pages.lastIndex + if (tempPageSide != 0) 1 else 0
            val dataPage = currentPage - tempLeftOffset
            edgeDirection = when {
                // 已有页之间正常左翻；停在首屏左边缘且无临时屏时允许“左侧开新屏”
                localX < edgeZone && (dataPage > 0 || tempPageSide == 0) -> -1
                // 已有页之间正常右翻；停在末屏右边缘且无临时屏时允许“右侧开新屏”
                localX > containerWidthPx - edgeZone &&
                    (currentPage < lastPagerPage || tempPageSide == 0) -> 1
                else -> 0
            }
        }
    }

    /** 拖拽会话结束（落子/取消）时清空全部会话状态；临时屏未落子随状态清除被裁掉。 */
    fun resetDrag() {
        draggingKey = null
        dragPosition = Offset.Zero
        dragRegistration = Offset.Zero
        menuPressPoint = null
        dragHoverTarget = null
        dragTargetCellIndex = -1
        dragTargetPage = -1
        folderCandidate = null
        folderArmed = false
        edgeDirection = 0
        verticalEdgeDirection = 0
        tempPageSide = 0
    }

    fun exitEditMode() {
        editMode = false
        editSelection.clear()
    }
}

@Composable
fun rememberHomeInteractionState(): HomeInteractionState = remember { HomeInteractionState() }
