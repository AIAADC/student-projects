package com.webshell.core.webengine

/** 壳引擎的全局常量与默认值。 */
object WebEngineDefaults {

    /** 桌面模式 UA（Chrome 桌面版，自 Chrome 110 起 minor/build 固定为 .0.0） */
    const val DESKTOP_USER_AGENT: String =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/151.0.0.0 Safari/537.36"

    /**
     * 移动模式 UA（Chrome Android 移动版，主版本与 [DESKTOP_USER_AGENT] 保持一致）。
     * 不使用 WebView 默认 UA：其含 "Version/4.0" 与 "; wv)" 标记，
     * 部分站点（Google 登录、若干移动站）会识别为内嵌壳而拒绝/降级服务。
     */
    const val MOBILE_USER_AGENT: String =
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/151.0.0.0 Mobile Safari/537.36"

    /** WebViewAssetLoader 的本地资源域名（本地 HTML 导入用真实 https 源提供） */
    const val ASSET_LOADER_HOST: String = "appassets.androidplatform.net"
}
