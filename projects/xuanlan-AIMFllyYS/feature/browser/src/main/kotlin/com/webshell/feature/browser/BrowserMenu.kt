package com.webshell.feature.browser

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bookmarks
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DesktopWindows
import androidx.compose.material.icons.filled.FindInPage
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.components.AppCard
import com.webshell.core.designsystem.components.AppListDivider
import com.webshell.core.designsystem.components.AppListRow
import com.webshell.core.designsystem.components.AppNavigationBar
import com.webshell.core.designsystem.components.AppSectionHeader
import com.webshell.core.designsystem.components.AppSheet

internal enum class BrowserMenuAction {
    Back, Forward, RefreshOrStop, Bookmark, Find, NewTab, Desktop, History, Bookmarks,
    HideToolbar, Collapse, CloseAll,
}

internal data class BrowserMenuState(
    val hasPage: Boolean = false,
    val hasTabs: Boolean = false,
    val canGoBack: Boolean = false,
    val canGoForward: Boolean = false,
    val loading: Boolean = false,
    val bookmarked: Boolean = false,
    val desktopMode: Boolean = false,
)

@Composable
internal fun BrowserMenuSheet(state: BrowserMenuState, onAction: (BrowserMenuAction) -> Unit, onDismiss: () -> Unit) {
    AppSheet(onDismissRequest = onDismiss) { BrowserMenuContent(state, onAction, onDismiss) }
}

/** The catalog and production sheet share this content, not a facsimile of the menu. */
@Composable
internal fun BrowserMenuContent(
    state: BrowserMenuState,
    onAction: (BrowserMenuAction) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(bottom = 16.dp)) {
        AppNavigationBar(
            title = stringResource(R.string.browser_menu),
            actions = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.browser_done)) } },
        )
        Column(Modifier.padding(horizontal = 16.dp)) {
            AppCard(contentPadding = PaddingValues(0.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    IconButton(onClick = { onAction(BrowserMenuAction.Back) }, enabled = state.canGoBack,
                        modifier = Modifier.size(48.dp)) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, stringResource(R.string.browser_back))
                    }
                    IconButton(onClick = { onAction(BrowserMenuAction.Forward) }, enabled = state.canGoForward,
                        modifier = Modifier.size(48.dp)) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, stringResource(R.string.browser_forward))
                    }
                    IconButton(onClick = { onAction(BrowserMenuAction.RefreshOrStop) }, enabled = state.hasTabs,
                        modifier = Modifier.size(48.dp)) {
                        Icon(if (state.loading) Icons.Filled.Close else Icons.Filled.Refresh,
                            stringResource(if (state.loading) R.string.browser_stop else R.string.browser_refresh))
                    }
                    IconButton(onClick = { onAction(BrowserMenuAction.NewTab) }, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.Filled.Add, stringResource(R.string.browser_new_tab))
                    }
                }
            }
            AppSectionHeader(stringResource(R.string.browser_menu_page))
            AppCard(contentPadding = PaddingValues(0.dp)) {
                AppListRow(
                    title = stringResource(if (state.bookmarked) R.string.browser_remove_bookmark else R.string.browser_add_bookmark),
                    leadingIcon = if (state.bookmarked) Icons.Filled.Star else Icons.Filled.StarBorder,
                    onClick = if (state.hasPage) ({ onAction(BrowserMenuAction.Bookmark) }) else null,
                )
                AppListDivider()
                AppListRow(title = stringResource(R.string.browser_find), leadingIcon = Icons.Filled.FindInPage,
                    onClick = if (state.hasPage) ({ onAction(BrowserMenuAction.Find) }) else null)
                AppListDivider()
                AppListRow(title = stringResource(R.string.browser_desktop), leadingIcon = Icons.Filled.DesktopWindows,
                    trailing = { if (state.desktopMode) Icon(Icons.Filled.Check, stringResource(R.string.browser_enabled)) },
                    onClick = if (state.hasTabs) ({ onAction(BrowserMenuAction.Desktop) }) else null)
            }
            AppSectionHeader(stringResource(R.string.browser_menu_library))
            AppCard(contentPadding = PaddingValues(0.dp)) {
                AppListRow(title = stringResource(R.string.browser_history), leadingIcon = Icons.Filled.History,
                    onClick = { onAction(BrowserMenuAction.History) })
                AppListDivider()
                AppListRow(title = stringResource(R.string.browser_bookmarks), leadingIcon = Icons.Filled.Bookmarks,
                    onClick = { onAction(BrowserMenuAction.Bookmarks) })
            }
            AppSectionHeader(stringResource(R.string.browser_menu_display))
            AppCard(contentPadding = PaddingValues(0.dp)) {
                AppListRow(title = stringResource(R.string.browser_hide_toolbar), leadingIcon = Icons.Filled.VisibilityOff,
                    subtitle = stringResource(R.string.browser_restore_hint),
                    onClick = { onAction(BrowserMenuAction.HideToolbar) })
                AppListDivider()
                AppListRow(title = stringResource(R.string.browser_collapse_dock), leadingIcon = Icons.Filled.RadioButtonUnchecked,
                    onClick = { onAction(BrowserMenuAction.Collapse) })
            }
            TextButton(onClick = { onAction(BrowserMenuAction.CloseAll) }, enabled = state.hasTabs,
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Text(stringResource(R.string.browser_close_all_tabs), color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
