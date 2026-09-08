package com.webshell.feature.home

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.webshell.core.data.WebAppEntity
import com.webshell.core.designsystem.components.AppConfirmDialog
import com.webshell.core.designsystem.components.AppFormField
import kotlinx.coroutines.launch

@Composable
internal fun HomeRenameDialog(app: WebAppEntity, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var draft by rememberSaveable(app.id) { mutableStateOf(app.title) }
    AppConfirmDialog(
        title = stringResource(R.string.home_rename),
        text = "",
        confirmText = stringResource(R.string.home_confirm),
        dismissText = stringResource(R.string.home_cancel),
        onConfirm = { onConfirm(draft.trim()) },
        onDismiss = onDismiss,
        confirmEnabled = draft.isNotBlank(),
        content = {
            AppFormField(
                value = draft, onValueChange = { draft = it },
                label = stringResource(R.string.home_app_name),
                modifier = Modifier.fillMaxWidth(),
            )
        },
    )
}

/** Activity-result adapter only. Import I/O is owned by the injected repository behind the VM. */
@Composable
internal fun HomeIconEditRoute(
    app: WebAppEntity,
    cornerRadiusPercent: Int,
    onImportIcon: suspend (Uri) -> Result<String>,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var draft by rememberSaveable(app.id) { mutableStateOf(app.iconUrl.orEmpty()) }
    var importing by remember(app.id) { mutableStateOf(false) }
    var importFailed by rememberSaveable(app.id) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            scope.launch {
                importing = true
                importFailed = false
                try {
                    val result = onImportIcon(uri)
                    result.onSuccess { draft = it }
                    importFailed = result.isFailure
                } finally {
                    importing = false
                }
            }
        }
    }
    HomeIconEditDialog(
        app = app, cornerRadiusPercent = cornerRadiusPercent,
        draft = draft, importing = importing, importFailed = importFailed,
        onDraftChange = { draft = it; importFailed = false },
        onPickIcon = { launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
        onConfirm = { onConfirm(draft) }, onDismiss = onDismiss,
    )
}

/** Actual production alert is also the Playbook scene; it never creates a picker or touches disk. */
@Composable
internal fun HomeIconEditDialog(
    app: WebAppEntity,
    cornerRadiusPercent: Int,
    draft: String,
    importing: Boolean,
    importFailed: Boolean,
    onDraftChange: (String) -> Unit,
    onPickIcon: () -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AppConfirmDialog(
        title = stringResource(R.string.home_change_icon), text = "",
        confirmText = stringResource(R.string.home_save), dismissText = stringResource(R.string.home_cancel),
        onConfirm = onConfirm, onDismiss = onDismiss, confirmEnabled = !importing,
        content = {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                AppIcon(app.copy(iconUrl = draft.ifBlank { null }), size = 64.dp, cornerRadiusPercent = cornerRadiusPercent)
                Spacer(Modifier.height(16.dp))
                AppFormField(
                    value = draft, onValueChange = onDraftChange,
                    label = stringResource(R.string.home_icon_address),
                    placeholder = stringResource(R.string.home_icon_placeholder),
                    enabled = !importing,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false),
                )
                if (importFailed) {
                    Text(
                        stringResource(R.string.home_icon_import_failed), style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                TextButton(onClick = onPickIcon, enabled = !importing) {
                    Text(stringResource(if (importing) R.string.home_importing_icon else R.string.home_pick_icon))
                }
            }
        },
    )
}

@Composable
internal fun HomeDissolveDialog(cell: HomeCell, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AppConfirmDialog(
        title = stringResource(R.string.home_dissolve_folder_title),
        text = stringResource(R.string.home_dissolve_folder_message, cell.folderMembers.size),
        confirmText = stringResource(R.string.home_folder_dissolve),
        dismissText = stringResource(R.string.home_cancel),
        onConfirm = onConfirm, onDismiss = onDismiss,
    )
}

@Composable
internal fun HomeDeleteDialog(cell: HomeCell, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AppConfirmDialog(
        title = if (cell.isFolder) stringResource(R.string.home_delete_folder_title)
            else stringResource(R.string.home_delete_title, cell.app.title),
        text = if (cell.isFolder) stringResource(R.string.home_delete_folder_message, cell.folderMembers.size)
            else stringResource(R.string.home_delete_message),
        confirmText = stringResource(R.string.home_delete), dismissText = stringResource(R.string.home_cancel),
        onConfirm = onConfirm, onDismiss = onDismiss, destructive = true,
    )
}
