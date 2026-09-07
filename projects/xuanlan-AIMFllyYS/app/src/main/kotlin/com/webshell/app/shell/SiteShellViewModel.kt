package com.webshell.app.shell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webshell.core.data.WebAppLookupRepository
import com.webshell.core.webengine.ShellConfig
import com.webshell.core.webengine.ShellListener
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface SiteShellState {
    data object Loading : SiteShellState
    data object Unavailable : SiteShellState
    data class Ready(
        val config: ShellConfig,
        val request: Pair<String, String?>,
        val canGoBack: Boolean = false,
    ) : SiteShellState
}

/** One launch resolver; the screen never reads a DAO or manipulates a native WebView. */
@HiltViewModel
class SiteShellViewModel @Inject constructor(
    private val lookup: WebAppLookupRepository,
    private val sessions: ShellSessionController,
) : ViewModel() {
    private val _state = MutableStateFlow<SiteShellState>(SiteShellState.Loading)
    val state: StateFlow<SiteShellState> = _state.asStateFlow()
    private var openJob: Job? = null
    private var latestRequest: Pair<String, String?>? = null

    fun open(initialUrl: String, appId: String?, force: Boolean = false) {
        val request = initialUrl to appId
        if (!force && request == latestRequest && _state.value is SiteShellState.Ready) return
        latestRequest = request
        openJob?.cancel()
        _state.value = SiteShellState.Loading
        openJob = viewModelScope.launch {
            try {
                val app = if (appId != null) lookup.getById(appId) else lookup.findByUrl(initialUrl)
                if (appId != null && app == null) {
                    _state.value = SiteShellState.Unavailable
                    return@launch
                }
                val config = if (app != null) sessions.openSession(app) else sessions.openDirectSession(initialUrl)
                _state.value = SiteShellState.Ready(config, request)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                _state.value = SiteShellState.Unavailable
            }
        }
    }

    fun retryOpen() { latestRequest?.let { open(it.first, it.second, force = true) } }
    fun cancelPendingOpen() { openJob?.cancel() }

    fun onReady(config: ShellConfig) {
        val ready = _state.value as? SiteShellState.Ready ?: return
        if (ready.config.sessionId != config.sessionId) return
        _state.value = ready.copy(canGoBack = sessions.ensureLoaded(config))
    }

    fun listenerFor(sessionId: String): ShellListener = object : ShellListener {
        override fun onCanGoBackChanged(canGoBack: Boolean) {
            val ready = _state.value as? SiteShellState.Ready ?: return
            if (ready.config.sessionId == sessionId) _state.value = ready.copy(canGoBack = canGoBack)
        }
    }

    fun goBack(): Boolean = (_state.value as? SiteShellState.Ready)?.config?.sessionId
        ?.let(sessions::goBack) == true

    fun reload() { (_state.value as? SiteShellState.Ready)?.config?.sessionId?.let(sessions::reload) }
    fun openWindow(url: String) {
        (_state.value as? SiteShellState.Ready)?.config?.let { sessions.openWindow(it, url) }
    }
}
