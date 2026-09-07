package com.webshell.feature.me

import android.content.Context
import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import coil3.imageLoader
import com.webshell.core.model.AppLog
import com.webshell.core.webengine.WebViewCapabilities
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

internal enum class CacheClearState { Idle, Clearing, Cleared, Failed }

internal data class DeveloperUiState(
    val version: String,
    val webViewVersion: String,
    val apiLevel: String,
    val device: String,
    val cacheState: CacheClearState = CacheClearState.Idle,
)

@HiltViewModel
internal class DeveloperCenterViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
) : ViewModel() {
    private val packageInfo = runCatching { context.packageManager.getPackageInfo(context.packageName, 0) }.getOrNull()
    private val _state = MutableStateFlow(DeveloperUiState(
        version = "${packageInfo?.versionName ?: "-"} (versionCode ${packageInfo?.longVersionCode ?: "-"})",
        webViewVersion = WebViewCapabilities.snapshot().webViewVersion ?: "-",
        apiLevel = "Android ${Build.VERSION.SDK_INT}",
        device = "${Build.MANUFACTURER} ${Build.MODEL}",
    ))
    val state = _state.asStateFlow()

    fun clearIconCache() {
        if (_state.value.cacheState == CacheClearState.Clearing) return
        _state.value = _state.value.copy(cacheState = CacheClearState.Clearing)
        viewModelScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    context.imageLoader.memoryCache?.clear()
                    context.imageLoader.diskCache?.clear()
                }
                _state.value = _state.value.copy(cacheState = CacheClearState.Cleared)
                AppLog.log("dev", "图标缓存已清除")
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                _state.value = _state.value.copy(cacheState = CacheClearState.Failed)
            }
        }
    }
}
