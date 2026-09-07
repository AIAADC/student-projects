package com.webshell.feature.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import com.webshell.core.data.HomeSettings
import com.webshell.core.designsystem.catalog.CatalogCategory
import com.webshell.core.designsystem.catalog.CatalogEntry
import com.webshell.core.designsystem.components.AppPrimaryButton
import com.webshell.core.designsystem.components.AppToggleRow

/** Every scene calls real launcher presentation; no business VM, persistence or metadata request. */
fun homeCatalog(): List<CatalogEntry> = listOf(
    CatalogEntry("home.launcher.cells", CatalogCategory.HOME, R.string.home_catalog_cells, R.string.home_catalog_cells_detail) {
        LauncherSamples(edit = false)
    },
    CatalogEntry("home.launcher.edit", CatalogCategory.HOME, R.string.home_catalog_edit, R.string.home_catalog_edit_detail) {
        LauncherSamples(edit = true)
    },
    CatalogEntry("home.search", CatalogCategory.HOME, R.string.home_catalog_search, R.string.home_catalog_search_detail) {
        var pages by remember { mutableStateOf(false) }
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            HomeSearchPill(4, 1, pages, onClick = { pages = !pages })
        }
    },
    CatalogEntry("home.empty", CatalogCategory.HOME, R.string.home_catalog_empty, R.string.home_catalog_empty_detail) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { HomeEmptyState() }
    },
    CatalogEntry("home.library", CatalogCategory.HOME, R.string.home_catalog_library, R.string.home_catalog_library_detail) {
        val apps = rememberHomeCatalogApps()
        AllAppsContent(
            sections = listOf(
                AllAppsIndex.Section("A", listOf(apps[3], apps[7])),
                AllAppsIndex.Section("B", listOf(apps[1], apps[8])),
                AllAppsIndex.Section("C", listOf(apps[6])),
                AllAppsIndex.Section("D", listOf(apps[4])),
                AllAppsIndex.Section("Y", listOf(apps[0], apps[2])),
            ),
            columns = 4, iconSize = 60.dp, cornerRadiusPercent = 26, onLaunch = { _, _ -> }, onDismiss = {},
        )
    },
    CatalogEntry("home.library.empty", CatalogCategory.HOME, R.string.home_catalog_library_empty, R.string.home_catalog_library_empty_detail) {
        AllAppsContent(emptyList(), 4, 60.dp, 26, onLaunch = { _, _ -> }, onDismiss = {})
    },
    CatalogEntry("home.entry", CatalogCategory.HOME, R.string.home_catalog_entry, R.string.home_catalog_entry_detail) {
        FloatingEntrySample()
    },
    CatalogEntry("home.folder", CatalogCategory.HOME, R.string.home_catalog_folder, R.string.home_catalog_folder_detail) {
        HomeOverlaySample(HomeOverlayKind.FOLDER)
    },
    CatalogEntry("home.menu", CatalogCategory.OVERLAYS, R.string.home_catalog_menu, R.string.home_catalog_menu_detail) {
        HomeOverlaySample(HomeOverlayKind.MENU)
    },
    CatalogEntry("home.blank-menu", CatalogCategory.OVERLAYS, R.string.home_catalog_blank_menu, R.string.home_catalog_blank_menu_detail) {
        HomeOverlaySample(HomeOverlayKind.BLANK_MENU)
    },
    CatalogEntry("home.rename", CatalogCategory.OVERLAYS, R.string.home_catalog_rename, R.string.home_catalog_rename_detail) {
        HomeOverlaySample(HomeOverlayKind.RENAME)
    },
    CatalogEntry("home.icon-editor", CatalogCategory.OVERLAYS, R.string.home_catalog_icon_editor, R.string.home_catalog_icon_editor_detail) {
        HomeOverlaySample(HomeOverlayKind.ICON)
    },
    CatalogEntry("home.delete", CatalogCategory.OVERLAYS, R.string.home_catalog_delete, R.string.home_catalog_delete_detail) {
        HomeOverlaySample(HomeOverlayKind.DELETE)
    },
)

@Composable
private fun LauncherSamples(edit: Boolean) {
    val apps = rememberHomeCatalogApps()
    var animate by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf(true) }
    val jiggle = rememberLauncherJiggle(edit && animate)
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    val labelHeight = with(density) { measurer.measure("国Hg", style = launcherLabelStyle()).size.height.toDp() }
    Column(Modifier.fillMaxSize()) {
        if (edit) AppToggleRow(
            title = stringResource(R.string.home_catalog_animate), checked = animate, onCheckedChange = { animate = it },
        )
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            val size = ((maxWidth - 64.dp) / 3).coerceIn(24.dp, 60.dp)
            LazyVerticalGrid(
                columns = GridCells.Fixed(3), contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(24.dp),
            ) {
                repeat(5) { index ->
                    item(key = index) {
                        val members = if (index == 2) apps.take(9) else emptyList()
                        LauncherCell(
                            cell = HomeCell(apps[index].id, apps[index], members), iconSize = size,
                            settings = HomeSettings(), isSource = index == 3,
                            isMergeTarget = index == 2, isReorderTarget = index == 4,
                            jiggleRotation = jiggle, isEditMode = edit, isEditSelected = selected && index == 0,
                            modifier = Modifier.fillMaxWidth().height(size + labelHeight + 5.dp)
                                .clickable { selected = !selected },
                        )
                    }
                }
                item { AddCell(size, true, 26, Modifier.fillMaxWidth().height(size + labelHeight + 5.dp)) }
            }
        }
        if (edit) EditModeOverlay(
            selectedCount = if (selected) 1 else 0, totalCount = 5,
            onSelectAll = { selected = !selected }, onClearSelection = { selected = false },
        )
    }
}

@Composable
private fun FloatingEntrySample() {
    var position by remember { mutableStateOf(-1f to -1f) }
    var visible by remember { mutableStateOf(true) }
    Column(Modifier.fillMaxSize()) {
        AppToggleRow(stringResource(R.string.home_all_apps), visible, onCheckedChange = { visible = it })
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            val density = LocalDensity.current
            if (visible) AllAppsEntry(
                iconSize = 60.dp, cornerRadiusPercent = 26, showLabel = true,
                posX = position.first, posY = position.second,
                containerWidthPx = with(density) { maxWidth.toPx() },
                containerHeightPx = with(density) { maxHeight.toPx() },
                onOpen = {}, onHide = { visible = false }, onPositionChange = { x, y -> position = x to y },
                onBoundsChanged = {},
            )
        }
    }
}

private enum class HomeOverlayKind { FOLDER, MENU, BLANK_MENU, RENAME, ICON, DELETE }

@Composable
private fun HomeOverlaySample(kind: HomeOverlayKind) {
    val apps = rememberHomeCatalogApps()
    val cell = HomeCell(apps[0].id, apps[0])
    var open by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf("") }
    val dismiss = { open = false }
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        AppPrimaryButton(stringResource(R.string.home_catalog_show), onClick = { open = true })
    }
    if (open) when (kind) {
        HomeOverlayKind.FOLDER -> FolderExpandedPage(apps, 26, onLaunch = { _, _ -> dismiss() }, onDissolve = dismiss, onDismiss = dismiss)
        HomeOverlayKind.MENU -> HomeCellMenu(
            cell, null, dismiss, dismiss, dismiss, dismiss, dismiss, dismiss, dismiss, dismiss, dismiss, dismiss, dismiss,
        )
        HomeOverlayKind.BLANK_MENU -> HomeBlankMenu(true, null, dismiss, dismiss, dismiss)
        HomeOverlayKind.RENAME -> HomeRenameDialog(apps[0], onConfirm = { dismiss() }, onDismiss = dismiss)
        HomeOverlayKind.ICON -> HomeIconEditDialog(
            apps[0], 26, draft, importing = false, importFailed = false,
            onDraftChange = { draft = it }, onPickIcon = {}, onConfirm = dismiss, onDismiss = dismiss,
        )
        HomeOverlayKind.DELETE -> HomeDeleteDialog(cell, onConfirm = dismiss, onDismiss = dismiss)
    }
}
