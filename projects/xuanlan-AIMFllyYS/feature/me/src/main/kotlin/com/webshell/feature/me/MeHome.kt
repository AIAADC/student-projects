package com.webshell.feature.me

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.BatterySaver
import androidx.compose.material.icons.filled.DeveloperMode
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.NewReleases
import androidx.compose.material.icons.filled.Palette
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Public
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.components.AppListDivider
import com.webshell.core.designsystem.components.AppListRow
import com.webshell.core.designsystem.components.AppSettingsSection
import com.webshell.core.webengine.KeepAliveRegistry

@Composable
internal fun MeHome(
    state: MeUiState,
    onStopSession: (String) -> Unit,
    onOpenSection: (MeSection) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 16.dp),
    ) {
        item(key = "settings-header") {
            Text(stringResource(R.string.me_settings), style = MaterialTheme.typography.headlineLarge)
            Text(
                stringResource(R.string.me_settings_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp, bottom = 20.dp),
            )
        }
        item(key = "running-sessions") {
            AppSettingsSection(stringResource(R.string.me_sessions), Modifier.padding(bottom = 24.dp)) {
                val sessions = state.runningSessions
                if (sessions.isEmpty()) {
                    SessionEmptyRow()
                } else {
                    // 首页最多展示 3 条；更多时收敛为「全部会话」入口，避免挤占设置首页。
                    val visible = sessions.take(3)
                    val overflow = sessions.size - visible.size
                    visible.forEachIndexed { index, session ->
                        SessionRow(session = session, onStop = { onStopSession(session.sessionId) })
                        if (index < visible.lastIndex || overflow > 0) AppListDivider()
                    }
                    if (overflow > 0) {
                        AppListRow(
                            title = stringResource(R.string.me_sessions_all),
                            subtitle = stringResource(R.string.me_sessions_count, sessions.size),
                            leadingIcon = Icons.Filled.PlayCircle,
                            leadingIconBackground = Color(0xFF34C759),
                            onClick = { onOpenSection(MeSection.SESSIONS) },
                            trailing = { SettingsChevron() },
                        )
                    }
                }
            }
        }
        item(key = "display-settings") {
            AppSettingsSection(stringResource(R.string.me_display_section), Modifier.padding(bottom = 24.dp)) {
                SettingsMenuEntry(Icons.Filled.Palette, stringResource(R.string.me_appearance), Color(0xFFAF52DE)) { onOpenSection(MeSection.APPEARANCE) }
                AppListDivider()
                SettingsMenuEntry(Icons.Filled.GridView, stringResource(R.string.me_layout), Color(0xFF007AFF)) { onOpenSection(MeSection.LAYOUT) }
            }
        }
        item(key = "browser-settings") {
            AppSettingsSection(stringResource(R.string.me_browser_section), Modifier.padding(bottom = 24.dp)) {
                SettingsMenuEntry(Icons.Filled.BatterySaver, stringResource(R.string.me_background), Color(0xFF34C759)) { onOpenSection(MeSection.BACKGROUND) }
                AppListDivider()
                SettingsMenuEntry(Icons.Filled.Public, stringResource(R.string.me_engine), Color(0xFF007AFF)) { onOpenSection(MeSection.ENGINE) }
            }
        }
        item(key = "about-settings") {
            AppSettingsSection(stringResource(R.string.me_about_section)) {
                SettingsMenuEntry(Icons.Filled.NewReleases, stringResource(R.string.me_updates), Color(0xFF8E8E93)) { onOpenSection(MeSection.UPDATE_LOG) }
                AppListDivider()
                SettingsMenuEntry(Icons.Filled.DeveloperMode, stringResource(R.string.me_developer), Color(0xFF8E8E93)) { onOpenSection(MeSection.DEVELOPER) }
            }
        }
    }
}

@Composable
private fun SettingsMenuEntry(icon: ImageVector, title: String, color: Color, onClick: () -> Unit) {
    AppListRow(
        title = title,
        leadingIcon = icon,
        leadingIconBackground = color,
        onClick = onClick,
        trailing = { SettingsChevron() },
    )
}

@Composable
internal fun SessionRow(session: KeepAliveRegistry.Entry, onStop: () -> Unit) {
    AppListRow(
        title = session.title,
        subtitle = session.url,
        leadingIcon = Icons.Filled.PlayCircle,
        leadingIconBackground = Color(0xFF34C759),
        trailing = {
            TextButton(onClick = onStop) {
                Text(stringResource(R.string.me_session_end), color = MaterialTheme.colorScheme.error)
            }
        },
    )
}

@Composable
internal fun SessionEmptyRow() {
    AppListRow(
        title = stringResource(R.string.me_sessions_empty),
        subtitle = stringResource(R.string.me_sessions_empty_hint),
        leadingIcon = Icons.Filled.PlayCircle,
        leadingIconBackground = Color(0xFF34C759),
    )
}

@Composable
internal fun SettingsChevron() {
    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
}
