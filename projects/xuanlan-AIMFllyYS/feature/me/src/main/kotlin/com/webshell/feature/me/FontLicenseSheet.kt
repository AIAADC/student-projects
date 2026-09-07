package com.webshell.feature.me

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.components.AppSheet
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Licenses are bundled offline; read the small text resources off the UI thread. */
@Composable
internal fun FontLicenseSheet(onDismiss: () -> Unit) {
    val resources = LocalContext.current.resources
    val notices by produceState<String?>(null, resources) {
        value = withContext(Dispatchers.IO) {
            listOf(
                com.webshell.core.designsystem.R.raw.font_sources,
                com.webshell.core.designsystem.R.raw.noto_license,
            ).joinToString("\n\n") { id ->
                resources.openRawResource(id).bufferedReader().use { it.readText() }
            }
        }
    }
    AppSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().heightIn(max = 560.dp).padding(horizontal = 20.dp, vertical = 12.dp)) {
            Text(stringResource(R.string.me_font_licenses), style = MaterialTheme.typography.titleLarge)
            Text(
                notices ?: stringResource(R.string.me_log_loading),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(vertical = 16.dp),
            )
        }
    }
}
