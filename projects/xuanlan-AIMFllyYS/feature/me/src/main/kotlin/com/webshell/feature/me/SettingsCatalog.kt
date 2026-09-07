package com.webshell.feature.me

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.res.stringResource
import com.webshell.core.data.HomeSettings
import com.webshell.core.data.LogEntity
import com.webshell.core.designsystem.catalog.CatalogCategory
import com.webshell.core.designsystem.catalog.CatalogEntry
import com.webshell.core.designsystem.catalog.CatalogLayout
import com.webshell.core.model.AppFontFamily
import com.webshell.core.webengine.KeepAliveRegistry
import com.webshell.core.webengine.WebViewCapabilities

fun settingsCatalog(): List<CatalogEntry> = listOf(
    CatalogEntry("settings.sessions", CatalogCategory.CONTENT, R.string.me_sessions, R.string.me_catalog_settings_hint, layout = CatalogLayout.ScrollContent) {
        SessionsContent(
            sessions = listOf(
                KeepAliveRegistry.Entry("catalog-1", "GitHub", "https://github.com", since = 0L),
                KeepAliveRegistry.Entry("catalog-2", "Wikipedia", "https://wikipedia.org", since = 0L),
            ),
            onStopSession = {},
        )
    },
    CatalogEntry("settings.background", CatalogCategory.CONTENT, R.string.me_background, R.string.me_catalog_settings_hint, layout = CatalogLayout.ScrollContent) {
        var keepAlive by remember { mutableStateOf(true) }
        BackgroundSettingsContent(false, false, keepAlive, stringResource(R.string.me_keep_alive_service_hint),
            { keepAlive = it }, {}, {})
    },
    CatalogEntry("settings.engine", CatalogCategory.CONTENT, R.string.me_engine, R.string.me_catalog_settings_hint, layout = CatalogLayout.ScrollContent) {
        var autoCollapse by remember { mutableStateOf(true) }
        EngineInfoContent(WebViewCapabilities.Snapshot("Playbook", false, true, false), autoCollapse, { autoCollapse = it })
    },
    CatalogEntry("settings.appearance", CatalogCategory.CONTENT, R.string.me_appearance, R.string.me_catalog_settings_hint, layout = CatalogLayout.ScrollContent) {
        var settings by remember { mutableStateOf(HomeSettings()) }
        AppearanceSettingsContent(settings,
            onThemeMode = { settings = settings.copy(themeMode = it) },
            onTransitionStyle = { settings = settings.copy(transitionStyle = it) },
            onPickWallpaper = {}, onOpenFonts = {})
    },
    CatalogEntry("settings.layout", CatalogCategory.CONTENT, R.string.me_layout, R.string.me_catalog_settings_hint, layout = CatalogLayout.ScrollContent) {
        var settings by remember { mutableStateOf(HomeSettings()) }
        LayoutSettingsContent(settings) { action ->
            settings = when (action) {
                is LayoutSettingAction.Columns -> settings.copy(gridColumns = action.value)
                is LayoutSettingAction.Rows -> settings.copy(gridRows = action.value)
                is LayoutSettingAction.ScrollMode -> settings.copy(homeScrollMode = action.value)
                is LayoutSettingAction.AutoArrange -> settings.copy(autoArrangeHome = action.value)
                is LayoutSettingAction.AllAppsEntry -> settings.copy(allAppsEntryVisible = action.value)
                is LayoutSettingAction.IconSize -> settings.copy(iconSizeDp = action.value)
                is LayoutSettingAction.IconCorner -> settings.copy(iconCornerRadiusPercent = action.value)
                is LayoutSettingAction.Labels -> settings.copy(showLabels = action.value)
                is LayoutSettingAction.PageIndicator -> settings.copy(showPageIndicator = action.value)
            }
        }
    },
    CatalogEntry("settings.fonts", CatalogCategory.FORMS, R.string.me_catalog_font_title, R.string.me_catalog_font_hint, layout = CatalogLayout.ScrollContent) {
        var family by remember { mutableStateOf(AppFontFamily.MISANS) }
        var scale by remember { mutableIntStateOf(100) }
        FontSettingsContent(family, scale, { family = it }, { scale = it })
    },
    CatalogEntry("settings.developer", CatalogCategory.DEVELOPER, R.string.me_catalog_dev_title, R.string.me_catalog_dev_hint, layout = CatalogLayout.ScrollContent) {
        DeveloperHomeContent(
            state = DeveloperUiState("0.1.16 (17)", "WebView", "Android 35", "Playbook"),
            onOpenPlaybook = {}, onOpenLogs = {}, onClearCache = {},
        )
    },
    CatalogEntry("settings.logs", CatalogCategory.DEVELOPER, R.string.me_catalog_logs_title, R.string.me_catalog_logs_hint, layout = CatalogLayout.ScrollContent) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            LogRow(LogEntity(id = 1, timeMillis = 0, tag = "ui", level = "INFO", message = stringResource(R.string.me_catalog_log_info)))
            LogRow(LogEntity(id = 2, timeMillis = 0, tag = "verification", level = "ERROR", message = stringResource(R.string.me_catalog_log_error)))
        }
        Spacer(Modifier.height(8.dp))
    },
)
