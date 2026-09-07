package com.webshell.feature.home

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.pager.PagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull

internal const val FOLDER_HOVER_MILLIS = 500L
internal const val EDGE_HOVER_MILLIS = 450L

// 拖到最后一屏右边缘/首屏左边缘开新屏的悬停时长：比边缘翻页稍长，避免误开空白页
internal const val NEW_PAGE_HOVER_MILLIS = 900L
internal const val PINCH_IN_THRESHOLD = 0.86f
internal const val PINCH_OUT_THRESHOLD = 1.16f

// 长按弹菜单后转为拖拽的累计位移阈值：Launcher3
// deep_shortcuts_start_drag_threshold = 16dp（大于 touchSlop 8dp 的两段式阈值，
// ≤16dp 松手菜单保持打开，>16dp 才进入拖拽）。
internal val DRAG_START_THRESHOLD = 16.dp

/**
 * 落子动作集合：由 HomeScreen 用 ViewModel 方法装配（pageCapacity 等参数在
 * 装配处绑定），手势层不直接依赖 ViewModel。
 */
@Stable
class HomeDropActions(
    val createFolder: (from: String, target: String) -> Unit,
    val prependPageMove: (draggedKey: String, toSlot: Int) -> Unit,
    val moveCellToSlot: (draggedKey: String, toPage: Int, toSlot: Int) -> Unit,
    val moveApp: (appId: String, toPage: Int, toCellIndex: Int) -> Unit,
    val moveCell: (from: String, target: String) -> Unit,
)

/**
 * 单个网格图标的单通道手势状态机（对齐 Launcher3）：一个 pointerInput 内按
 * tap / 位移取消 / 长按 三分支编排，长按与点击天然互斥 —— 长按触发后原地
 * 松手绝不触发打开应用。
 *
 * 本状态机只负责"检测"：拖拽条件满足时置位 [HomeInteractionState.draggingKey]
 * 并把该手势交接给根级拖拽会话（[homeDragSession]）。会话不能挂在 cell 上：
 * 翻页/开新屏后源 cell 随旧页被 Pager 移出组合，协程会被一并取消（状态清零、
 * 临时屏回弹，表现为"翻页/开新屏没反应"）。
 */
@Composable
fun Modifier.homeCellGesture(
    state: HomeInteractionState,
    cell: HomeCell,
    iconSize: Dp,
    interactionSource: MutableInteractionSource,
    haptics: HapticFeedback,
    onLaunch: (appId: String, url: String) -> Unit,
    onFolderOpen: (String?) -> Unit,
    onDragMoved: (Offset) -> Unit,
): Modifier {
    // pointerInput 协程从启动时的组合捕获回调：用 rememberUpdatedState 保证
    // 始终调用最新闭包（pages/尺寸等随重组刷新）。
    val currentOnLaunch by rememberUpdatedState(onLaunch)
    val currentOnFolderOpen by rememberUpdatedState(onFolderOpen)
    val currentOnDragMoved by rememberUpdatedState(onDragMoved)
    return pointerInput(cell.key, iconSize) {
        val dragThresholdPx = DRAG_START_THRESHOLD.toPx()
        awaitEachGesture {
            val down = awaitFirstDown()
            // pressed 视觉：图标自身轻微回缩（沿用 interactionSource）。
            val press = PressInteraction.Press(down.position)
            interactionSource.tryEmit(press)
            var pressEnded = false
            fun endPress(cancel: Boolean = false) {
                if (pressEnded) return
                pressEnded = true
                interactionSource.tryEmit(
                    if (cancel) PressInteraction.Cancel(press)
                    else PressInteraction.Release(press),
                )
            }

            // 编辑（jiggle）模式跳过长按判定：对齐 iOS/HyperOS ——
            // 位移超 touchSlop 立即进入拖拽，全程绝不弹长按菜单。
            if (!state.editMode) {
                // 长按超时窗口内跟踪同一 pointer：
                // 提前松手 = tap；累计位移超 touchSlop = 取消（交还 pager 滚动）；
                // 超时 = 长按。事件被其它手势（pager 等）消费同样视为取消。
                var isTap = false
                var isCancelled = false
                withTimeoutOrNull(viewConfiguration.longPressTimeoutMillis) {
                    var longPressAccumulated = Offset.Zero
                    while (true) {
                        val change = awaitPointerEvent()
                            .changes.firstOrNull { it.id == down.id }
                        if (change == null || change.isConsumed) {
                            isCancelled = true
                            return@withTimeoutOrNull
                        }
                        if (change.changedToUp()) {
                            isTap = true
                            return@withTimeoutOrNull
                        }
                        longPressAccumulated += change.positionChange()
                        if (longPressAccumulated.getDistance() > viewConfiguration.touchSlop) {
                            isCancelled = true
                            return@withTimeoutOrNull
                        }
                    }
                }
                when {
                    isTap -> {
                        endPress()
                        // 其它图标的拖拽进行中时不响应点按（原 clickable enabled 语义）。
                        if (state.draggingKey != null) return@awaitEachGesture
                        if (cell.isFolder) {
                            currentOnFolderOpen(cell.app.folderId)
                        } else {
                            currentOnLaunch(cell.app.id, cell.app.url)
                        }
                        return@awaitEachGesture
                    }
                    isCancelled -> {
                        endPress(cancel = true)
                        return@awaitEachGesture
                    }
                    else -> {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        state.menuFor = cell
                        // 记录按压点（根布局坐标）：菜单以此为定位准心。
                        state.menuPressPoint = state.cellBounds[cell.key]?.let { rect ->
                            Offset(rect.left + down.position.x, rect.top + down.position.y)
                        }
                    }
                }
            }

            // 等拖拽开始：普通模式在长按菜单打开后累计位移超 16dp
            // （DRAG_START_THRESHOLD；≤16dp 松手菜单保持打开）；编辑模式即按即拖
            // （阈值 touchSlop）。全程消费位移事件，阻止 pager/列表滚动；
            // 超阈值即置位拖拽状态并交接（后续事件由根级会话循环接管）。
            val thresholdPx = if (state.editMode) viewConfiguration.touchSlop else dragThresholdPx
            var accumulated = Offset.Zero
            try {
                while (true) {
                    val change = awaitPointerEvent()
                        .changes.firstOrNull { it.id == down.id }
                        ?: break
                    if (change.changedToUp()) {
                        // 编辑模式：未进入拖拽的正常松手 = 点按切换勾选。
                        if (state.editMode) {
                            state.editSelection[cell.key] =
                                !(state.editSelection[cell.key] ?: false)
                            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        }
                        break
                    }
                    // 先取位移再消费（consume 后 positionChange 归零），
                    // 消费用于阻止 pager/列表滚动。
                    val delta = change.positionChange()
                    change.consume()
                    accumulated += delta
                    if (accumulated.getDistance() > thresholdPx) {
                        val rect = state.cellBounds[cell.key] ?: break
                        state.menuFor = null
                        state.draggingKey = cell.key
                        // 拖拽注册点计算沿用 Launcher3 onDragStart 语义：
                        // 锚定在按下点，图标中心不在手指下跳变。
                        val iconPx = iconSize.toPx()
                        val iconLeft = (rect.width() - iconPx) / 2f
                        val local = down.position
                        state.dragPosition =
                            Offset(rect.left + local.x, rect.top + local.y) + delta
                        state.dragRegistration = Offset(
                            x = (local.x - iconLeft).coerceIn(0f, iconPx),
                            y = local.y.coerceIn(0f, iconPx),
                        )
                        currentOnDragMoved(state.dragPosition)
                        break
                    }
                }
            } finally {
                endPress()
            }
        }
    }
}

/**
 * 空白处长按菜单：Initial pass 通道（父级先于子级收到事件，不会被图标/pager
 * 的 Main pass 手势吃掉）。只响应真正的空白区——按压点落在已占用 cell 或
 * 「全部应用」入口的 Rect 内时直接交还子级处理。
 */
@Composable
fun Modifier.homeBlankAreaMenu(
    state: HomeInteractionState,
    haptics: HapticFeedback,
): Modifier = pointerInput(PointerEventPass.Initial) {
    awaitEachGesture {
        val down = awaitFirstDown(
            requireUnconsumed = false,
            pass = PointerEventPass.Initial,
        )
        val pressRoot = state.rootOrigin + down.position
        val onOccupiedCell = state.cellBounds.values.any {
            it.contains(pressRoot.x.toInt(), pressRoot.y.toInt())
        }
        val onAllAppsEntry = state.allAppsEntryRect?.contains(
            pressRoot.x.toInt(),
            pressRoot.y.toInt(),
        ) == true
        if (onOccupiedCell || onAllAppsEntry) return@awaitEachGesture
        // 长按超时窗口内不消费任何事件（pager 滚动/图标点按照常）；
        // 超时确认后才消费后续位移，防止长按菜单弹出时 pager 跟着滚动。
        val longPressTriggered = withTimeoutOrNull(
            viewConfiguration.longPressTimeoutMillis,
        ) {
            var accumulated = Offset.Zero
            while (true) {
                val change = awaitPointerEvent(PointerEventPass.Initial)
                    .changes.firstOrNull { it.id == down.id }
                if (change == null || !change.pressed) return@withTimeoutOrNull
                accumulated += change.positionChange()
                if (accumulated.getDistance() > viewConfiguration.touchSlop) {
                    return@withTimeoutOrNull
                }
            }
        } == null
        if (longPressTriggered && state.draggingKey == null && !state.editMode) {
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            state.blankMenuPoint = pressRoot
            while (true) {
                val change = awaitPointerEvent(PointerEventPass.Initial)
                    .changes.firstOrNull { it.id == down.id }
                if (change == null || !change.pressed) break
                change.consume()
            }
        }
    }
}

/**
 * 双指捏合（内划）进入编辑模式；外扩退出。仅在非拖拽时响应，
 * 与单指长按拖拽手势互不干扰（不同 pointerInput 通道）。
 */
@Composable
fun Modifier.homePinchEditMode(
    state: HomeInteractionState,
    haptics: HapticFeedback,
): Modifier = pointerInput(Unit) {
    // 手动跟踪双指间距变化：比 detectTransformGestures 更可靠，
    // 且不被 HorizontalPager 的单指拖动手势抢占。
    awaitEachGesture {
        var startDistance = 0f
        var triggered = false
        while (true) {
            val event = awaitPointerEvent()
            val pressed = event.changes.filter { it.pressed }
            if (pressed.size < 2) {
                // 双指抬起，复位等待下一次捏合
                startDistance = 0f
                triggered = false
                break
            }
            if (state.draggingKey != null) break
            val d = (pressed[0].position - pressed[1].position).getDistance()
            if (startDistance == 0f) {
                startDistance = d
                continue
            }
            val ratio = d / startDistance
            if (!triggered && ratio < PINCH_IN_THRESHOLD && !state.editMode) {
                triggered = true
                state.editMode = true
                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            } else if (!triggered && ratio > PINCH_OUT_THRESHOLD && state.editMode) {
                triggered = true
                state.exitEditMode()
            }
            if (triggered) {
                pressed.forEach { it.consume() }
            }
        }
    }
}

/**
 * 拖拽会话主循环（根级，对齐 Launcher3 DragController）：包住 pager/列表的
 * 容器用它承载会话。cell 的手势状态机在拖拽条件满足时置位 draggingKey 并把
 * 该手势交接给这里；这里负责位移跟踪、松手落子与会话清理。
 */
@Composable
fun Modifier.homeDragSession(
    state: HomeInteractionState,
    pages: List<List<HomeCell?>>,
    verticalMode: Boolean,
    autoArrangeHome: Boolean,
    dropActions: HomeDropActions,
    onDragMoved: (Offset) -> Unit,
): Modifier {
    val currentPages by rememberUpdatedState(pages)
    val currentVerticalMode by rememberUpdatedState(verticalMode)
    val currentAutoArrange by rememberUpdatedState(autoArrangeHome)
    val currentDropActions by rememberUpdatedState(dropActions)
    val currentOnDragMoved by rememberUpdatedState(onDragMoved)
    return pointerInput(Unit) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false)
            // 等 cell 开启拖拽会话（cell 先于父级处理 Main pass 事件，
            // 同步置位后这里同一事件即可读到）；未开启会话的手势
            // （点按/滑动翻页）与这里无关。
            while (state.draggingKey == null) {
                val change = awaitPointerEvent()
                    .changes.firstOrNull { it.id == down.id }
                if (change == null || !change.pressed) return@awaitEachGesture
            }
            var released = false
            try {
                while (true) {
                    val change = awaitPointerEvent()
                        .changes.firstOrNull { it.id == down.id } ?: break
                    if (change.changedToUp()) {
                        released = true
                        break
                    }
                    // 取消（非抬起）只清态不落子。
                    if (!change.pressed) break
                    // 先取位移再消费（consume 后 positionChange 归零），
                    // 消费用于阻止 pager/列表滚动。
                    val delta = change.positionChange()
                    change.consume()
                    if (delta != Offset.Zero) {
                        state.dragPosition += delta
                        currentOnDragMoved(state.dragPosition)
                    }
                }
                if (released) {
                    // 松手落子。pager 页号减左偏移换算数据页号（偏移必须
                    // 从 tempPageSide 现算：组合期快照在拖拽中会过期）；
                    // 数据页号 < 0 = 落在左侧临时屏 → 新开首屏。
                    val from = state.draggingKey
                    val target = state.dragHoverTarget
                    val slotIndex = state.dragTargetCellIndex
                    val pagerPage = state.dragTargetPage
                    val dataPage = if (currentVerticalMode || pagerPage < 0) {
                        pagerPage
                    } else {
                        pagerPage - state.tempLeftOffset
                    }
                    when {
                        from != null && target != null && state.folderArmed ->
                            currentDropActions.createFolder(from, target)
                        // 左侧临时屏落子：自由摆放下新开首屏，其余页后移。
                        from != null && slotIndex >= 0 && pagerPage >= 0 &&
                            dataPage < 0 && !currentAutoArrange ->
                            currentDropActions.prependPageMove(from, slotIndex)
                        // 自由摆放：落在最近网格槽（空槽直落，占用则交换）。
                        from != null && slotIndex >= 0 && dataPage >= 0 &&
                            !currentAutoArrange ->
                            currentDropActions.moveCellToSlot(from, dataPage, slotIndex)
                        // 自动整理：保持压实重排语义。
                        from != null && slotIndex >= 0 && dataPage >= 0 -> {
                            val dragged = currentPages.flatten().firstOrNull { it?.key == from }
                            if (dragged != null && !dragged.isFolder) {
                                currentDropActions.moveApp(dragged.app.id, dataPage, slotIndex)
                            } else if (target != null) {
                                currentDropActions.moveCell(from, target)
                            }
                        }
                    }
                }
            } finally {
                // drop/cancel 都清空全部拖拽状态（含协程被取消的路径）。
                state.resetDrag()
            }
        }
    }
}

/**
 * 拖拽中的悬停效果集合（组合期挂载一次）：
 * 1. 文件夹合并悬停计时；
 * 2. 左右翻页模式的边缘悬停翻页/开新屏状态机；
 * 3. 上下滚动模式的边缘悬停自动滚动。
 *
 * 边缘翻页状态机（对齐 Launcher3 的 PageSwitchListener）：单个 Effect 观察
 * edgeDirection，进入边缘 → 计时 → 翻页/开新屏，翻完仍在边缘则继续下一跳；
 * 松手（draggingKey 置 null）时整个 Effect 随 key 取消。
 * 三条血泪纪律（勿回退为 LaunchedEffect(draggingKey, edgeDirection) 重启式）：
 * 1. tempPageSide/pagerState.currentPage 作 key 会取消进行中的翻页动画；
 * 2. 同帧写 tempPageSide 后立即 animateScrollToPage 会被旧 pageCount 钳制
 *    回 0（pageCount 随重组才生效），必须先等帧再滚动；
 * 3. 翻页后 finally 同步重算 edgeDirection（1→0→1）对组合期 key 不可见，
 *    依赖 Effect 重启的连续跳页/二次翻页永远不会发生 —— 故改为内部循环。
 */
@Composable
fun HomeDragEffects(
    state: HomeInteractionState,
    pagerState: PagerState,
    lazyGridState: LazyGridState,
    pages: List<List<HomeCell?>>,
    verticalMode: Boolean,
    haptics: HapticFeedback,
    onDragMoved: (Offset) -> Unit,
) {
    val currentPages by rememberUpdatedState(pages)
    val currentOnDragMoved by rememberUpdatedState(onDragMoved)

    // 文件夹合并：悬停热点内静置 500ms 后武装（松手即合并）。
    LaunchedEffect(state.draggingKey, state.folderCandidate) {
        state.folderArmed = false
        val candidate = state.folderCandidate ?: return@LaunchedEffect
        if (state.draggingKey == null || candidate == state.draggingKey) return@LaunchedEffect
        delay(FOLDER_HOVER_MILLIS)
        if (state.folderCandidate == candidate && state.draggingKey != null) {
            state.folderArmed = true
            haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }
    }

    // 左右翻页模式：边缘悬停翻页/开新屏状态机。
    LaunchedEffect(state.draggingKey, verticalMode) {
        if (verticalMode || state.draggingKey == null) return@LaunchedEffect
        while (true) {
            // 等下一次进入边缘区域；松手后协程随 LaunchedEffect key 取消。
            val direction = snapshotFlow { state.edgeDirection }.first { it != 0 }
            val lastPagerPage = currentPages.lastIndex + if (state.tempPageSide != 0) 1 else 0
            val dataPage = pagerState.currentPage - state.tempLeftOffset
            val targetPage = pagerState.currentPage + direction
            val wantNewRight = direction == 1 && targetPage > lastPagerPage && state.tempPageSide == 0
            val wantNewLeft = direction == -1 && dataPage == 0 && state.tempPageSide == 0
            if (wantNewRight || wantNewLeft) {
                // 悬停末屏右缘/首屏左缘约 900ms 插入临时空白屏并翻过去；
                // 松手未落子则临时屏被裁掉。一次拖拽最多开一个（Launcher3 同）。
                delay(NEW_PAGE_HOVER_MILLIS)
                if (state.edgeDirection != direction) continue
                // 翻页动画可能被取消打断：清态与落点重解析放 finally，
                // 保证任何路径都执行（否则松手落子用上页槽位）。
                try {
                    if (wantNewRight) {
                        state.tempPageSide = 1
                        // 等重组（pageCount 生效）+ 新页布局（槽位注册）后再翻页。
                        withFrameNanos { }
                        withFrameNanos { }
                        pagerState.animateScrollToPage(currentPages.size)
                    } else {
                        // 左侧插入：pager 页 0 变为临时屏，原内容整体右移一屏。
                        state.tempPageSide = -1
                        withFrameNanos { }
                        withFrameNanos { }
                        pagerState.scrollToPage(0)
                    }
                } finally {
                    state.dragHoverTarget = null
                    state.folderCandidate = null
                    state.folderArmed = false
                    state.edgeDirection = 0
                    currentOnDragMoved(state.dragPosition)
                }
                continue
            }
            if (targetPage !in 0..lastPagerPage || targetPage == pagerState.currentPage) {
                // 方向已无页可翻（如临时屏已开）：等手指离开或换向，避免忙等。
                snapshotFlow { state.edgeDirection }.first { it != direction }
                continue
            }
            delay(EDGE_HOVER_MILLIS)
            if (state.edgeDirection != direction) continue
            try {
                pagerState.animateScrollToPage(targetPage)
            } finally {
                state.dragHoverTarget = null
                state.folderCandidate = null
                state.folderArmed = false
                state.edgeDirection = 0
                currentOnDragMoved(state.dragPosition)
            }
        }
    }

    // 上下滚动模式：拖拽中手指悬停顶部/底部边缘时持续滚动，滚动后按
    // 最后手指位置重跑落点解析（与边缘翻页后重解析的做法一致）。
    LaunchedEffect(state.draggingKey, state.verticalEdgeDirection) {
        val direction = state.verticalEdgeDirection
        if (!verticalMode || state.draggingKey == null || direction == 0) return@LaunchedEffect
        while (state.draggingKey != null && state.verticalEdgeDirection == direction) {
            lazyGridState.scrollBy(16f * direction)
            currentOnDragMoved(state.dragPosition)
            delay(16)
        }
    }
}
