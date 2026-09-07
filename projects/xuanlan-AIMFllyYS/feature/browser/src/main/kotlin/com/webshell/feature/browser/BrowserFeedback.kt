package com.webshell.feature.browser

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Public
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.components.AppPrimaryButton

@Composable
internal fun SheetEmptyState(message: String, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center)
    }
}

@Composable
internal fun EmptyTabsPrompt(modifier: Modifier = Modifier, onNewTab: () -> Unit) {
    WebSessionEmptyState(
        title = stringResource(R.string.browser_no_tabs), description = stringResource(R.string.browser_start_hint),
        actionLabel = stringResource(R.string.browser_create_tab), onAction = onNewTab, modifier = modifier,
    )
}

/** Shared browser/single-site empty, opening and unavailable presentation. */
@Composable
fun WebSessionEmptyState(
    title: String, description: String, actionLabel: String, onAction: () -> Unit,
    modifier: Modifier = Modifier, loading: Boolean = false,
) {
    Column(modifier.padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center) {
        Icon(Icons.Filled.Public, null, modifier = Modifier.size(56.dp),
            tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.65f))
        Text(title, style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(top = 20.dp))
        Text(description, style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp))
        AppPrimaryButton(actionLabel, onAction, enabled = !loading, loading = loading)
    }
}

@Composable
fun WebSessionStatusMessage(message: String, modifier: Modifier = Modifier) {
    Text(message,
        modifier = modifier.semantics { liveRegion = LiveRegionMode.Polite }
            .clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.inverseSurface)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.inverseOnSurface)
}
