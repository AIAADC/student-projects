package com.webshell.feature.home

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.Bedtime
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DesktopWindows
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FolderOff
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Launch
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.IntOffset
import com.webshell.core.designsystem.components.AppContextMenu
import com.webshell.core.designsystem.components.AppContextMenuItem

/** Presentation owns action labels/order; callers own persistence and navigation. */
@Composable
internal fun HomeCellMenu(
    cell: HomeCell,
    anchorPoint: IntOffset?,
    onOpen: () -> Unit,
    onDissolve: () -> Unit,
    onCopyLink: () -> Unit,
    onRename: () -> Unit,
    onChangeIcon: () -> Unit,
    onRefresh: () -> Unit,
    onToggleDesktop: () -> Unit,
    onToggleKeepAlive: () -> Unit,
    onRemoveFromFolder: () -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    val items = buildList {
        if (cell.isFolder) {
            add(AppContextMenuItem(stringResource(R.string.home_open_folder), Icons.Filled.FolderOpen, onClick = onOpen))
            add(AppContextMenuItem(stringResource(R.string.home_folder_dissolve), Icons.Filled.FolderOff, onClick = onDissolve))
        } else {
            add(AppContextMenuItem(stringResource(R.string.home_open), Icons.Filled.Launch, onClick = onOpen))
            add(AppContextMenuItem(stringResource(R.string.home_copy_link), Icons.Filled.Link, onClick = onCopyLink))
            add(AppContextMenuItem(stringResource(R.string.home_rename), Icons.Filled.Edit, onClick = onRename))
            add(AppContextMenuItem(stringResource(R.string.home_change_icon), Icons.Filled.Image, onClick = onChangeIcon))
            add(AppContextMenuItem(stringResource(R.string.home_refresh), Icons.Filled.Refresh, onClick = onRefresh))
            add(AppContextMenuItem(
                stringResource(if (cell.app.desktopMode) R.string.home_mobile_mode else R.string.home_desktop_mode),
                Icons.Filled.DesktopWindows, onClick = onToggleDesktop,
            ))
            add(AppContextMenuItem(
                stringResource(if (cell.app.keepAlive) R.string.home_keep_alive_off else R.string.home_keep_alive_on),
                Icons.Filled.Bedtime, onClick = onToggleKeepAlive,
            ))
            if (cell.app.folderId != null) {
                add(AppContextMenuItem(stringResource(R.string.home_remove_from_folder), Icons.Filled.FolderOff, onClick = onRemoveFromFolder))
            }
        }
        add(AppContextMenuItem(
            stringResource(if (cell.isFolder) R.string.home_delete_folder else R.string.home_delete),
            Icons.Filled.Delete, destructive = true, onClick = onDelete,
        ))
    }
    AppContextMenu(items = items, onDismiss = onDismiss, anchorPoint = anchorPoint)
}

@Composable
internal fun HomeBlankMenu(
    entryVisible: Boolean,
    anchorPoint: IntOffset?,
    onEdit: () -> Unit,
    onToggleEntry: () -> Unit,
    onDismiss: () -> Unit,
) {
    AppContextMenu(
        items = listOf(
            AppContextMenuItem(stringResource(R.string.home_edit_mode), Icons.Filled.Edit, onClick = onEdit),
            AppContextMenuItem(
                stringResource(if (entryVisible) R.string.home_hide_all_apps_entry else R.string.home_show_all_apps_entry),
                Icons.Filled.Apps, onClick = onToggleEntry,
            ),
        ),
        onDismiss = onDismiss, anchorPoint = anchorPoint,
    )
}
