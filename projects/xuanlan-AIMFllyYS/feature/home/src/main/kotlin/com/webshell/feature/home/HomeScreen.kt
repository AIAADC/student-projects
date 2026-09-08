package com.webshell.feature.home

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webshell.core.data.SCROLL_MODE_VERTICAL
import kotlin.math.roundToInt
import kotlinx.coroutines.delay

/**
 * 手机桌面式主页。
 *
 * 拖拽采用与 Launcher3 相同的分层思路：网格只保留占位，独立浮动层绘制跟手图标，
 * 因此拖动不会参与 LazyGrid 测量，也不会把整页撑大或缩小。
 *
 * 交互层拆分（见同包文件）：
 * - [HomeInteractionState]：全部拖拽/菜单/编辑模式会话状态的集中持有者；
 * - [HomeGesturesKt]（HomeGestures.kt）：cell 手势检测、根级拖拽会话、空白长按、
 *   双指捏合、边缘悬停翻页等手势板块。本文件只保留组合根、网格容器、
 *   菜单/对话框与浮层。
 */
@Composable
fun HomeScreen(
    onLaunch: (appId: String, url: String) -> Unit = { _, _ -> },
    onAddRequested: () -> Unit = {},
    wallpaperBacked: Boolean = false,
    viewModel: HomeViewModel = androidx.hilt.navigation.compose.hiltViewModel(),
) {
    CompositionLocalProvider(LocalLauncherWallpaperBacked provides wallpaperBacked) {
        HomeScreenContent(onLaunch = onLaunch, onAddRequested = onAddRequested, viewModel = viewModel)
    }
}

@Composable
private fun HomeScreenContent(
    onLaunch: (appId: String, url: String) -> Unit,
    onAddRequested: () -> Unit,
    viewModel: HomeViewModel,
) {
    val apps by viewModel.apps.collectAsStateWithLifecycle()
    val settings by viewModel.settings.collectAsStateWithLifecycle()
    val pageCapacity = (settings.gridColumns * settings.gridRows).coerceAtLeast(1)
    // 自由摆放（默认）：稀疏网格，空槽为 null，图标停在松手的网格位；
    // 自动整理：密集压实（传统行为）。
    val freePlacement = !settings.autoArrangeHome
    val pages: List<List<HomeCell?>> = remember(apps, pageCapacity, freePlacement) {
        if (freePlacement) {
            HomePages.buildSparse(apps = apps, pageCapacity = pageCapacity)
        } else {
            HomePages.build(apps = apps, pageCapacity = pageCapacity)
                .map { page -> page.map { cell -> cell as HomeCell? } }
        }
    }
    // 自由摆放下“添加”入口占末页第一个空槽（buildSparse 保证末页必有空槽）。
    val addSlotIndex = if (freePlacement) {
        pages.lastOrNull()?.indexOfFirst { it == null } ?: -1
    } else {
        -1
    }
    // 交互会话状态（拖拽/菜单/编辑模式/布局注册表）集中在 HomeInteractionState：
    // 手势协程只捕获这个稳定对象，读写落到同一份快照状态（历史上两个 P0 缺陷
    // 都源于状态散落在数十个 remember 中被手势闭包按值捕获，见该类的文档）。
    // 这里用属性委托把各字段别名为本地变量，下方组合代码的读写无需改动。
    val ui = rememberHomeInteractionState()
    var tempPageSide by ui::tempPageSide
    val pagerState = rememberPagerState(
        pageCount = { (pages.size + if (tempPageSide != 0) 1 else 0).coerceAtLeast(1) },
    )
    // pager 页号 → 数据页号的左偏移：左侧临时屏存在时数据页 = pager 页 - 1。
    val tempLeftOffset = ui.tempLeftOffset
    // 上下滚动模式：所有页摊平成一条 LazyVerticalGrid（数据模型不变，
    // 落子时全局下标换算回 page = index / capacity、slot = index % capacity）。
    val verticalMode = settings.homeScrollMode == SCROLL_MODE_VERTICAL
    val lazyGridState = rememberLazyGridState()
    val flatCells: List<HomeCell?> = remember(pages, pageCapacity, verticalMode) {
        if (verticalMode) HomePages.flatten(pages, pageCapacity) else emptyList()
    }
    // “添加”入口在摊平列表中的下标：末页第一个空槽（自由摆放用 addSlotIndex；
    // 自动整理的末页图标压实靠左，首个空槽即 pages.last().size）。
    val addFlatIndex = remember(pages, addSlotIndex, freePlacement, pageCapacity) {
        val lastPageStart = (pages.size - 1).coerceAtLeast(0) * pageCapacity
        val slotInPage = if (freePlacement) {
            addSlotIndex
        } else {
            pages.lastOrNull()?.size ?: 0
        }
        if (slotInPage in 0 until pageCapacity) lastPageStart + slotInPage else -1
    }
    val haptics = LocalHapticFeedback.current
    val density = LocalDensity.current
    val textMeasurer = rememberTextMeasurer()
    val labelStyle = launcherLabelStyle()
    val labelHeightDp = with(density) {
        textMeasurer.measure("国Hg", style = labelStyle, maxLines = 1).size.height.toDp().value
    }
    val actionLineHeightDp = with(density) {
        textMeasurer.measure("国Hg", style = MaterialTheme.typography.labelLarge, maxLines = 1).size.height.toDp().value
    }

    var rootOrigin by ui::rootOrigin
    var draggingKey by ui::draggingKey
    var dragPosition by ui::dragPosition
    var dragRegistration by ui::dragRegistration
    // iOS 顺序：长按先弹情境菜单；按住并移动超过 16dp 后菜单淡出、图标跟手。
    var menuFor by ui::menuFor
    var menuPressPoint by ui::menuPressPoint
    var blankMenuPoint by ui::blankMenuPoint
    var allAppsEntryRect by ui::allAppsEntryRect
    // 「全部应用」抽屉开关。
    var allAppsOpen by remember { mutableStateOf(false) }
    var folderOpenFor by remember { mutableStateOf<String?>(null) }
    var confirmDeleteFor by remember { mutableStateOf<HomeCell?>(null) }
    var confirmDissolveFor by remember { mutableStateOf<HomeCell?>(null) }
    var renameFor by remember { mutableStateOf<HomeCell?>(null) }
    var iconEditFor by remember { mutableStateOf<HomeCell?>(null) }
    // ViewModel 一次性消息（刷新成功/失败等）的轻量 toast 浮层。
    var toast by remember { mutableStateOf<String?>(null) }
    val clipboardManager = LocalClipboardManager.current
    val linkCopiedMessage = stringResource(R.string.home_link_copied)
    // 编辑（jiggle）模式：双指捏合进入，点选图标做批量整理。
    var editMode by ui::editMode
    val editSelection = ui.editSelection
    val jiggleRotation = rememberLauncherJiggle(editMode)

    // Build the lookup once per data update, not once per drag/selection state change.
    val cellsByKey = remember(pages) { pages.asSequence().flatten().filterNotNull().associateBy { it.key } }
    val draggedCell = cellsByKey[draggingKey]

    BackHandler(enabled = folderOpenFor != null) { folderOpenFor = null }
    BackHandler(enabled = editMode) {
        editMode = false
        editSelection.clear()
    }

    fun exitEditMode() {
        editMode = false
        editSelection.clear()
    }

    LaunchedEffect(Unit) {
        viewModel.messages.collect { toast = it }
    }

    // 落子动作：手势层不直接依赖 ViewModel，动作在此装配绑定（pageCapacity 随
    // 设置变化，手势工厂内以 rememberUpdatedState 保持最新）。
    val dropActions = remember(viewModel, pageCapacity) {
        HomeDropActions(
            createFolder = viewModel::createFolder,
            prependPageMove = { key, slot ->
                viewModel.prependPageMove(key, slot, pageCapacity)
            },
            moveCellToSlot = { key, page, slot ->
                viewModel.moveCellToSlot(key, page, slot, pageCapacity)
            },
            moveApp = viewModel::moveApp,
            moveCell = { from, target -> viewModel.moveCell(from, target, pageCapacity) },
        )
    }

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .onGloballyPositioned { rootOrigin = it.positionInRoot() }
            // 空白处长按菜单（Initial pass）与双指捏合编辑模式：手势板块见
            // HomeGestures.kt，状态全部落在 ui（HomeInteractionState）。
            .homeBlankAreaMenu(ui, haptics)
            .homePinchEditMode(ui, haptics),
    ) {
        // Wallpaper is owned by the app root so the dock samples the same single backdrop.
        val widthPx = with(density) { maxWidth.toPx() }
        val heightPx = with(density) { maxHeight.toPx() }
        val footerHeightDp = launcherFooterHeightDp(maxWidth, cellsByKey.size)
        val geometry = remember(maxWidth, maxHeight, settings.gridColumns, settings.gridRows, settings.iconSizeDp, settings.showLabels, density.fontScale, labelHeightDp, actionLineHeightDp, footerHeightDp) {
            LauncherGeometry.resolve(
                widthDp = maxWidth.value,
                heightDp = maxHeight.value,
                columns = settings.gridColumns,
                rows = settings.gridRows,
                requestedIconSizeDp = settings.iconSizeDp.toFloat(),
                showLabels = settings.showLabels,
                fontScale = density.fontScale,
                measuredLabelHeightDp = labelHeightDp,
                measuredHeaderHeightDp = maxOf(56f, actionLineHeightDp + 24f),
                measuredFooterHeightDp = footerHeightDp,
            )
        }
        val iconSize = geometry.iconSizeDp.dp
        val cellHeight = geometry.cellHeightDp.dp

        // 落点/悬停解析入口：手势层每个 MOVE 事件回调这里。pagerState.currentPage
        // 在调用瞬间现读（组合期快照在拖拽中会过期）；本 lambda 随重组重建，
        // 手势工厂内以 rememberUpdatedState 包装，协程始终调用最新版本。
        val onDragMoved: (Offset) -> Unit = { position ->
            ui.updateDropTargets(
                position = position,
                pages = pages,
                currentPage = pagerState.currentPage,
                verticalMode = verticalMode,
                containerWidthPx = widthPx,
                containerHeightPx = heightPx,
                iconSize = iconSize,
                density = density,
                haptics = haptics,
            )
        }

        // 拖拽悬停效果：文件夹合并计时、边缘翻页/开新屏状态机、上下滚动自动滚动。
        HomeDragEffects(
            state = ui,
            pagerState = pagerState,
            lazyGridState = lazyGridState,
            pages = pages,
            verticalMode = verticalMode,
            haptics = haptics,
            onDragMoved = onDragMoved,
        )

        val gridCellContent: @Composable (Int, Int, HomeCell?, Boolean) -> Unit = { page, slot, cell, isAdd ->
            HomeGridSlot(
                page = page, slot = slot, cell = cell, isAddSlot = isAdd,
                ui = ui, settings = settings, iconSize = iconSize, cellHeight = cellHeight,
                jiggleRotation = jiggleRotation, onAddRequested = onAddRequested,
                onLaunch = onLaunch, onFolderOpen = { folderOpenFor = it }, onDragMoved = onDragMoved,
            )
        }

        // 拖拽会话层（根级，对齐 Launcher3 DragController）：包住 pager/列表的
        // 容器承载拖拽会话主循环（实现见 HomeGestures.kt 的 homeDragSession）。
        // 会话必须活在 cell 之上：翻页/开新屏后源 cell 随旧页被 Pager 移出组合，
        // 挂在 cell 上的协程会被一并取消——状态清零、临时屏回弹，表现为
        // “翻页/开新屏没反应”（本层即为该缺陷的修复）。
        Box(
            modifier = Modifier
                .fillMaxSize()
                // A folder uses the same wallpaper, with a static glass sheet over it. Hide
                // only grid pixels so sharp icon/label ghosts cannot leak through that sheet;
                // all cells remain measured and registered for the unchanged launcher model.
                .graphicsLayer { alpha = if (folderOpenFor == null) 1f else 0f }
                .homeDragSession(
                    state = ui,
                    pages = pages,
                    verticalMode = verticalMode,
                    autoArrangeHome = settings.autoArrangeHome,
                    dropActions = dropActions,
                    onDragMoved = onDragMoved,
                ),
        ) {
            HomeGridPages(
                layout = HomeGridLayout(
                    pages = pages, flatCells = flatCells, pageCapacity = pageCapacity,
                    columns = settings.gridColumns, verticalMode = verticalMode,
                    freePlacement = freePlacement, tempLeftOffset = tempLeftOffset,
                    addSlotIndex = addSlotIndex, addFlatIndex = addFlatIndex,
                ),
                geometry = geometry, pagerState = pagerState, lazyGridState = lazyGridState,
                isDragging = draggingKey != null, renderSlot = gridCellContent,
                renderDenseAdd = {
                    AddCell(
                        iconSize, settings.showLabels, settings.iconCornerRadiusPercent,
                        Modifier.fillMaxWidth().height(cellHeight).clickable(onClick = onAddRequested),
                    )
                },
            )
        }

        // iOS home alternates the compact Search capsule with page dots while paging/editing.
        if (!editMode) {
            HomeSearchPill(
                pageCount = pagerState.pageCount,
                currentPage = pagerState.currentPage,
                showPages = !verticalMode && settings.showPageIndicator &&
                    (pagerState.isScrollInProgress || draggingKey != null),
                onClick = { allAppsOpen = true },
                modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 4.dp),
            )
        }

        AnimatedVisibility(
            visible = apps.isEmpty() && draggingKey == null,
            modifier = Modifier.align(Alignment.Center),
        ) {
            HomeEmptyState()
        }

        // 「全部应用」浮动入口：渲染在 Pager/Grid 之外的 overlay，不参与网格测量；
        // 位于 DragLayer 之下，拖拽图标时浮层始终在最上。
        if (settings.allAppsEntryVisible) {
            AllAppsEntry(
                iconSize = iconSize,
                cornerRadiusPercent = settings.iconCornerRadiusPercent,
                showLabel = settings.showLabels,
                posX = settings.allAppsEntryPosX,
                posY = settings.allAppsEntryPosY,
                containerWidthPx = widthPx,
                containerHeightPx = heightPx,
                onOpen = { allAppsOpen = true },
                onHide = { viewModel.setAllAppsEntryVisible(false) },
                onPositionChange = { x, y -> viewModel.setAllAppsEntryPosition(x, y) },
                onBoundsChanged = { allAppsEntryRect = it },
                modifier = Modifier.align(Alignment.TopStart),
            )
        }

        // 独立于 Pager/LazyGrid 的 DragLayer：只绘制，不参与网格测量。
        draggedCell?.let { cell ->
            val scale by animateFloatAsState(
                targetValue = if (draggingKey != null) 1.08f else 1f,
                animationSpec = spring(dampingRatio = 0.68f, stiffness = 520f),
                label = "drag-icon-scale",
            )
            AppIcon(
                app = cell.app,
                size = iconSize,
                cornerRadiusPercent = settings.iconCornerRadiusPercent,
                folderPreview = cell.folderMembers,
                shadowElevation = 18.dp,
                modifier = Modifier.graphicsLayer {
                    translationX = dragPosition.x - rootOrigin.x - dragRegistration.x
                    translationY = dragPosition.y - rootOrigin.y - dragRegistration.y
                    scaleX = scale
                    scaleY = scale
                },
            )
        }

        // 编辑模式覆盖层：顶部"完成"胶囊 + 底部批量操作行。
        if (editMode) {
            EditModeOverlay(
                selectedCount = editSelection.values.count { it },
                totalCount = cellsByKey.size,
                onSelectAll = {
                    val allSelected = editSelection.values.count { it } == cellsByKey.size
                    cellsByKey.keys.forEach { editSelection[it] = !allSelected }
                },
                onClearSelection = { editSelection.clear() },
                modifier = Modifier.align(Alignment.BottomCenter),
            )
            // 完成胶囊：右上。
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(end = 16.dp),
            ) {
                Surface(
                    shape = RoundedCornerShape(50),
                    color = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.9f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.heightIn(min = 48.dp).clickable(onClick = { exitEditMode() }),
                ) {
                    Text(
                        stringResource(R.string.home_done),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(horizontal = 18.dp, vertical = 8.dp),
                    )
                }
            }
        }

        // 轻量 toast 浮层（参考 BrowserScreen）：底部文字，2.5s 自动消失。
        toast?.let { message ->
            Text(
                message,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 24.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.inverseSurface)
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.inverseOnSurface,
            )
            LaunchedEffect(message) {
                delay(2500)
                toast = null
            }
        }
    }

    blankMenuPoint?.let { point ->
        HomeBlankMenu(
            entryVisible = settings.allAppsEntryVisible,
            anchorPoint = IntOffset(point.x.roundToInt(), point.y.roundToInt()),
            onEdit = { editMode = true },
            onToggleEntry = { viewModel.setAllAppsEntryVisible(!settings.allAppsEntryVisible) },
            onDismiss = { blankMenuPoint = null },
        )
    }

    // 全部应用抽屉：首字母分区网格 + 右侧字母索引条。
    if (allAppsOpen) {
        val sections by viewModel.allAppsSections.collectAsStateWithLifecycle()
        AllAppsDrawer(
            sections = sections,
            columns = settings.gridColumns,
            iconSize = settings.iconSizeDp.dp,
            cornerRadiusPercent = settings.iconCornerRadiusPercent,
            onLaunch = { id, url ->
                allAppsOpen = false
                onLaunch(id, url)
            },
            onDismiss = { allAppsOpen = false },
        )
    }

    menuFor?.let { cell ->
        HomeCellMenu(
            cell = cell,
            anchorPoint = menuPressPoint?.let { IntOffset(it.x.roundToInt(), it.y.roundToInt()) },
            onOpen = {
                if (cell.isFolder) folderOpenFor = cell.app.folderId else onLaunch(cell.app.id, cell.app.url)
            },
            onDissolve = { confirmDissolveFor = cell },
            onCopyLink = {
                clipboardManager.setText(AnnotatedString(cell.app.url))
                toast = linkCopiedMessage
            },
            onRename = { renameFor = cell },
            onChangeIcon = { iconEditFor = cell },
            onRefresh = { viewModel.refreshMetadata(cell.app.id) },
            onToggleDesktop = { viewModel.toggleDesktopMode(cell.app.id) },
            onToggleKeepAlive = { viewModel.toggleKeepAlive(cell.app.id) },
            onRemoveFromFolder = { viewModel.removeFromFolder(cell.app.id) },
            onDelete = { confirmDeleteFor = cell },
            onDismiss = { menuFor = null; menuPressPoint = null },
        )
    }

    renameFor?.let { cell ->
        HomeRenameDialog(
            app = cell.app,
            onConfirm = { title -> viewModel.rename(cell.app.id, title); renameFor = null },
            onDismiss = { renameFor = null },
        )
    }

    iconEditFor?.let { cell ->
        HomeIconEditRoute(
            app = cell.app,
            cornerRadiusPercent = settings.iconCornerRadiusPercent,
            onImportIcon = viewModel::importIcon,
            onConfirm = { url -> viewModel.updateIcon(cell.app.id, url.ifBlank { null }); iconEditFor = null },
            onDismiss = { iconEditFor = null },
        )
    }

    confirmDeleteFor?.let { cell ->
        HomeDeleteDialog(
            cell = cell,
            onConfirm = {
                if (cell.isFolder) {
                    viewModel.deleteFolder(cell.app.folderId.orEmpty())
                } else {
                    val folderId = cell.app.folderId
                    if (folderId != null && apps.count { it.folderId == folderId } <= 2) {
                        viewModel.dissolveFolder(folderId)
                    }
                    viewModel.delete(cell.app.id)
                }
                confirmDeleteFor = null
            },
            onDismiss = { confirmDeleteFor = null },
        )
    }

    // 解散二次确认：取消时保留展开的文件夹，确认后一并关闭。
    confirmDissolveFor?.let { cell ->
        HomeDissolveDialog(
            cell = cell,
            onConfirm = {
                viewModel.dissolveFolder(cell.app.folderId.orEmpty())
                confirmDissolveFor = null
                folderOpenFor = null
            },
            onDismiss = { confirmDissolveFor = null },
        )
    }

    folderOpenFor?.let { folderId ->
        val members = apps.filter { it.folderId == folderId }
        FolderExpandedPage(
            members = members,
            cornerRadiusPercent = settings.iconCornerRadiusPercent,
            onLaunch = { id, url ->
                folderOpenFor = null
                onLaunch(id, url)
            },
            onDissolve = {
                cellsByKey.values.firstOrNull { it.isFolder && it.app.folderId == folderId }
                    ?.let { confirmDissolveFor = it }
            },
            onDismiss = { folderOpenFor = null },
        )
    }
}
