package com.webshell.feature.me

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DeleteSweep
import androidx.compose.material.icons.filled.DeveloperMode
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material.icons.filled.Terminal
import androidx.compose.material.icons.filled.Web
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webshell.core.designsystem.components.AppListDivider
import com.webshell.core.designsystem.components.AppListRow
import com.webshell.core.designsystem.components.AppSettingsSection
import com.webshell.core.designsystem.theme.AppMotion
import com.webshell.core.designsystem.theme.LocalTransitionStyle

/** App owns the Playbook route; this feature owns only settings and logs. */
@Composable
internal fun DeveloperCenterPage(
    onBack: () -> Unit,
    onOpenPlaybook: () -> Unit,
    viewModel: DeveloperCenterViewModel = hiltViewModel(),
) {
    var showLogs by rememberSaveable { mutableStateOf(false) }
    val state by viewModel.state.collectAsStateWithLifecycle()
    BackHandler(enabled = showLogs) { showLogs = false }
    val transitionStyle = LocalTransitionStyle.current
    AnimatedContent(
        targetState = showLogs,
        transitionSpec = { AppMotion.detailEnterFor(transitionStyle) togetherWith AppMotion.detailExitFor(transitionStyle) },
        label = "developer-sub",
    ) { logs ->
        if (logs) LogViewerPage(onBack = { showLogs = false })
        else DetailPage(stringResource(R.string.me_developer), onBack) {
            DeveloperHomeContent(state, onOpenPlaybook, { showLogs = true }, viewModel::clearIconCache)
        }
    }
}

@Composable
internal fun DeveloperHomeContent(
    state: DeveloperUiState,
    onOpenPlaybook: () -> Unit,
    onOpenLogs: () -> Unit,
    onClearCache: () -> Unit,
) {
    AppSettingsSection(stringResource(R.string.me_dev_design)) {
        AppListRow(
            title = stringResource(R.string.me_dev_playbook),
            subtitle = stringResource(R.string.me_dev_playbook_hint),
            leadingIcon = Icons.Filled.DeveloperMode,
            onClick = onOpenPlaybook,
            trailing = { SettingsChevron() },
        )
    }
    Spacer(Modifier.height(24.dp))
    AppSettingsSection(stringResource(R.string.me_dev_app_info)) {
        AppListRow(stringResource(R.string.me_dev_version), subtitle = state.version, leadingIcon = Icons.Filled.Info)
        AppListDivider()
        AppListRow(stringResource(R.string.me_engine), subtitle = state.webViewVersion, leadingIcon = Icons.Filled.Web)
        AppListDivider()
        AppListRow(stringResource(R.string.me_dev_api), subtitle = state.apiLevel, leadingIcon = Icons.Filled.Terminal)
        AppListDivider()
        AppListRow(stringResource(R.string.me_dev_device), subtitle = state.device, leadingIcon = Icons.Filled.Smartphone)
    }
    Spacer(Modifier.height(24.dp))
    AppSettingsSection(stringResource(R.string.me_dev_debug)) {
        AppListRow(
            title = stringResource(R.string.me_dev_view_logs),
            subtitle = stringResource(R.string.me_dev_logs_hint),
            leadingIcon = Icons.Filled.ReceiptLong,
            onClick = onOpenLogs,
            trailing = { SettingsChevron() },
        )
        AppListDivider()
        AppListRow(
            title = stringResource(R.string.me_dev_clear_cache),
            subtitle = stringResource(when (state.cacheState) {
                CacheClearState.Idle -> R.string.me_dev_clear_cache_hint
                CacheClearState.Clearing -> R.string.me_dev_cache_clearing
                CacheClearState.Cleared -> R.string.me_dev_cache_cleared
                CacheClearState.Failed -> R.string.me_dev_cache_failed
            }),
            leadingIcon = Icons.Filled.DeleteSweep,
            onClick = onClearCache.takeIf { state.cacheState != CacheClearState.Clearing },
        )
    }
    Spacer(Modifier.height(32.dp))
}
