package com.webshell.core.webengine

import android.content.Context
import android.view.MotionEvent
import android.webkit.WebView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

/**
 * 下拉刷新容器 + 内嵌真实 WebView。ShellWebView 通过组合它获得 WebView 能力。
 * 关键点：仅当页面无法向上滚动时才拦截下拉（否则与页面内部滚动冲突）。
 */
open class SwipeRefreshWebView(context: Context) : SwipeRefreshLayout(context) {

    val webView: WebView = WebView(context)

    var onUserRefresh: (() -> Unit)? = null

    private var pullToRefreshEnabled: Boolean = true

    init {
        addView(
            webView,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
        )
        setOnRefreshListener { onUserRefresh?.invoke() }
        setColorSchemeColors(0xFF1A73E8.toInt())
    }

    fun setPullToRefreshEnabled(enabled: Boolean) {
        pullToRefreshEnabled = enabled
        if (!enabled) isRefreshing = false
    }

    fun setRefreshingInternal(refreshing: Boolean) {
        isRefreshing = refreshing
    }

    override fun canChildScrollUp(): Boolean =
        if (pullToRefreshEnabled) webView.canScrollVertically(-1) else true

    override fun onInterceptTouchEvent(event: MotionEvent): Boolean =
        pullToRefreshEnabled && super.onInterceptTouchEvent(event)

    override fun onTouchEvent(event: MotionEvent): Boolean =
        pullToRefreshEnabled && super.onTouchEvent(event)
}
