package com.webshell.app.ui

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webshell.app.catalog.PlaybookScreen
import com.webshell.app.shell.ShellScreen
import com.webshell.core.designsystem.theme.AppMotion
import com.webshell.core.designsystem.theme.LocalIsDarkTheme
import com.webshell.feature.add.AddScreen
import com.webshell.feature.browser.BrowserScreen
import com.webshell.feature.browser.rememberBrowserChromeController
import com.webshell.feature.browser.BrowserChromeEvent
import com.webshell.feature.home.HomeScreen
import com.webshell.feature.me.MeScreen
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource

/** App shell owns insets, the full-bleed backdrop and the only live glass surface. */
@Composable
fun MainScaffold(
    launchUrl: String? = null,
    viewModel: MainScaffoldViewModel = hiltViewModel(),
) {
    var selectedTab by rememberSaveable { mutableStateOf(MainTab.HOME) }
    var openedUrl by rememberSaveable { mutableStateOf(launchUrl) }
    var openedAppId by rememberSaveable { mutableStateOf<String?>(null) }
    var playbookOpen by rememberSaveable { mutableStateOf(false) }
    val browserChrome = rememberBrowserChromeController()
    val browserPreferences by viewModel.browserPreferences.collectAsStateWithLifecycle()
    // Keep tab drafts/scroll anchors alive while a website temporarily owns the whole screen.
    val stateHolder = rememberSaveableStateHolder()
    val homeVisible = selectedTab == MainTab.HOME && openedUrl == null && !playbookOpen
    SystemBarAppearance(lightIcons = homeVisible || LocalIsDarkTheme.current)

    if (playbookOpen) {
        PlaybookScreen(onBack = { playbookOpen = false })
        return
    }
    openedUrl?.let { url ->
        val leave = { openedUrl = null; openedAppId = null }
        BackHandler { leave() }
        ShellScreen(initialUrl = url, appId = openedAppId, onLeave = leave)
        return
    }
    BackHandler(enabled = selectedTab != MainTab.HOME) { selectedTab = MainTab.HOME }

    val hazeState = remember { HazeState() }
    val safeInsets = WindowInsets.safeDrawing.asPaddingValues()

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Box(Modifier.fillMaxSize().hazeSource(state = hazeState)) {
            Crossfade(
                targetState = selectedTab,
                animationSpec = tween(AppMotion.NormalMs),
                label = "main-tab",
                modifier = Modifier.fillMaxSize(),
            ) { tab ->
                // Background and viewport follow this transition branch, not the target tab.
                // The outgoing desktop therefore keeps both its wallpaper and fixed grid bounds.
                val bottomClearance = when (tab) {
                    MainTab.HOME -> HomeDockHeight + 20.dp
                    MainTab.BROWSE -> 0.dp // Browser Dock is a sibling overlay, never a viewport reservation.
                    else -> measuredDockHeight(tab) + 20.dp
                }
                Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
                    if (tab == MainTab.HOME) LauncherBackdrop(Modifier.fillMaxSize())
                    Box(
                        Modifier.fillMaxSize().padding(
                            start = safeInsets.calculateLeftPadding(androidx.compose.ui.unit.LayoutDirection.Ltr),
                            end = safeInsets.calculateRightPadding(androidx.compose.ui.unit.LayoutDirection.Ltr),
                            top = safeInsets.calculateTopPadding(),
                            bottom = safeInsets.calculateBottomPadding() + bottomClearance,
                        ).consumeWindowInsets(safeInsets),
                    ) {
                        stateHolder.SaveableStateProvider(tab.name) {
                            when (tab) {
                                MainTab.HOME -> HomeScreen(
                                    wallpaperBacked = true,
                                    onLaunch = { appId, _ -> viewModel.launchApp(appId) { url, id -> openedAppId = id; openedUrl = url } },
                                    onAddRequested = { selectedTab = MainTab.ADD },
                                )
                                MainTab.ADD -> AddScreen(onCreated = { selectedTab = MainTab.HOME })
                                MainTab.BROWSE -> BrowserScreen(
                                    chrome = browserChrome,
                                    isVisible = selectedTab == MainTab.BROWSE,
                                    autoCollapse = browserPreferences.autoCollapse,
                                )
                                MainTab.ME -> MeScreen(
                                    onKeepAliveServiceChanged = viewModel::setKeepAliveServiceEnabled,
                                    onOpenPlaybook = { playbookOpen = true },
                                )
                            }
                        }
                    }
                }
            }
        }
        if (selectedTab == MainTab.BROWSE) BrowserDockHost(
            chrome = browserChrome, preferences = browserPreferences,
            onSelect = { selectedTab = it; if (it == MainTab.BROWSE) browserChrome.dispatch(BrowserChromeEvent.Reveal) },
            onAnchorChanged = viewModel::setBrowserOrbPosition,
        ) else LauncherDock(
            selectedTab = selectedTab,
            onSelect = { selectedTab = it },
            hazeState = hazeState,
            modifier = Modifier.align(Alignment.BottomCenter),
        )
    }
}

/** Real Android bars use the active surface contrast, not the device's theme. */
@Composable
private fun SystemBarAppearance(lightIcons: Boolean) {
    val view = LocalView.current
    DisposableEffect(view, lightIcons) {
        val window = (view.context as? Activity)?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        val previousStatus = controller?.isAppearanceLightStatusBars
        val previousNavigation = controller?.isAppearanceLightNavigationBars
        controller?.isAppearanceLightStatusBars = !lightIcons
        controller?.isAppearanceLightNavigationBars = !lightIcons
        onDispose {
            previousStatus?.let { controller?.isAppearanceLightStatusBars = it }
            previousNavigation?.let { controller?.isAppearanceLightNavigationBars = it }
        }
    }
}
