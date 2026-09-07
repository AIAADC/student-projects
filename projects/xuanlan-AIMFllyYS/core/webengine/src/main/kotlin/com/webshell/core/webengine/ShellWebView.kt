package com.webshell.core.webengine

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.SslErrorHandler
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.net.toUri
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.webshell.core.model.AppLog

/**
 * "原生感"网页壳引擎：零浏览器 UI、下拉刷新容器、SPA 返回、外链路由、
 * 下载/上传/权限、可选独立 Profile 隔离（config.profileId）、渲染进程自愈。
 * 设计约束：必须在主线程创建与使用（WebView 要求）。
 * 对外暴露 [view]（装入布局）与 [webView]（WebView 能力）。
 */
@SuppressLint("SetJavaScriptEnabled")
class ShellWebView internal constructor(
    context: Context,
    val config: ShellConfig,
) : SwipeRefreshWebView(context) {

    val sessionId: String = config.sessionId ?: "anon-${System.nanoTime()}"

    var listener: ShellListener? = null

    /** Identity of the current Compose host; an outgoing host cannot detach its successor. */
    internal var uiHostOwner: Any? = null

    /**
     * 持久监听者：随会话存活，不随 Compose 组合摘除（ShellWebViewHost 出组合只清 listener）。
     * 由 ViewModel 层注册/注销，承载按会话归属的状态写回（标题/URL/进度/返回栈）。
     */
    var sessionListener: ShellListener? = null

    /** 事件分发：先持久 sessionListener，后临时 UI listener */
    private inline fun notifyListeners(block: ShellListener.() -> Unit) {
        sessionListener?.block()
        listener?.block()
    }

    private val assetLoader: WebViewAssetLoaderHolder = WebViewAssetLoaderHolder(context)

    private var savedStateBundle: Bundle? = null

    internal var pendingRecoveryUrl: String? = null

    init {
        configureBaseSettings()
        applyProfile()
        applyChromeClients()
        applyPullToRefresh()
        applyFindListener()
        injectBootstrapOnce()
    }

    // ---------------------------------------------------------------- settings

    private fun configureBaseSettings() {
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            cacheMode = WebSettings.LOAD_DEFAULT
            useWideViewPort = true
            loadWithOverviewMode = true
            builtInZoomControls = false
            displayZoomControls = false
            setSupportMultipleWindows(true) // target=_blank 走 onCreateWindow
            javaScriptCanOpenWindowsAutomatically = true
            mediaPlaybackRequiresUserGesture = !config.autoplayMedia
            setAllowFileAccess(false)
            textZoom = config.textZoomPercent
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }
        webView.overScrollMode = OVER_SCROLL_NEVER
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false

        setDesktopMode(config.desktopMode)

        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING) &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        ) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(webView.settings, config.algorithmicDark)
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.BACK_FORWARD_CACHE)) {
            WebSettingsCompat.setBackForwardCacheEnabled(webView.settings, true)
        }

        CookieManager.getInstance().setAcceptCookie(true)
        // 显式双向设置：true/false 都调用，避免跨实例状态泄漏（CookieManager 进程级共享）
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, config.thirdPartyCookies)
    }

    fun setDesktopMode(enabled: Boolean) {
        webView.settings.userAgentString =
            if (enabled) WebEngineDefaults.DESKTOP_USER_AGENT else WebEngineDefaults.MOBILE_USER_AGENT
        if (WebViewFeature.isFeatureSupported(WebViewFeature.USER_AGENT_METADATA)) {
            runCatching {
                WebSettingsCompat.setUserAgentMetadata(
                    webView.settings,
                    androidx.webkit.UserAgentMetadata.Builder()
                        .setPlatform(if (enabled) "Windows" else "Android")
                        .setPlatformVersion(if (enabled) "10.0.0" else Build.VERSION.RELEASE ?: "")
                        .setArchitecture(if (enabled) "x86" else "")
                        .setModel(if (enabled) "" else Build.MODEL ?: "")
                        .setMobile(!enabled)
                        .build(),
                )
            }
        }
    }

    private fun applyProfile() {
        // profileId 为 null 时使用 WebView 默认共享 Profile（不做任何切换）
        val profileId = config.profileId ?: return
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) return
        runCatching {
            androidx.webkit.ProfileStore.getInstance().getOrCreateProfile(profileId)
            WebViewCompat.setProfile(webView, profileId)
        }
    }

    private fun injectBootstrapOnce() {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        WebViewCompat.addDocumentStartJavaScript(
            webView,
            "(function(){" +
                "window.__wsBoot={t:Date.now()};" +
                "if(!document.getElementById('ws-safe-style')){" +
                "var s=document.createElement('style');s.id='ws-safe-style';" +
                "s.textContent=':root{--ws-safe-top:0px;--ws-safe-bottom:0px;" +
                "--ws-safe-left:0px;--ws-safe-right:0px;--ws-ime-height:0px;}';" +
                "document.documentElement.appendChild(s);}" +
                "})();",
            setOf("*"),
        )
    }

    // ---------------------------------------------------------------- clients

    private fun applyChromeClients() {
        webView.webViewClient = ShellClient()
        webView.webChromeClient = ShellChromeClient()
        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            handleDownload(url, userAgent, contentDisposition, mimeType)
        }
    }

    private fun applyPullToRefresh() {
        setPullToRefreshEnabled(config.pullToRefresh && !config.desktopMode)
        onUserRefresh = {
            if (!webView.canGoBack()) webView.reload()
            setRefreshingInternal(false)
        }
    }

    private inner class ShellClient : WebViewClient() {

        override fun shouldOverrideUrlLoading(
            view: WebView,
            request: WebResourceRequest,
        ): Boolean = routeUrl(request.url.toString())

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            AppLog.log("web", "加载 ${logHost(url)}")
            notifyListeners { onPageStarted(url) }
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
            notifyListeners { onCanGoBackChanged(view.canGoBack()) }
            notifyListeners { onCanGoForwardChanged(view.canGoForward()) }
            super.doUpdateVisitedHistory(view, url, isReload)
        }

        override fun onPageCommitVisible(view: WebView, url: String) {
            reapplyInsetsIfNeeded()
            notifyListeners { onFirstPaint(url) }
        }

        override fun onPageFinished(view: WebView, url: String) {
            AppLog.log("web", "加载完成 ${logHost(url)}")
            notifyListeners { onPageFinished(url) }
            CookieManager.getInstance().flush()
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError,
        ) {
            if (request.isForMainFrame) {
                AppLog.error(
                    "web",
                    "加载失败 ${logHost(request.url?.toString())}: ${error.errorCode} ${error.description}",
                )
                notifyListeners { onPageFinished(request.url.toString()) }
            }
        }

        override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) {
            AppLog.error("web", "SSL 错误 ${logHost(view.url)}: ${error.primaryError}")
            // 不静默放行：拒绝并回调宿主展示拦截页，由用户显式决定
            handler.cancel()
            notifyListeners { onSslError(view.url ?: "", error.primaryError.toString()) { handler.proceed() } }
        }

        override fun shouldInterceptRequest(
            view: WebView,
            request: WebResourceRequest,
        ): WebResourceResponse? =
            if (LocalWebHost.isLocalUrl(request.url.toString())) {
                assetLoader.loader.shouldInterceptRequest(request.url)
            } else null

        override fun onRenderProcessGone(
            view: WebView,
            detail: android.webkit.RenderProcessGoneDetail,
        ): Boolean {
            // 官方建议：不让宿主进程陪葬。记录 URL，标记恢复，宿主重建会话。
            pendingRecoveryUrl = view.url
            notifyListeners { onRenderProcessRecovered() }
            return true
        }
    }

    private inner class ShellChromeClient : WebChromeClient() {

        override fun onProgressChanged(view: WebView, newProgress: Int) {
            notifyListeners { onProgress(newProgress) }
        }

        override fun onReceivedTitle(view: WebView, title: String) {
            notifyListeners { onTitleReceived(title) }
        }

        override fun onCreateWindow(
            view: WebView,
            isDialog: Boolean,
            isUserGesture: Boolean,
            resultMsg: android.os.Message,
        ): Boolean {
            // 用临时探针 WebView 捕获新窗口最终 URL，交给宿主决定去处
            val transport = view.WebViewTransport()
            val probe = WebView(view.context)
            probe.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    v: WebView,
                    request: WebResourceRequest,
                ): Boolean {
                    notifyListeners { onNewWindow(request.url.toString()) }
                    return true
                }
            }
            transport.setWebView(probe)
            resultMsg.obj = transport
            resultMsg.sendToTarget()
            probe.postDelayed({
                runCatching {
                    (probe.parent as? ViewGroup)?.removeView(probe)
                    probe.destroy()
                }
            }, 1500)
            return true
        }

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            notifyListeners { onFileChooserRequested(fileChooserParams, filePathCallback) }
            return true
        }

        override fun onPermissionRequest(request: PermissionRequest) {
            notifyListeners { onPermissionRequested(request) }
        }

        override fun onPermissionRequestCanceled(request: PermissionRequest) {
            notifyListeners { onPermissionCanceled(request) }
        }

        override fun onGeolocationPermissionsShowPrompt(
            origin: String,
            callback: android.webkit.GeolocationPermissions.Callback,
        ) {
            notifyListeners { onGeolocationPrompt(origin) { allow, retain ->
                callback.invoke(origin, allow, retain)
            } }
        }
    }

    // ---------------------------------------------------------------- routing

    /**
     * 日志只记录 host（隐私纪律：不落完整 URL/查询串）；
     * 解析失败时截断原串到 64 字符内兜底。
     */
    private fun logHost(url: String?): String {
        if (url.isNullOrBlank()) return "(无 URL)"
        val host = runCatching { Uri.parse(url).host?.takeIf { it.isNotBlank() } }.getOrNull()
        return host ?: url.take(64)
    }

    /** @return true 表示本引擎已处理（不交给 WebView 加载） */
    private fun routeUrl(url: String): Boolean {
        val uri = url.toUri()
        return when (uri.scheme?.lowercase()) {
            "http", "https" -> {
                if (config.externalLinkPolicy == ShellConfig.ExternalLinkPolicy.OPEN_IN_BROWSER &&
                    !LocalWebHost.isLocalUrl(url) && isForeignHost(url)
                ) {
                    launchExternal(url)
                    true
                } else false
            }
            "about", "data", "blob", "javascript" -> false
            "intent" -> launchIntentUri(url)
            "tel", "sms", "mailto", "geo", "market" -> { launchExternal(url); true }
            null -> true
            else -> { launchExternal(url); true }
        }
    }

    private fun isForeignHost(url: String): Boolean {
        val current = this.webView.url?.toUri()?.host ?: return false
        val target = url.toUri().host ?: return false
        return current != target
    }

    private fun launchExternal(url: String) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri()))
        }.onFailure { notifyListeners { onExternalLaunchFailed(url) } }
    }

    private fun launchIntentUri(url: String): Boolean {
        runCatching {
            val intent = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
            context.startActivity(intent)
        }.onFailure { notifyListeners { onExternalLaunchFailed(url) } }
        return true
    }

    private fun handleDownload(
        url: String,
        userAgent: String,
        contentDisposition: String?,
        mimeType: String?,
    ) {
        if (url.startsWith("blob:")) {
            notifyListeners { onDownloadStarted("(blob)") }
            return
        }
        runCatching {
            val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val request = DownloadManager.Request(url.toUri())
                .setMimeType(mimeType)
                .setTitle(fileName)
                .setDescription("玄览 下载")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)
                .addRequestHeader("User-Agent", userAgent)
            context.getSystemService(DownloadManager::class.java).enqueue(request)
            notifyListeners { onDownloadStarted(fileName) }
        }.onFailure { notifyListeners { onExternalLaunchFailed(url) } }
    }

    // ---------------------------------------------------------------- find in page

    /** 页面内查找结果回调（主线程）；activeMatchOrdinal 从 0 开始 */
    var onFindResult: ((activeMatchOrdinal: Int, numberOfMatches: Int) -> Unit)? = null

    private fun applyFindListener() {
        webView.setFindListener { activeMatchOrdinal, numberOfMatches, _ ->
            onFindResult?.invoke(activeMatchOrdinal, numberOfMatches)
        }
    }

    /** 开始/更新页内查找；空串等效清除 */
    fun findInPage(query: String) {
        webView.findAllAsync(query)
    }

    /** 跳到上/下一个匹配项 */
    fun findNext(forward: Boolean) {
        webView.findNext(forward)
    }

    /** 清除查找高亮 */
    fun clearFindMatches() {
        runCatching { webView.clearMatches() }
    }

    // ---------------------------------------------------------------- insets

    /** 最近一次 insets 注入脚本；换文档（新页面加载）后需重放 */
    private var lastInsetsJs: String? = null

    /** 宿主把系统 insets 写进页面 CSS 变量（WebView 中 env(safe-area-inset-*) 恒为 0） */
    fun updateSafeAreaInsets(top: Int, bottom: Int, left: Int, right: Int, imeHeight: Int = 0) {
        val js = "(function(){if(!document.documentElement)return;" +
            "document.documentElement.style.setProperty('--ws-safe-top','${top}px');" +
            "document.documentElement.style.setProperty('--ws-safe-bottom','${bottom}px');" +
            "document.documentElement.style.setProperty('--ws-safe-left','${left}px');" +
            "document.documentElement.style.setProperty('--ws-safe-right','${right}px');" +
            "document.documentElement.style.setProperty('--ws-ime-height','${imeHeight}px');})();"
        if (lastInsetsJs == js) return
        lastInsetsJs = js
        post { webView.evaluateJavascript(js, null) }
    }

    /** 新文档就绪时重放 insets（页面级 CSS 变量不跨文档持久） */
    internal fun reapplyInsetsIfNeeded() {
        lastInsetsJs?.let { js -> post { webView.evaluateJavascript(js, null) } }
    }

    // ---------------------------------------------------------------- state

    /** 会话快照（含返回栈）；由池淘汰/宿主 onStop/保活服务调用 */
    fun saveSessionState(): Bundle? {
        val bundle = Bundle()
        runCatching { WebViewCompat.saveState(webView, bundle, 4 * 1024 * 1024, true) }
            .onFailure { webView.saveState(bundle) }
        CookieManager.getInstance().flush()
        savedStateBundle = bundle
        return bundle
    }

    fun restoreSessionState(bundle: Bundle?) {
        bundle?.let { webView.restoreState(it) }
    }

    /** 首次加载：若存在渲染恢复 URL 则用之，否则加载 startUrl */
    fun loadWithStateRestore(url: String) {
        pendingRecoveryUrl?.let { recovery ->
            webView.loadUrl(recovery)
            pendingRecoveryUrl = null
        } ?: run { webView.loadUrl(url) }
    }

    fun reloadWithStateRestore() {
        webView.reload()
    }

    fun currentUrl(): String? = webView.url

    /** 直接加载 URL（供 onNewWindow 等场景复用当前会话） */
    fun load(url: String) {
        webView.loadUrl(url)
    }

    /** Already-validated user navigation that must retain a saved site's external-link policy. */
    fun loadFollowingLinkPolicy(url: String) {
        if (!routeUrl(url)) webView.loadUrl(url)
    }

    fun goBack(): Boolean = if (webView.canGoBack()) {
        webView.goBack(); true
    } else false

    fun canGoBack(): Boolean = webView.canGoBack()

    fun goForward(): Boolean = if (webView.canGoForward()) {
        webView.goForward(); true
    } else false

    fun canGoForward(): Boolean = webView.canGoForward()

    fun reload() {
        webView.reload()
    }

    fun stopLoading() {
        runCatching { webView.stopLoading() }
    }

    fun captureThumbnail(maxWidth: Int = 360): Bitmap? {
        if (webView.width == 0 || webView.height == 0) return null
        val scale = maxWidth.toFloat() / webView.width
        val bmp = Bitmap.createBitmap(
            (webView.width * scale).toInt().coerceAtLeast(1),
            (webView.height * scale).toInt().coerceAtLeast(1),
            Bitmap.Config.ARGB_8888,
        )
        val canvas = Canvas(bmp)
        canvas.scale(scale, scale)
        webView.draw(canvas)
        return bmp
    }

    fun release() {
        listener = null
        sessionListener = null
        saveSessionState()
        runCatching {
            (parent as? ViewGroup)?.removeView(this)
            webView.destroy()
        }
    }

    /**
     * 多标签切换：把视图从窗口摘除但实例保留在池中（JS/网络/返回栈不中断）。
     * 与 [release] 的区别：不销毁 WebView、不暂停渲染——池中的会话保持"活着"。
     */
    fun detachForReuse() {
        runCatching { (parent as? ViewGroup)?.removeView(this) }
    }

    fun suspendRendering() {
        webView.onPause()
    }

    fun resumeRendering() {
        webView.onResume()
    }
}
