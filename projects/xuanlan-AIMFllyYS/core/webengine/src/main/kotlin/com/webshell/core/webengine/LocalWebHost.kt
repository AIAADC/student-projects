package com.webshell.core.webengine

import android.content.Context
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * 本地 HTML 宿主：把打包在 assets 以及用户导入到内部存储的 HTML 以真实 https 源提供，
 * 解决 file:// 的 CORS/ServiceWorker 限制。URL 形如
 * https://appassets.androidplatform.net/assets/<path>（打包资源）
 * https://appassets.androidplatform.net/local/<appId>/<path>（导入的本地应用）
 */
object LocalWebHost {

    const val HOST: String = "appassets.androidplatform.net"
    const val ASSET_PREFIX: String = "/assets/"

    /** 导入的本地应用挂载在域名的 /local/ 前缀下 */
    const val LOCAL_PREFIX: String = "/local/"

    /** 导入文件在内部存储中的根目录名（filesDir/localapps/<appId>/...） */
    const val LOCAL_APPS_DIR: String = "localapps"

    /** 本地导入应用的虚拟 scheme（持久化层使用，渲染时映射到 LOCAL_PREFIX） */
    const val LOCAL_SCHEME: String = "local"

    fun createLoader(context: Context): WebViewAssetLoader =
        WebViewAssetLoader.Builder()
            .addPathHandler(ASSET_PREFIX, WebViewAssetLoader.AssetsPathHandler(context))
            .addPathHandler(
                LOCAL_PREFIX,
                // filesDir/localapps/ 位于 dataDir 下的允许目录内；
                // 请求 /local/<appId>/<file> 时 WebViewAssetLoader 会把前缀剥离，
                // 以剩余相对路径在目录内解析（含路径穿越防护）。
                WebViewAssetLoader.InternalStoragePathHandler(
                    context,
                    File(context.filesDir, LOCAL_APPS_DIR),
                ),
            )
            .build()

    fun isLocalUrl(url: String): Boolean = try {
        android.net.Uri.parse(url).host == HOST
    } catch (_: Exception) {
        false
    }

    /**
     * 持久化层的本地应用 URL：local://<appId>/index.html
     * 渲染层（M4/M5）需先经 [toHttpsUrl] 映射为 AssetLoader 的 https 地址。
     */
    fun buildLocalAppUrl(appId: String, fileName: String = "index.html"): String =
        "$LOCAL_SCHEME://$appId/$fileName"

    fun isLocalAppUrl(url: String): Boolean = url.startsWith("$LOCAL_SCHEME://")

    fun localAppId(url: String): String? {
        if (!isLocalAppUrl(url)) return null
        return url.removePrefix("$LOCAL_SCHEME://").substringBefore('/')
    }

    /** local://<appId>/<file> → https://appassets.androidplatform.net/local/<appId>/<file> */
    fun toHttpsUrl(url: String): String {
        if (!isLocalAppUrl(url)) return url
        val withoutScheme = url.removePrefix("$LOCAL_SCHEME://")
        val appId = withoutScheme.substringBefore('/')
        val path = withoutScheme.substringAfter('/', missingDelimiterValue = "")
        return "https://$HOST$LOCAL_PREFIX$appId/$path"
    }

    /** 导入应用在内部存储中的目录 */
    fun localAppDir(context: Context, appId: String): File =
        File(File(context.filesDir, LOCAL_APPS_DIR), appId)
}
