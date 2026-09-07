package com.webshell.feature.add

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.components.AppCard
import com.webshell.core.designsystem.components.AppFormField
import com.webshell.core.designsystem.components.AppListDivider
import com.webshell.core.designsystem.components.AppListRow
import com.webshell.core.designsystem.components.AppNavigationBar
import com.webshell.core.designsystem.components.AppPrimaryButton
import com.webshell.core.designsystem.components.AppSectionHeader
import com.webshell.core.designsystem.components.AppToggleRow
import com.webshell.core.designsystem.components.SiteIcon

/** Grouped editor is presentation-only: the route owns pickers and ViewModel owns imports/save. */
@Composable
internal fun AddEditorContent(
    state: AddUiState.Edit,
    onUpdate: ((AddDraft) -> AddDraft) -> Unit,
    onSave: () -> Unit,
    onBack: () -> Unit,
    onPickIcon: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val draft = state.draft
    val enabled = !state.isSaving && !state.isImportingIcon
    val saveEnabled = enabled && (draft.isLocal || AddUrl.normalize(draft.url) != null)
    Column(modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).imePadding()) {
        AppNavigationBar(
            title = stringResource(R.string.add_home_title),
            onBack = onBack,
            actions = {
                TextButton(onClick = onSave, enabled = saveEnabled) { Text(stringResource(R.string.add_save)) }
            },
        )
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth()
                .verticalScroll(rememberScrollState()).padding(horizontal = 20.dp),
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                SiteIcon(
                    title = draft.title,
                    iconUrl = draft.iconUrl,
                    size = 76.dp,
                    localFallback = draft.isLocal,
                )
                Text(
                    draft.title.ifBlank { stringResource(R.string.add_new_site) },
                    style = MaterialTheme.typography.titleMedium,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
            if (state.fetchFailed) {
                Text(
                    stringResource(R.string.add_fetch_failed),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 20.dp),
                )
            }
            AppSectionHeader(stringResource(R.string.add_info_section))
            AppCard(contentPadding = PaddingValues(0.dp)) {
                AppFormField(
                    label = stringResource(R.string.add_name), value = draft.title,
                    modifier = Modifier.padding(16.dp),
                    onValueChange = { value -> onUpdate { it.copy(title = value) } }, enabled = enabled,
                )
                AppListDivider(hasLeadingIcon = false)
                AppFormField(
                    label = stringResource(if (draft.isLocal) R.string.add_local_entry else R.string.add_address),
                    modifier = Modifier.padding(16.dp),
                    value = draft.url,
                    onValueChange = { value -> onUpdate { it.copy(url = value) } },
                    readOnly = draft.isLocal,
                    enabled = enabled,
                    isError = !draft.isLocal && AddUrl.normalize(draft.url) == null,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false),
                )
            }
            if (draft.isLocal) {
                Text(
                    stringResource(R.string.add_local_hint), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            } else if (AddUrl.normalize(draft.url) == null) {
                Text(
                    stringResource(R.string.add_address_error), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
            Spacer(Modifier.height(24.dp))
            AppSectionHeader(stringResource(R.string.add_icon_section))
            AppCard(contentPadding = PaddingValues(0.dp)) {
                AppListRow(
                    title = stringResource(
                        if (state.isImportingIcon) R.string.add_importing_icon
                        else if (draft.iconUrl.startsWith("/")) R.string.add_change_icon else R.string.add_choose_icon,
                    ),
                    leadingIcon = Icons.Filled.Image,
                    onClick = if (enabled) onPickIcon else null,
                    trailing = {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    },
                )
                AppListDivider(hasLeadingIcon = false)
                AppFormField(
                    label = stringResource(R.string.add_icon_address), value = draft.iconUrl,
                    modifier = Modifier.padding(16.dp),
                    onValueChange = { value -> onUpdate { it.copy(iconUrl = value) } },
                    placeholder = stringResource(R.string.add_icon_placeholder), enabled = enabled,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false),
                )
            }
            Spacer(Modifier.height(24.dp))
            AppSectionHeader(stringResource(R.string.add_browser_section))
            AppCard(contentPadding = PaddingValues(0.dp)) {
                AppToggleRow(
                    title = stringResource(R.string.add_desktop), subtitle = stringResource(R.string.add_desktop_hint),
                    checked = draft.desktopMode, enabled = enabled,
                    onCheckedChange = { value -> onUpdate { it.copy(desktopMode = value) } },
                )
                AppListDivider(hasLeadingIcon = false)
                AppToggleRow(
                    title = stringResource(R.string.add_dark), subtitle = stringResource(R.string.add_dark_hint),
                    checked = draft.darkMode, enabled = enabled,
                    onCheckedChange = { value -> onUpdate { it.copy(darkMode = value) } },
                )
                AppListDivider(hasLeadingIcon = false)
                AppToggleRow(
                    title = stringResource(R.string.add_keep_alive), subtitle = stringResource(R.string.add_keep_alive_hint),
                    checked = draft.keepAlive, enabled = enabled,
                    onCheckedChange = { value -> onUpdate { it.copy(keepAlive = value) } },
                )
                AppListDivider(hasLeadingIcon = false)
                AppToggleRow(
                    title = stringResource(R.string.add_external), subtitle = stringResource(R.string.add_external_hint),
                    checked = draft.externalLinksToBrowser, enabled = enabled,
                    onCheckedChange = { value -> onUpdate { it.copy(externalLinksToBrowser = value) } },
                )
            }
            AppPrimaryButton(
                text = stringResource(R.string.add_save_bottom), onClick = onSave,
                enabled = saveEnabled, loading = state.isSaving,
                modifier = Modifier.fillMaxWidth().padding(top = 24.dp),
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}
