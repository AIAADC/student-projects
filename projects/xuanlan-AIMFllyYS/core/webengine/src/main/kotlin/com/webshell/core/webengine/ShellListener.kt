package com.webshell.core.webengine

import android.net.Uri
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient.FileChooserParams

/** 壳引擎对外的事件回调。全部在主线程回调。 */
interface ShellListener {
    /** 页面开始加载（可显示进度） */
    fun onPageStarted(url: String) {}

    fun onProgress(progress: Int) {}

    /** 首帧可见：隐藏 splash 的时机（早于 onPageFinished，观感更"原生"） */
    fun onFirstPaint(url: String) {}

    fun onPageFinished(url: String) {}

    fun onTitleReceived(title: String) {}

    /** 页面 <meta name="theme-color"> 变化，宿主可据此染色状态栏 */
    fun onThemeColor(color: Int?) {}

    /** SPA 路由/跳转后返回能力变化，宿主据此启停返回手势拦截 */
    fun onCanGoBackChanged(canGoBack: Boolean) {}

    /** 前进能力变化，宿主据此启停"前进"按钮 */
    fun onCanGoForwardChanged(canGoForward: Boolean) {}

    /** target=_blank / window.open 请求的新窗口 URL，由宿主决定去处 */
    fun onNewWindow(url: String) {}

    /** 非 blob 下载（引擎已默认交给 DownloadManager，此回调仅用于 UI 提示） */
    fun onDownloadStarted(fileName: String) {}

    /** 文件选择（<input type=file>），宿主用 ActivityResultLauncher 处理后必须回调 */
    fun onFileChooserRequested(params: FileChooserParams, callback: ValueCallback<Array<Uri>>) {}

    /** 网页请求摄像头/麦克风等权限，宿主询问用户后调用 grant()/deny() */
    fun onPermissionRequested(request: PermissionRequest) {}

    fun onPermissionCanceled(request: PermissionRequest) {}

    /** 网页请求地理定位 */
    fun onGeolocationPrompt(origin: String, callback: (allow: Boolean, retain: Boolean) -> Unit) {}

    /** 证书错误：引擎已拒绝；宿主可展示拦截页并自行决定是否放行 */
    fun onSslError(url: String, error: String, proceed: () -> Unit) {}

    /** 渲染进程崩溃，引擎已自动重建并恢复当前 URL */
    fun onRenderProcessRecovered() {}

    fun onExternalLaunchFailed(url: String) {}
}
