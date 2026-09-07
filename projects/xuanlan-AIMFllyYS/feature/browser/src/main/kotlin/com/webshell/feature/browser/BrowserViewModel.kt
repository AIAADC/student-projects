package com.webshell.feature.browser

import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webshell.core.data.BrowserSavedPagesRepository
import com.webshell.core.model.AppLog
import com.webshell.core.webengine.ShellListener
import com.webshell.core.webengine.WebViewPool
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * 多标签浏览器状态中枢：
 * - 标签列表 / 激活标签：切 tab 只换 activeTabId，池保证会话（JS/网络/返回栈）不丢；
 * - 收藏 / 历史：Room 持久化；
 * - 桌面模式：按会话记忆，切换即对池中会话生效并 reload。
 */
@HiltViewModel
class BrowserViewModel @Inject constructor(
    private val savedPages: BrowserSavedPagesRepository,
) : ViewModel() {

    private val _tabs = MutableStateFlow<List<BrowserTab>>(emptyList())
    val tabs: StateFlow<List<BrowserTab>> = _tabs.asStateFlow()

    private val _activeTabId = MutableStateFlow<String?>(null)
    val activeTabId: StateFlow<String?> = _activeTabId.asStateFlow()

    private val _findState = MutableStateFlow(FindState())
    val findState: StateFlow<FindState> = _findState.asStateFlow()

    /** 已收藏 URL 集合（工具栏星标点亮依据） */
    private val _bookmarkedUrls = MutableStateFlow<Set<String>>(emptySet())
    val bookmarkedUrls: StateFlow<Set<String>> = _bookmarkedUrls.asStateFlow()

    /** 收藏列表（收藏夹面板） */
    val bookmarks: StateFlow<List<BrowserSavedPage>> = savedPages.observeBookmarks()
        .map { entries -> entries.map { BrowserSavedPage(it.id, it.title, it.url) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** 历史列表（最近 100 条，同 URL 合并为最新一条） */
    val history: StateFlow<List<BrowserSavedPage>> = savedPages.observeHistory()
        .map { entries -> entries.map { BrowserSavedPage(it.id, it.title, it.url) } }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** sessionId → 桌面模式（会话级记忆） */
    private val _desktopModes = MutableStateFlow<Map<String, Boolean>>(emptyMap())
    val desktopModes: StateFlow<Map<String, Boolean>> = _desktopModes.asStateFlow()

    /**
     * sessionId → 持久会话监听者（随会话存活，不随 Compose 组合摘除）。
     * 所有状态写回类回调（标题/URL/进度/返回栈）按自己的 tabId 写入 per-tab 状态，
     * 不依赖"当前激活 tab"——后台 tab 的回调不再丢失、不再串台。
     */
    private val sessionListeners = mutableMapOf<String, ShellListener>()
    private var browserVisible = false
    private val evictionListener: (String) -> Unit = { sessionId ->
        if (sessionId.startsWith("browser-")) removeTabState(sessionId.removePrefix("browser-"))
    }

    init {
        viewModelScope.launch {
            savedPages.observeBookmarks().collect { list ->
                _bookmarkedUrls.value = list.map { it.url }.toSet()
            }
        }
        // 池满淘汰时同步移除对应 tab（实例已被池销毁并留存快照，这里不重复 destroy）
        WebViewPool.onSessionEvicted = evictionListener
    }

    override fun onCleared() {
        if (WebViewPool.onSessionEvicted === evictionListener) WebViewPool.onSessionEvicted = null
        sessionListeners.forEach { (sessionId, listener) ->
            WebViewPool.get(sessionId)?.let { if (it.sessionListener === listener) it.sessionListener = null }
        }
        sessionListeners.clear()
        setVisible(false)
        super.onCleared()
    }

    /** 取（或建）指定会话的持久监听者；由 BrowserScreen 挂到 ShellWebView.sessionListener */
    fun listenerFor(sessionId: String): ShellListener =
        sessionListeners.getOrPut(sessionId) {
            val tabId = sessionId.removePrefix("browser-")
            object : ShellListener {
                override fun onPageStarted(url: String) {
                    updateTabMeta(tabId, url = url)
                    updateTabNav(tabId, progress = 0, loading = true)
                }

                override fun onProgress(progress: Int) {
                    updateTabNav(tabId, progress = progress, loading = progress < 100)
                }

                override fun onTitleReceived(title: String) {
                    updateTabMeta(tabId, title = title)
                }

                override fun onPageFinished(url: String) {
                    updateTabNav(tabId, progress = 100, loading = false)
                    // 入历史（同 URL 合并为最新一条），标题取该 tab 自己的最新值
                    val title = _tabs.value.firstOrNull { it.tabId == tabId }?.title.orEmpty()
                    recordHistory(url, title)
                }

                override fun onCanGoBackChanged(canGoBack: Boolean) {
                    updateTabNav(tabId, canGoBack = canGoBack)
                }

                override fun onCanGoForwardChanged(canGoForward: Boolean) {
                    updateTabNav(tabId, canGoForward = canGoForward)
                }
            }
        }

    /** 打开新标签；activate=false 时留在后台（供 target=_blank 备用） */
    fun createTab(startUrl: String, activate: Boolean): String {
        val tabId = UUID.randomUUID().toString().take(8)
        _tabs.value = _tabs.value + BrowserTab(
            tabId = tabId,
            title = if (startUrl == "about:blank") "" else startUrl,
            url = startUrl,
        )
        AppLog.log("browser", "新建标签 $tabId（共 ${_tabs.value.size} 个）")
        if (activate) setActive(tabId)
        return tabId
    }

    fun activateTab(tabId: String) {
        if (_tabs.value.any { it.tabId == tabId }) {
            AppLog.log("browser", "切换标签 $tabId")
            setActive(tabId)
        }
    }

    /** 激活 tab 切换的唯一出口：同步池的激活保护（激活会话不被淘汰） */
    private fun setActive(tabId: String?) {
        val previous = _activeTabId.value
        if (previous != tabId) {
            previous?.let { WebViewPool.suspendSession("browser-$it") }
            _findState.value = FindState()
        }
        _activeTabId.value = tabId
        if (browserVisible) WebViewPool.activeSessionId = tabId?.let { "browser-$it" }
    }

    fun setVisible(visible: Boolean) {
        browserVisible = visible
        val sid = activeSessionId() ?: return
        if (visible) {
            WebViewPool.activeSessionId = sid
        } else if (WebViewPool.activeSessionId == sid) {
            WebViewPool.activeSessionId = null
        }
    }

    /** Invoked after the lifecycle host has installed the persistent per-session listener. */
    fun onHostReady(sessionId: String) {
        val shell = WebViewPool.get(sessionId) ?: return
        val tabId = sessionId.removePrefix("browser-")
        val tab = _tabs.value.firstOrNull { it.tabId == tabId } ?: return
        val currentUrl = shell.currentUrl()
        if ((currentUrl == null || currentUrl == "about:blank") && tab.url.isNotBlank() && tab.url != "about:blank") {
            shell.loadWithStateRestore(tab.url)
        } else if (currentUrl != null && currentUrl != "about:blank") {
            updateTabMeta(tabId, url = currentUrl)
        }
        updateTabNav(tabId, canGoBack = shell.canGoBack(), canGoForward = shell.canGoForward())
    }

    fun captureActiveThumbnail() {
        val tabId = _activeTabId.value ?: return
        runCatching { WebViewPool.get("browser-$tabId")?.captureThumbnail() }
            .getOrNull()?.let { updateTabThumbnail(tabId, it) }
    }

    fun openUrl(url: String) {
        if (url.isBlank()) return
        val shell = activeSessionId()?.let { WebViewPool.get(it) }
        if (shell != null) shell.loadWithStateRestore(url) else createTab(url, activate = true)
    }

    fun goBack() { activeSessionId()?.let { WebViewPool.get(it)?.goBack() } }
    fun goForward() { activeSessionId()?.let { WebViewPool.get(it)?.goForward() } }
    fun refreshOrStop(loading: Boolean) {
        activeSessionId()?.let { WebViewPool.get(it) }?.let { if (loading) it.stopLoading() else it.reload() }
    }

    /** 切走前由 Screen 先截缩略图，再调这里更新卡片 */
    fun updateTabThumbnail(tabId: String, thumbnail: Bitmap?) {
        if (thumbnail == null) return
        _tabs.value = _tabs.value.map {
            if (it.tabId == tabId) it.copy(thumbnail = thumbnail) else it
        }
    }

    fun updateTabMeta(tabId: String, title: String? = null, url: String? = null) {
        _tabs.value = _tabs.value.map { tab ->
            if (tab.tabId == tabId) {
                tab.copy(
                    title = title?.takeIf { it.isNotBlank() } ?: tab.title,
                    url = url ?: tab.url,
                )
            } else {
                tab
            }
        }
    }

    /** 更新指定 tab 的导航状态（进度/加载中/返回前进），参数为 null 表示不变 */
    fun updateTabNav(
        tabId: String,
        progress: Int? = null,
        loading: Boolean? = null,
        canGoBack: Boolean? = null,
        canGoForward: Boolean? = null,
    ) {
        _tabs.value = _tabs.value.map { tab ->
            if (tab.tabId == tabId) {
                tab.copy(
                    progress = progress ?: tab.progress,
                    loading = loading ?: tab.loading,
                    canGoBack = canGoBack ?: tab.canGoBack,
                    canGoForward = canGoForward ?: tab.canGoForward,
                )
            } else {
                tab
            }
        }
    }

    /** 关闭标签：彻底销毁池中会话（不留快照），并清理会话监听者与桌面模式记忆 */
    fun closeTab(tabId: String) {
        val sessionId = "browser-$tabId"
        WebViewPool.get(sessionId)?.sessionListener = null
        sessionListeners.remove(sessionId)
        WebViewPool.destroyAndForget(sessionId)
        removeTabState(tabId)
        AppLog.log("browser", "关闭标签 $tabId（剩 ${_tabs.value.size} 个）")
    }

    fun closeAllTabs() {
        val count = _tabs.value.size
        _tabs.value.forEach { tab ->
            val sessionId = "browser-${tab.tabId}"
            WebViewPool.get(sessionId)?.sessionListener = null
            sessionListeners.remove(sessionId)
            WebViewPool.destroyAndForget(sessionId)
        }
        _desktopModes.value = emptyMap()
        _tabs.value = emptyList()
        setActive(null)
        _findState.value = FindState()
        AppLog.log("browser", "关闭全部标签（$count 个）")
    }

    /**
     * 移除 tab 的 UI 状态（不动池实例）：closeTab 在 destroy 后调用，
     * 池淘汰回调在实例已销毁后调用；若关的是激活 tab 则向前继/后续补位。
     */
    private fun removeTabState(tabId: String) {
        val current = _tabs.value
        val index = current.indexOfFirst { it.tabId == tabId }
        if (index < 0) return
        val remaining = current.filterNot { it.tabId == tabId }
        _tabs.value = remaining
        sessionListeners.remove("browser-$tabId")
        _desktopModes.value = _desktopModes.value - "browser-$tabId"
        if (_activeTabId.value == tabId) {
            setActive(remaining.getOrNull(index.coerceAtMost(remaining.size - 1))?.tabId)
        }
        if (remaining.isEmpty()) {
            _findState.value = FindState()
        }
    }

    // ---------------------------------------------------------------- find in page

    fun showFindBar() {
        _findState.value = _findState.value.copy(visible = true)
    }

    fun hideFindBar() {
        _findState.value = _findState.value.copy(visible = false)
        activeSessionId()?.let { WebViewPool.get(it) }?.clearFindMatches()
    }

    fun updateFindQuery(query: String) {
        _findState.value = _findState.value.copy(query = query, active = 0)
        val shell = activeSessionId()?.let { WebViewPool.get(it) }
        if (query.isBlank()) {
            shell?.clearFindMatches()
        } else {
            shell?.findInPage(query)
        }
    }

    fun onFindResult(sessionId: String, active: Int, total: Int) {
        if (sessionId != activeSessionId() || !_findState.value.visible) return
        _findState.value = _findState.value.copy(active = active, total = total)
    }

    fun findNext(forward: Boolean) {
        activeSessionId()?.let { WebViewPool.get(it) }?.findNext(forward)
    }

    // ---------------------------------------------------------------- bookmarks

    fun toggleBookmark(url: String, title: String) {
        viewModelScope.launch { savedPages.toggleBookmark(url, title) }
    }

    fun removeBookmark(url: String) {
        viewModelScope.launch { savedPages.removeBookmark(url) }
    }

    // ---------------------------------------------------------------- history

    fun recordHistory(url: String, title: String) {
        viewModelScope.launch { savedPages.recordVisit(url, title) }
    }

    fun clearHistory() {
        viewModelScope.launch { savedPages.clearHistory() }
    }

    // ---------------------------------------------------------------- desktop mode

    fun setDesktopMode(sessionId: String, enabled: Boolean) {
        _desktopModes.value = _desktopModes.value + (sessionId to enabled)
        WebViewPool.get(sessionId)?.let { shell ->
            shell.setDesktopMode(enabled)
            shell.reload()
        }
    }

    private fun activeSessionId(): String? = _activeTabId.value?.let { "browser-$it" }
}
