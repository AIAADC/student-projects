package com.webshell.core.webengine

/**
 * 后台静默会话登记表：记录"正在运行/保活中"的网页应用会话。
 * WebHostService（app 模块的前台服务）据此刻画通知；即使进程被杀，
 * 磁盘上的 cookie/存储（Profile）也保证登录态不丢。
 */
object KeepAliveRegistry {

    data class Entry(
        val sessionId: String,
        val title: String,
        val url: String,
        val since: Long,
    )

    private val active = LinkedHashMap<String, Entry>()

    val entries: List<Entry>
        get() = synchronized(active) { active.values.toList() }

    fun register(sessionId: String, title: String, url: String) {
        synchronized(active) {
            active[sessionId] = Entry(sessionId, title, url, System.currentTimeMillis())
        }
    }

    fun unregister(sessionId: String) {
        synchronized(active) { active.remove(sessionId) }
    }

    fun isAlive(sessionId: String): Boolean =
        synchronized(active) { active.containsKey(sessionId) }

    const val ACTION_START = "com.webshell.action.KEEPALIVE_START"
    const val ACTION_STOP = "com.webshell.action.KEEPALIVE_STOP"
    const val CHANNEL_ID = "keepalive"
    const val NOTIFICATION_ID = 42
}

/** WebView 版本/能力矩阵（设置页展示 + 降级判断用） */
object WebViewCapabilities {

    data class Snapshot(
        val webViewVersion: String?,
        val multiProfile: Boolean,
        val documentStartJs: Boolean,
        val algorithmicDarkening: Boolean,
    )

    fun snapshot(): Snapshot = Snapshot(
        webViewVersion = runCatching {
            android.webkit.WebView.getCurrentWebViewPackage()?.versionName
        }.getOrNull(),
        multiProfile = androidx.webkit.WebViewFeature.isFeatureSupported(
            androidx.webkit.WebViewFeature.MULTI_PROFILE,
        ),
        documentStartJs = androidx.webkit.WebViewFeature.isFeatureSupported(
            androidx.webkit.WebViewFeature.DOCUMENT_START_SCRIPT,
        ),
        algorithmicDarkening = androidx.webkit.WebViewFeature.isFeatureSupported(
            androidx.webkit.WebViewFeature.ALGORITHMIC_DARKENING,
        ) && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q,
    )
}
