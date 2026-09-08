package com.webshell.app.catalog

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webshell.app.R
import com.webshell.app.ui.BrowserDockHost
import com.webshell.app.ui.BrowserHostPreferences
import com.webshell.app.ui.DockItems
import com.webshell.app.ui.HomeDockHeight
import com.webshell.app.ui.MainTab
import com.webshell.app.ui.TabBarHeight
import com.webshell.app.ui.measuredDockHeight
import com.webshell.core.designsystem.catalog.CatalogCategory
import com.webshell.core.designsystem.catalog.CatalogEntry
import com.webshell.core.designsystem.components.AppPrimaryButton
import com.webshell.core.designsystem.components.staticGlassSurface
import com.webshell.feature.browser.BrowserChromeEvent
import com.webshell.feature.browser.rememberBrowserChromeController

internal fun appCatalog() = listOf(
    CatalogEntry("app.dock", CatalogCategory.NAVIGATION, R.string.catalog_dock, R.string.catalog_dock_description) { DockSample() },
    CatalogEntry("app.browser-dock", CatalogCategory.BROWSER, R.string.catalog_browser_dock, R.string.catalog_browser_dock_description) { BrowserDockSample() },
)

@Composable
private fun DockSample() {
    var tab by remember { mutableStateOf(MainTab.HOME) }
    Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.Center) {
        DockItems(tab, { tab = it }, Modifier.fillMaxWidth()
            .height(measuredDockHeight(tab))
            .staticGlassSurface())
    }
}

@Composable
private fun BrowserDockSample() {
    val controller = rememberBrowserChromeController()
    var preferences by remember { mutableStateOf(BrowserHostPreferences()) }
    Box(Modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(
            listOf(Color(0xFFC9E7F3), Color(0xFFD7D2EF)))))
        Column(Modifier.padding(16.dp)) {
            AppPrimaryButton(stringResource(R.string.catalog_collapse), { controller.dispatch(BrowserChromeEvent.Collapse) })
        }
        // Static-glass dock: the gradient backdrop needs no live blur source on this route.
        BrowserDockHost(controller, preferences,
            onSelect = { controller.dispatch(BrowserChromeEvent.Reveal) },
            onAnchorChanged = { x, y -> preferences = preferences.copy(orbX = x, orbY = y) })
    }
}
