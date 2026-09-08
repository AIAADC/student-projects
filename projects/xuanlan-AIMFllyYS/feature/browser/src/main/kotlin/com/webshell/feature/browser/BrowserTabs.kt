package com.webshell.feature.browser

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Public
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.components.AppNavigationBar
import com.webshell.core.designsystem.components.AppSheet

@Composable
internal fun TabSwitcherSheet(
    tabs: List<BrowserTab>, activeTabId: String?,
    onActivate: (String) -> Unit, onClose: (String) -> Unit,
    onNewTab: () -> Unit, onCloseAll: () -> Unit, onDismiss: () -> Unit,
) {
    AppSheet(onDismissRequest = onDismiss) {
        TabSwitcherContent(tabs, activeTabId, onActivate, onClose, onNewTab, onCloseAll, onDismiss,
            Modifier.fillMaxHeight(0.86f))
    }
}

@Composable
internal fun TabSwitcherContent(
    tabs: List<BrowserTab>, activeTabId: String?,
    onActivate: (String) -> Unit, onClose: (String) -> Unit,
    onNewTab: () -> Unit, onCloseAll: () -> Unit, onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxWidth()) {
        AppNavigationBar(
            title = stringResource(R.string.browser_tabs_count, tabs.size),
            actions = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.browser_done)) } },
        )
        if (tabs.isEmpty()) {
            EmptyTabsPrompt(modifier = Modifier.weight(1f).fillMaxWidth(), onNewTab = onNewTab)
        } else {
            LazyVerticalGrid(
                columns = GridCells.Adaptive(132.dp), modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp), verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                items(tabs, key = { it.tabId }) { tab ->
                    TabCard(tab, tab.tabId == activeTabId, { onActivate(tab.tabId) }, { onClose(tab.tabId) })
                }
            }
        }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = onNewTab, modifier = Modifier.weight(1f)) {
                Icon(Icons.Filled.Add, null)
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.browser_new_tab), textAlign = TextAlign.Center)
            }
            TextButton(onClick = onCloseAll, enabled = tabs.isNotEmpty(), modifier = Modifier.weight(1f)) {
                Text(stringResource(R.string.browser_close_all), color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center)
            }
        }
    }
}

@Composable
internal fun TabCard(tab: BrowserTab, active: Boolean, onClick: () -> Unit, onClose: () -> Unit) {
    val shape = RoundedCornerShape(22.dp)
    val borderColor = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
    Column(
        Modifier.clip(shape).background(MaterialTheme.colorScheme.surfaceContainerLow)
            .border(if (active) 2.dp else 0.5.dp, borderColor, shape)
            .semantics { selected = active }.clickable(onClick = onClick),
    ) {
        Box(Modifier.fillMaxWidth().aspectRatio(0.9f).background(MaterialTheme.colorScheme.surfaceContainerHigh)) {
            val thumb = tab.thumbnail
            if (thumb != null) {
                Image(bitmap = remember(thumb) { thumb.asImageBitmap() }, contentDescription = null,
                    modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            } else {
                Icon(Icons.Filled.Public, null, modifier = Modifier.align(Alignment.Center).size(42.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f))
            }
            IconButton(onClick = onClose, modifier = Modifier.align(Alignment.TopEnd).padding(3.dp).size(48.dp)) {
                Box(Modifier.size(28.dp).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.94f), CircleShape),
                    contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Close, stringResource(R.string.browser_close_tab), Modifier.size(17.dp))
                }
            }
        }
        Column(Modifier.padding(horizontal = 12.dp, vertical = 12.dp)) {
            Text(tab.title.ifBlank { stringResource(R.string.browser_new_tab) },
                style = MaterialTheme.typography.labelLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(tab.url.stripScheme(), style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp))
        }
    }
}
