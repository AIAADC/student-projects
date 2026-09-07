package com.webshell.feature.browser

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.components.AppFormField

/** Temporary find UI uses two spacious rows, never squeezing the editor below a useful width. */
@Composable
internal fun FindBar(
    query: String,
    active: Int,
    total: Int,
    onQueryChanged: (String) -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onClose: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AppFormField(value = query, onValueChange = onQueryChanged,
                placeholder = stringResource(R.string.browser_find_placeholder), modifier = Modifier.weight(1f))
            IconButton(onClick = onClose, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Filled.Close, stringResource(R.string.browser_find_close))
            }
        }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.End) {
            Text(stringResource(R.string.browser_find_count, if (total > 0) active + 1 else 0, total),
                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f).padding(horizontal = 12.dp))
            IconButton(onClick = onPrevious, enabled = total > 0, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Filled.KeyboardArrowUp, stringResource(R.string.browser_find_previous))
            }
            IconButton(onClick = onNext, enabled = total > 0, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Filled.KeyboardArrowDown, stringResource(R.string.browser_find_next))
            }
        }
    }
}
