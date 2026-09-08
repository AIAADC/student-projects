package com.webshell.core.webengine.compose

import android.view.ViewGroup
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.webshell.core.webengine.ShellConfig
import com.webshell.core.webengine.ShellListener
import com.webshell.core.webengine.WebViewPool

/**
 * The sole native-view lifecycle boundary. A session retains its WebView/history in the pool,
 * while UI callbacks and visible-session protection belong to this host.
 * Parents using Compose safeDrawing/imePadding opt into [parentHandlesInsets] to avoid double
 * padding. Full-screen site shells keep the existing native PAD/CSS_ONLY behavior by default.
 */
@Composable
fun ShellWebViewHost(
    sessionId: String,
    configFactory: () -> ShellConfig,
    listener: ShellListener? = null,
    modifier: Modifier = Modifier,
    insetMode: ShellConfig.InsetMode = ShellConfig.InsetMode.PAD,
    parentHandlesInsets: Boolean = false,
    isVisible: Boolean = true,
    sessionListener: ShellListener? = null,
    onFindResult: ((Int, Int) -> Unit)? = null,
    onReady: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val shell = remember(sessionId) { WebViewPool.getOrCreate(context, sessionId) { configFactory() } }
    val ownership = remember(shell) { Any() }
    val visible = rememberUpdatedState(isVisible)
    val latestReady = rememberUpdatedState(onReady)

    SideEffect {
        shell.uiHostOwner = ownership
        shell.listener = if (isVisible) listener else null
        shell.onFindResult = if (isVisible) onFindResult else null
        if (sessionListener != null) shell.sessionListener = sessionListener
    }
    LaunchedEffect(shell) { latestReady.value?.invoke() }

    DisposableEffect(shell, lifecycleOwner, isVisible) {
        if (isVisible) {
            WebViewPool.activeSessionId = sessionId
            if (lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) shell.resumeRendering()
        } else {
            shell.suspendRendering()
            if (WebViewPool.activeSessionId == sessionId) WebViewPool.activeSessionId = null
        }
        val observer = LifecycleEventObserver { _, event ->
            if (shell.uiHostOwner == ownership) {
                when (event) {
                    Lifecycle.Event.ON_PAUSE -> shell.suspendRendering()
                    Lifecycle.Event.ON_RESUME -> if (visible.value) shell.resumeRendering()
                    else -> Unit
                }
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            if (shell.uiHostOwner == ownership) {
                shell.listener = null
                shell.onFindResult = null
                shell.suspendRendering()
                shell.uiHostOwner = null
                if (WebViewPool.activeSessionId == sessionId) WebViewPool.activeSessionId = null
            }
        }
    }

    DisposableEffect(shell, parentHandlesInsets, insetMode) {
        ViewCompat.setOnApplyWindowInsetsListener(shell) { view, insets ->
            if (parentHandlesInsets) {
                shell.updateSafeAreaInsets(0, 0, 0, 0, 0)
                view.setPadding(0, 0, 0, 0)
            } else {
                val bars = insets.getInsets(
                    WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
                )
                val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
                shell.updateSafeAreaInsets(bars.top, bars.bottom, bars.left, bars.right, ime)
                if (insetMode == ShellConfig.InsetMode.PAD) {
                    view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime))
                } else view.setPadding(0, 0, 0, 0)
            }
            insets
        }
        ViewCompat.requestApplyInsets(shell)
        onDispose {
            if (shell.uiHostOwner == ownership || shell.uiHostOwner == null) {
                ViewCompat.setOnApplyWindowInsetsListener(shell, null)
            }
        }
    }

    // AndroidView.factory is not re-run by a changed remember(sessionId). Keying the native
    // host is essential: otherwise switching tabs can leave the previous WebView on screen.
    key(shell) {
        Box(modifier.fillMaxSize()) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = {
                    shell.apply {
                        (parent as? ViewGroup)?.removeView(this)
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
                        )
                    }
                },
            )
        }
    }
}
