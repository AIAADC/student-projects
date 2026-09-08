package com.webshell.feature.browser

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.components.AppListDivider
import com.webshell.core.designsystem.components.AppListRow
import com.webshell.core.designsystem.components.AppNavigationBar
import com.webshell.core.designsystem.components.AppSheet

@Composable
internal fun SavedPagesSheet(
    entries: List<BrowserSavedPage>, bookmarks: Boolean,
    onOpen: (String) -> Unit, onRemove: (String) -> Unit, onClear: () -> Unit, onDismiss: () -> Unit,
) {
    AppSheet(onDismissRequest = onDismiss) {
        SavedPagesContent(entries, bookmarks, onOpen, onRemove, onClear, onDismiss, Modifier.fillMaxHeight(0.74f))
    }
}

@Composable
internal fun SavedPagesContent(
    entries: List<BrowserSavedPage>, bookmarks: Boolean,
    onOpen: (String) -> Unit, onRemove: (String) -> Unit, onClear: () -> Unit, onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth()) {
        AppNavigationBar(
            title = stringResource(if (bookmarks) R.string.browser_bookmarks else R.string.browser_history),
            actions = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.browser_done)) } },
        )
        if (entries.isEmpty()) {
            SheetEmptyState(stringResource(if (bookmarks) R.string.browser_no_bookmarks else R.string.browser_no_history),
                Modifier.weight(1f))
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp)
                    .clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceContainerLow),
            ) {
                items(entries, key = { it.id }) { entry ->
                    AppListRow(
                        title = entry.title.ifBlank { entry.url.stripScheme() }, subtitle = entry.url,
                        leadingIcon = if (bookmarks) Icons.Filled.Star else Icons.Filled.Public,
                        onClick = { onOpen(entry.url) },
                        trailing = if (bookmarks) ({
                            IconButton(onClick = { onRemove(entry.url) }) {
                                Icon(Icons.Filled.Close, stringResource(R.string.browser_delete_bookmark))
                            }
                        }) else null,
                    )
                    AppListDivider()
                }
            }
        }
        if (!bookmarks) {
            TextButton(onClick = onClear, enabled = entries.isNotEmpty(),
                modifier = Modifier.align(Alignment.End).padding(horizontal = 12.dp, vertical = 8.dp)) {
                Text(stringResource(R.string.browser_clear_history), color = MaterialTheme.colorScheme.error)
            }
        } else Spacer(Modifier.height(20.dp))
    }
}
