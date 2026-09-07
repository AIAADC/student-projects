package com.webshell.feature.browser

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Tab
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.components.AppFormField
import com.webshell.core.designsystem.components.staticGlassSurface

/** One row, three reachable controls. Navigation actions live in the explicit menu. */
@Composable
internal fun BrowserTopBar(
    urlInput: TextFieldValue,
    editing: Boolean,
    onUrlInputChanged: (TextFieldValue) -> Unit,
    onEditingChanged: (Boolean) -> Unit,
    onGo: () -> Unit,
    loading: Boolean,
    tabCount: Int,
    onTabSwitcher: () -> Unit,
    onMenu: () -> Unit,
    progress: Int,
) {
    val focusManager = LocalFocusManager.current
    val addressLabel = stringResource(R.string.browser_address)
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
                .staticGlassSurface(
                    shape = RoundedCornerShape(26.dp),
                    tint = MaterialTheme.colorScheme.surface,
                    opacity = if (editing) 0.94f else 0.36f,
                ).heightIn(min = 52.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onMenu, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Filled.MoreHoriz, stringResource(R.string.browser_menu), Modifier.size(24.dp),
                    tint = MaterialTheme.colorScheme.onSurface)
            }
            AppFormField(
                value = urlInput,
                onValueChange = onUrlInputChanged,
                modifier = Modifier.weight(1f)
                    .semantics { contentDescription = addressLabel }
                    .onFocusChanged { onEditingChanged(it.isFocused) },
                placeholder = stringResource(R.string.browser_address_placeholder),
                displayText = if (editing) null else urlInput.text.stripScheme(),
                containerColor = Color.Transparent,
                textStyle = MaterialTheme.typography.bodyMedium,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Uri, autoCorrectEnabled = false, imeAction = ImeAction.Go,
                ),
                keyboardActions = KeyboardActions(onGo = { onGo(); focusManager.clearFocus() }),
            )
            IconButton(onClick = onTabSwitcher, modifier = Modifier.size(48.dp)) {
                TabCountBadge(tabCount)
            }
        }
        // The reserved progress slot prevents navigation/loading from resizing the viewport.
        Box(Modifier.fillMaxWidth().height(2.dp)) {
            if (loading) LinearProgressIndicator(
                progress = { (progress / 100f).coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxSize(),
                trackColor = Color.Transparent,
            )
        }
    }
}

@Composable
internal fun TabCountBadge(tabCount: Int) {
    val label = stringResource(R.string.browser_tabs)
    val count = stringResource(R.string.browser_tabs_count, tabCount)
    Box(Modifier.clearAndSetSemantics { contentDescription = label; stateDescription = count }, contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.Tab, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(27.dp))
        Text(tabCount.coerceAtMost(99).toString(), style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 2.dp))
    }
}
