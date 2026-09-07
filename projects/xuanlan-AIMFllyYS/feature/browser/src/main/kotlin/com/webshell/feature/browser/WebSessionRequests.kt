package com.webshell.feature.browser

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.content.ContextCompat
import com.webshell.core.designsystem.components.AppConfirmDialog
import com.webshell.core.webengine.ShellListener

/** Platform objects are scoped to the current visible session, never to saved UI state. */
@Stable
class WebSessionRequests internal constructor() {
    internal var permission by mutableStateOf<PermissionRequest?>(null)
    internal var sslError by mutableStateOf<String?>(null)
    internal var fileCallback by mutableStateOf<ValueCallback<Array<Uri>>?>(null)
    internal var available = false
    lateinit var listener: ShellListener
        internal set
    internal var allowPermission: () -> Unit = {}
    val busy: Boolean get() = permission != null || sslError != null || fileCallback != null

    internal fun denyPermission() {
        permission?.deny()
        permission = null
    }

    internal fun cancelPending() {
        fileCallback?.onReceiveValue(null)
        fileCallback = null
        denyPermission()
        sslError = null
    }

    internal fun clear() {
        available = false
        cancelPending()
    }
}

/** Activity results can outlive a tab switch; route each result to its launch-time owner. */
private class PlatformLaunchOwners {
    var file: WebSessionRequests? = null
    var permission: WebSessionRequests? = null
}

@Composable
fun rememberWebSessionRequests(
    sessionId: String?, visible: Boolean,
    onNewWindow: (String) -> Unit, onMessage: (String) -> Unit,
): WebSessionRequests {
    val context = LocalContext.current
    val requests = remember(sessionId) { WebSessionRequests() }
    val owners = remember { PlatformLaunchOwners() }
    val newWindow = rememberUpdatedState(onNewWindow)
    val message = rememberUpdatedState(onMessage)
    val fileLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val owner = owners.file
        owners.file = null
        owner?.fileCallback?.onReceiveValue(if (owner.available) {
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        } else null)
        owner?.fileCallback = null
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val owner = owners.permission
        owners.permission = null
        owner?.permission?.let { request ->
            val granted = request.resources.filter { resource ->
                permissionForWebResource(resource)?.let { permission ->
                    grants[permission] == true ||
                        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
                } == true
            }
            if (owner.available && granted.isNotEmpty()) request.grant(granted.toTypedArray()) else request.deny()
        }
        owner?.permission = null
    }
    SideEffect {
        requests.available = visible && sessionId != null
        requests.allowPermission = {
            val request = requests.permission
            if (request != null && requests.available) {
                val permissions = request.resources.mapNotNull(::permissionForWebResource).distinct()
                if (permissions.isEmpty() || owners.permission != null) requests.denyPermission()
                else {
                    owners.permission = requests
                    runCatching { permissionLauncher.launch(permissions.toTypedArray()) }.onFailure {
                        owners.permission = null
                        requests.denyPermission()
                    }
                }
            } else requests.denyPermission()
        }
    }
    DisposableEffect(requests, visible) { onDispose { requests.clear() } }
    requests.listener = remember(requests) {
        object : ShellListener {
            override fun onPageStarted(url: String) { requests.cancelPending() }
            override fun onNewWindow(url: String) { if (requests.available) newWindow.value(url) }
            override fun onDownloadStarted(fileName: String) {
                if (requests.available) message.value(context.getString(R.string.browser_download_started, fileName))
            }
            override fun onFileChooserRequested(
                params: WebChromeClient.FileChooserParams, callback: ValueCallback<Array<Uri>>,
            ) {
                if (!requests.available || owners.file != null) { callback.onReceiveValue(null); return }
                requests.fileCallback?.onReceiveValue(null)
                requests.fileCallback = callback
                owners.file = requests
                runCatching { fileLauncher.launch(params.createIntent()) }.onFailure {
                    callback.onReceiveValue(null)
                    requests.fileCallback = null
                    owners.file = null
                }
            }
            override fun onPermissionRequested(request: PermissionRequest) {
                if (!requests.available || request.resources.any { permissionForWebResource(it) == null }) {
                    request.deny()
                    return
                }
                requests.denyPermission()
                requests.permission = request
            }
            override fun onPermissionCanceled(request: PermissionRequest) {
                if (requests.permission === request) requests.permission = null
            }
            override fun onGeolocationPrompt(origin: String, callback: (Boolean, Boolean) -> Unit) {
                // No location grant flow is offered by this browser yet; always resolve denied.
                callback(false, false)
            }
            override fun onSslError(url: String, error: String, proceed: () -> Unit) {
                // The engine has already cancelled the handler. Never call proceed on it.
                if (requests.available) requests.sslError = error
            }
            override fun onExternalLaunchFailed(url: String) {
                if (requests.available) message.value(context.getString(R.string.browser_external_failed))
            }
        }
    }
    return requests
}

/** WebKit resource strings are not Android runtime permission names. Unknown resources deny. */
internal fun permissionForWebResource(resource: String): String? = when (resource) {
    PermissionRequest.RESOURCE_VIDEO_CAPTURE -> Manifest.permission.CAMERA
    PermissionRequest.RESOURCE_AUDIO_CAPTURE -> Manifest.permission.RECORD_AUDIO
    else -> null
}

@Composable
fun WebSessionDialogs(requests: WebSessionRequests, onRetry: () -> Unit, onLeave: () -> Unit) {
    requests.permission?.let { request ->
        val capabilities = request.resources.mapNotNull { resource ->
            when (resource) {
                PermissionRequest.RESOURCE_VIDEO_CAPTURE -> stringResource(R.string.browser_camera)
                PermissionRequest.RESOURCE_AUDIO_CAPTURE -> stringResource(R.string.browser_microphone)
                else -> null
            }
        }.joinToString(" / ")
        AppConfirmDialog(
            title = stringResource(R.string.browser_permission_title),
            text = stringResource(R.string.browser_permission_message, request.origin.host.orEmpty(), capabilities),
            confirmText = stringResource(R.string.browser_allow), dismissText = stringResource(R.string.browser_deny),
            onConfirm = requests.allowPermission, onDismiss = requests::denyPermission,
        )
    }
    requests.sslError?.let { error ->
        BrowserCertificateDialog(error, onRetry = { requests.sslError = null; onRetry() },
            onLeave = { requests.sslError = null; onLeave() })
    }
}

@Composable
internal fun BrowserCertificateDialog(error: String, onRetry: () -> Unit, onLeave: () -> Unit) {
    AppConfirmDialog(
        title = stringResource(R.string.browser_ssl_title), text = stringResource(R.string.browser_ssl_message, error),
        confirmText = stringResource(R.string.browser_ssl_retry), dismissText = stringResource(R.string.browser_leave),
        onConfirm = onRetry, onDismiss = onLeave,
    )
}
