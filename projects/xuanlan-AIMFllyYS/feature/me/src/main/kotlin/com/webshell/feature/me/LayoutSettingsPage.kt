package com.webshell.feature.me

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.RoundedCorner
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webshell.core.data.HomeSettings
import com.webshell.core.data.SCROLL_MODE_PAGER
import com.webshell.core.data.SCROLL_MODE_VERTICAL
import com.webshell.core.designsystem.components.AppListDivider
import com.webshell.core.designsystem.components.AppSelectionRow
import com.webshell.core.designsystem.components.AppSettingsSection
import com.webshell.core.designsystem.components.AppToggleRow
import com.webshell.core.designsystem.components.AppValueSlider

internal sealed interface LayoutSettingAction {
    data class Columns(val value: Int) : LayoutSettingAction
    data class Rows(val value: Int) : LayoutSettingAction
    data class ScrollMode(val value: String) : LayoutSettingAction
    data class AutoArrange(val value: Boolean) : LayoutSettingAction
    data class AllAppsEntry(val value: Boolean) : LayoutSettingAction
    data class IconSize(val value: Int) : LayoutSettingAction
    data class IconCorner(val value: Int) : LayoutSettingAction
    data class Labels(val value: Boolean) : LayoutSettingAction
    data class PageIndicator(val value: Boolean) : LayoutSettingAction
}

@Composable
internal fun LayoutSettingsPage(settings: HomeSettings, onAction: (LayoutSettingAction) -> Unit, onBack: () -> Unit) {
    DetailPage(stringResource(R.string.me_layout), onBack) { LayoutSettingsContent(settings, onAction) }
}

@Composable
internal fun LayoutSettingsContent(settings: HomeSettings, onAction: (LayoutSettingAction) -> Unit) {
    AppSettingsSection(stringResource(R.string.me_grid)) {
        AppValueSlider(stringResource(R.string.me_columns), settings.gridColumns, 3..6,
            onValue = { onAction(LayoutSettingAction.Columns(it)) }, leadingIcon = Icons.Filled.GridView)
        AppValueSlider(stringResource(R.string.me_rows), settings.gridRows, 4..7,
            onValue = { onAction(LayoutSettingAction.Rows(it)) }, leadingIcon = Icons.Filled.GridView)
    }
    Spacer(Modifier.height(16.dp))
    AppSettingsSection(stringResource(R.string.me_scroll)) {
        AppSelectionRow(
            stringResource(R.string.me_scroll_pager), settings.homeScrollMode == SCROLL_MODE_PAGER,
            onClick = { onAction(LayoutSettingAction.ScrollMode(SCROLL_MODE_PAGER)) },
            subtitle = stringResource(R.string.me_scroll_pager_hint),
        )
        AppListDivider(false)
        AppSelectionRow(
            stringResource(R.string.me_scroll_vertical), settings.homeScrollMode == SCROLL_MODE_VERTICAL,
            onClick = { onAction(LayoutSettingAction.ScrollMode(SCROLL_MODE_VERTICAL)) },
            subtitle = stringResource(R.string.me_scroll_vertical_hint),
        )
    }
    Spacer(Modifier.height(16.dp))
    AppSettingsSection(stringResource(R.string.me_arrangement)) {
        AppToggleRow(
            title = stringResource(R.string.me_auto_arrange),
            checked = settings.autoArrangeHome,
            onCheckedChange = { onAction(LayoutSettingAction.AutoArrange(it)) },
            subtitle = stringResource(if (settings.autoArrangeHome) R.string.me_auto_arrange_on else R.string.me_auto_arrange_off),
        )
        AppListDivider(false)
        AppToggleRow(
            title = stringResource(R.string.me_all_apps_entry),
            checked = settings.allAppsEntryVisible,
            onCheckedChange = { onAction(LayoutSettingAction.AllAppsEntry(it)) },
            subtitle = stringResource(R.string.me_all_apps_entry_hint),
        )
    }
    Spacer(Modifier.height(16.dp))
    AppSettingsSection(stringResource(R.string.me_icons)) {
        AppValueSlider(stringResource(R.string.me_icon_size), settings.iconSizeDp, 44..72,
            onValue = { onAction(LayoutSettingAction.IconSize(it)) }, leadingIcon = Icons.Filled.Apps, suffix = " dp")
        AppValueSlider(stringResource(R.string.me_icon_corner), settings.iconCornerRadiusPercent, 0..50,
            onValue = { onAction(LayoutSettingAction.IconCorner(it)) }, leadingIcon = Icons.Filled.RoundedCorner, suffix = "%")
        AppToggleRow(stringResource(R.string.me_show_labels), settings.showLabels,
            onCheckedChange = { onAction(LayoutSettingAction.Labels(it)) })
        AppListDivider(false)
        AppToggleRow(stringResource(R.string.me_show_indicator), settings.showPageIndicator,
            onCheckedChange = { onAction(LayoutSettingAction.PageIndicator(it)) })
    }
    Spacer(Modifier.height(24.dp))
}
