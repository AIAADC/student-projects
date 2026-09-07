package com.webshell.app.shell

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webshell.app.R
import com.webshell.core.designsystem.components.AppNavigationBar
import com.webshell.core.webengine.ShellListener
import com.webshell.core.webengine.compose.ShellWebViewHost
import com.webshell.feature.browser.WebSessionDialogs
import com.webshell.feature.browser.WebSessionEmptyState
import com.webshell.feature.browser.WebSessionStatusMessage
import com.webshell.feature.browser.rememberWebSessionRequests

/** Saved-site immersive launch. The configured app.id session is displayed, not a second random one. */
@Composable
fun ShellScreen(
    initialUrl: String,
    appId: String? = null,
    onLeave: () -> Unit,
    viewModel: SiteShellViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val config = (state as? SiteShellState.Ready)?.takeIf { it.request == (initialUrl to appId) }?.config
    val sessionId = config?.sessionId
    var message by remember { mutableStateOf<String?>(null) }
    val requests = rememberWebSessionRequests(
        sessionId = sessionId, visible = true,
        onNewWindow = viewModel::openWindow, onMessage = { message = it },
    )
    val navigationListener = remember(config?.sessionId) {
        config?.sessionId?.let(viewModel::listenerFor)
    }
    val listener = remember(requests.listener, navigationListener) {
        object : ShellListener by requests.listener {
            override fun onCanGoBackChanged(canGoBack: Boolean) {
                navigationListener?.onCanGoBackChanged(canGoBack)
            }
        }
    }
    LaunchedEffect(initialUrl, appId) { viewModel.open(initialUrl, appId) }
    DisposableEffect(viewModel) { onDispose { viewModel.cancelPendingOpen() } }
    LaunchedEffect(message) {
        if (message != null) { kotlinx.coroutines.delay(2500); message = null }
    }
    BackHandler { if (!viewModel.goBack()) onLeave() }

    Box(Modifier.fillMaxSize()) {
        when (state) {
            SiteShellState.Loading -> WebSessionEmptyState(
                title = stringResource(R.string.site_shell_opening),
                description = stringResource(R.string.site_shell_opening_hint),
                actionLabel = stringResource(R.string.site_shell_opening),
                onAction = {}, loading = true, modifier = Modifier.fillMaxSize(),
            )
            SiteShellState.Unavailable -> Column(Modifier.fillMaxSize()) {
                AppNavigationBar(stringResource(R.string.site_shell_unavailable), onBack = onLeave)
                WebSessionEmptyState(
                    title = stringResource(R.string.site_shell_unavailable),
                    description = stringResource(R.string.site_shell_unavailable_hint),
                    actionLabel = stringResource(R.string.site_shell_retry), onAction = viewModel::retryOpen,
                    modifier = Modifier.weight(1f),
                )
            }
            is SiteShellState.Ready -> if (config != null && sessionId != null) {
                ShellWebViewHost(
                    sessionId = sessionId, configFactory = { config }, listener = listener,
                    onReady = { viewModel.onReady(config) },
                )
            }
        }
        message?.let {
            WebSessionStatusMessage(it,
                Modifier.align(Alignment.BottomCenter).padding(horizontal = 16.dp, vertical = 24.dp))
        }
    }
    WebSessionDialogs(requests, onRetry = viewModel::reload, onLeave = onLeave)
}
