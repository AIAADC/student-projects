package com.webshell.feature.me

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webshell.core.data.HomeSettings
import com.webshell.core.designsystem.components.AppListDivider
import com.webshell.core.designsystem.components.AppNavigationBar
import com.webshell.core.designsystem.components.AppPrimaryButton
import com.webshell.core.designsystem.components.AppSelectionRow
import com.webshell.core.designsystem.components.AppSettingsSection
import com.webshell.core.designsystem.components.AppValueStepper
import com.webshell.core.designsystem.theme.AppTypographyPreview
import com.webshell.core.model.AppFontFamily
import com.webshell.core.model.AppFontScale

@Composable
internal fun FontSettingsPage(
    settings: HomeSettings,
    saving: Boolean,
    failed: Boolean,
    onApply: (String, Int) -> Unit,
    onBack: () -> Unit,
) {
    var family by rememberSaveable(settings.appFontFamily) { mutableStateOf(settings.appFontFamily) }
    var scale by rememberSaveable(settings.appFontScalePercent) { mutableIntStateOf(settings.appFontScalePercent) }
    var showLicenses by rememberSaveable { mutableStateOf(false) }
    // Persist only on Apply. Back or system navigation discards this page's draft.
    BackHandler(enabled = saving) {}
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        AppNavigationBar(stringResource(R.string.me_fonts), onBack = if (saving) null else onBack)
        Column(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp)) {
            FontSettingsContent(
                family = family, scale = scale,
                onFamily = { if (!saving) family = it },
                onScale = { if (!saving) scale = it },
            )
            TextButton(onClick = { family = AppFontFamily.MISANS; scale = AppFontScale.DEFAULT }, enabled = !saving) {
                Text(stringResource(R.string.me_font_reset))
            }
            TextButton(onClick = { showLicenses = true }) { Text(stringResource(R.string.me_font_licenses)) }
            if (failed) Text(stringResource(R.string.me_font_save_failed), color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 8.dp))
            AppPrimaryButton(
                text = stringResource(R.string.me_font_apply),
                onClick = { onApply(family, scale) },
                modifier = Modifier.fillMaxWidth(),
                loading = saving,
            )
            Spacer(Modifier.height(24.dp))
        }
    }
    if (showLicenses) FontLicenseSheet(onDismiss = { showLicenses = false })
}

/** Shared with Playbook. Only isolated font preview changes before confirmation. */
@Composable
internal fun FontSettingsContent(family: String, scale: Int, onFamily: (String) -> Unit, onScale: (Int) -> Unit) {
    AppSettingsSection(stringResource(R.string.me_font_family)) {
        AppFontFamily.all.forEachIndexed { index, id ->
            AppTypographyPreview(id, 100) {
                AppSelectionRow(
                    title = appFontName(id),
                    selected = family == id,
                    onClick = { onFamily(id) },
                    subtitle = stringResource(R.string.me_font_specimen),
                )
            }
            if (index < AppFontFamily.all.lastIndex) AppListDivider(false)
        }
    }
    Spacer(Modifier.height(16.dp))
    AppSettingsSection(stringResource(R.string.me_font_size), contentPadding = PaddingValues(16.dp)) {
        AppValueStepper(scale, AppFontScale.MIN..AppFontScale.MAX, AppFontScale.STEP,
            stringResource(R.string.me_font_size), onScale, suffix = "%")
        Text(stringResource(R.string.me_font_size_hint), style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    Spacer(Modifier.height(16.dp))
    AppSettingsSection(stringResource(R.string.me_font_preview), contentPadding = PaddingValues(16.dp)) {
        AppTypographyPreview(family, scale) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.me_font_preview_title), style = MaterialTheme.typography.headlineLarge)
                Text(stringResource(R.string.me_font_preview_body), style = MaterialTheme.typography.bodyLarge)
                Text(stringResource(R.string.me_font_preview_caption), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
internal fun appFontName(id: String): String = stringResource(when (AppFontFamily.normalize(id)) {
    AppFontFamily.SYSTEM -> R.string.me_font_system
    AppFontFamily.NOTO_SANS_SC -> R.string.me_font_noto
    else -> R.string.me_font_misans
})
