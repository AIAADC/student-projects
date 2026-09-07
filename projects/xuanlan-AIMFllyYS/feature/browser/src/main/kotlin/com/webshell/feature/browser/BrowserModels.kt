package com.webshell.feature.browser

import android.graphics.Bitmap

/** Immutable per-tab values; thumbnail snapshots remain memory-only, never persisted. */
data class BrowserTab(
    val tabId: String,
    val title: String,
    val url: String,
    val thumbnail: Bitmap? = null,
    val progress: Int = 0,
    val loading: Boolean = false,
    val canGoBack: Boolean = false,
    val canGoForward: Boolean = false,
)

data class FindState(
    val visible: Boolean = false,
    val query: String = "",
    val active: Int = 0,
    val total: Int = 0,
)

/** Feature views and catalog don't consume Room entities or a ViewModel. */
data class BrowserSavedPage(val id: Long, val title: String, val url: String)
