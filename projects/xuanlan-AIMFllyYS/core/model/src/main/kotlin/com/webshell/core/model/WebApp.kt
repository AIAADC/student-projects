package com.webshell.core.model

/**
 * 用户通过网址（或本地 HTML 导入）创建的"网页应用"。
 * 它不是真正的 APK，而是本应用内的一份壳配置 + 独立 Profile 的 WebView 会话。
 */
data class WebApp(
    val id: String,
    val title: String,
    val url: String,
    val iconUrl: String? = null,
    /** 以桌面 UA 渲染（电脑版网页） */
    val desktopMode: Boolean = false,
    /** 强制算法深色渲染 */
    val darkMode: Boolean = false,
    /** 切后台后保持前台服务保活（后台静默） */
    val keepAlive: Boolean = false,
    /** 是否为收藏（来自"浏览"的书签，与制作的应用在主页以边框样式区分） */
    val isFavorite: Boolean = false,
    val createdAt: Long = 0L,
)
