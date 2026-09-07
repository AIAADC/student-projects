package com.webshell.feature.me

import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webshell.core.data.HomeSettings
import com.webshell.core.data.SettingsRepository
import com.webshell.core.model.AppLog
import com.webshell.core.webengine.KeepAliveRegistry
import com.webshell.core.webengine.WebViewCapabilities
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class MeUiState(
    val batteryWhitelisted: Boolean = false,
    val runningSessions: List<KeepAliveRegistry.Entry> = emptyList(),
    val capabilities: WebViewCapabilities.Snapshot = WebViewCapabilities.snapshot(),
    val oemHint: String = oemHintFor(Build.MANUFACTURER),
)

private fun oemHintFor(manufacturer: String): String {
    val m = manufacturer.lowercase()
    return when {
        m.contains("xiaomi") || m.contains("redmi") ->
            "小米/红米：请在 系统设置→应用管理→玄览 中开启「自启动」，并在最近任务里下拉锁定本应用。"
        m.contains("huawei") || m.contains("honor") ->
            "华为/荣耀：请在 设置→电池→启动管理 中允许自启动与后台运行。"
        m.contains("oppo") || m.contains("realme") || m.contains("oneplus") ->
            "OPPO/一加：请在 设置→电池→更多设置 中允许完全后台行为，并锁定最近任务。"
        m.contains("vivo") || m.contains("iqoo") ->
            "vivo/iQOO：请在 设置→电池→后台功耗管理 中允许后台高耗电。"
        m.contains("samsung") ->
            "三星：如遇后台受限，请在 设置→电池→后台使用限制 中将本应用移出休眠。"
        else -> "如遇后台被清理，请在系统设置中将本应用加入电池优化豁免/自启动名单。"
    }
}

@HiltViewModel
class MeViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository,
    @ApplicationContext private val context: Context,
) : ViewModel() {

    val settings: StateFlow<HomeSettings> = settingsRepository.settings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeSettings())

    private val _uiState = MutableStateFlow(MeUiState())
    val uiState: StateFlow<MeUiState> = _uiState.asStateFlow()

    private val _fontSaveState = MutableStateFlow(FontSaveState.Idle)
    val fontSaveState: StateFlow<FontSaveState> = _fontSaveState.asStateFlow()

    fun resetFontSaveState() { _fontSaveState.value = FontSaveState.Idle }

    fun setAppTypography(fontFamily: String, scalePercent: Int) {
        if (_fontSaveState.value == FontSaveState.Saving) return
        _fontSaveState.value = FontSaveState.Saving
        viewModelScope.launch {
            try {
                settingsRepository.setAppTypography(fontFamily, scalePercent)
                _fontSaveState.value = FontSaveState.Saved
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                _fontSaveState.value = FontSaveState.Failed
            }
        }
    }

    fun setBrowserAutoCollapse(enabled: Boolean) = viewModelScope.launch {
        settingsRepository.setBrowserAutoCollapse(enabled)
    }

    internal fun onLayoutAction(action: LayoutSettingAction) {
        when (action) {
            is LayoutSettingAction.Columns -> setColumns(action.value)
            is LayoutSettingAction.Rows -> setRows(action.value)
            is LayoutSettingAction.ScrollMode -> setHomeScrollMode(action.value)
            is LayoutSettingAction.AutoArrange -> setAutoArrangeHome(action.value)
            is LayoutSettingAction.AllAppsEntry -> setAllAppsEntryVisible(action.value)
            is LayoutSettingAction.IconSize -> setIconSize(action.value)
            is LayoutSettingAction.IconCorner -> setIconCorner(action.value)
            is LayoutSettingAction.Labels -> setShowLabels(action.value)
            is LayoutSettingAction.PageIndicator -> setShowPageIndicator(action.value)
        }
    }

    fun setColumns(value: Int) = viewModelScope.launch { settingsRepository.setGridColumns(value) }

    fun setRows(value: Int) = viewModelScope.launch { settingsRepository.setGridRows(value) }

    fun setIconSize(value: Int) = viewModelScope.launch { settingsRepository.setIconSizeDp(value) }

    fun setIconCorner(value: Int) = viewModelScope.launch {
        settingsRepository.setIconCornerRadiusPercent(value)
    }

    fun setShowLabels(value: Boolean) = viewModelScope.launch {
        settingsRepository.setShowLabels(value)
    }

    fun setShowPageIndicator(value: Boolean) = viewModelScope.launch {
        settingsRepository.setShowPageIndicator(value)
    }

    fun setAutoArrangeHome(value: Boolean) = viewModelScope.launch {
        settingsRepository.setAutoArrangeHome(value)
    }

    fun setHomeScrollMode(mode: String) = viewModelScope.launch {
        settingsRepository.setHomeScrollMode(mode)
    }

    fun setAllAppsEntryVisible(value: Boolean) = viewModelScope.launch {
        settingsRepository.setAllAppsEntryVisible(value)
    }

    fun setKeepAliveServiceEnabled(value: Boolean) {
        viewModelScope.launch { settingsRepository.setKeepAliveServiceEnabled(value) }
        AppLog.log("me", "增强保活${if (value) "开启" else "关闭"}")
    }

    fun refreshBatteryState(whitelisted: Boolean) {
        _uiState.value = _uiState.value.copy(batteryWhitelisted = whitelisted)
    }

    fun stopSession(sessionId: String) {
        KeepAliveRegistry.unregister(sessionId)
        _uiState.value = _uiState.value.copy(runningSessions = KeepAliveRegistry.entries)
        AppLog.log("me", "结束后台会话 $sessionId")
    }

    fun refreshSessions() {
        _uiState.value = _uiState.value.copy(runningSessions = KeepAliveRegistry.entries)
    }

    fun setThemeMode(mode: String) = viewModelScope.launch {
        settingsRepository.setThemeMode(mode)
        AppLog.log("me", "主题切换：$mode")
    }

    fun setTransitionStyle(style: String) = viewModelScope.launch {
        settingsRepository.setTransitionStyle(style)
        AppLog.log("me", "页面切换动效：$style")
    }

    /** 把用户挑选的照片复制到应用私有目录并持久化路径（IO 在后台线程）。 */
    fun setPhotoWallpaper(uri: Uri) = viewModelScope.launch {
        val path = withContext(Dispatchers.IO) {
            runCatching {
                val dir = File(context.filesDir, "wallpaper").apply { mkdirs() }
                val target = File(dir, "wallpaper_${System.currentTimeMillis()}.jpg")
                context.contentResolver.openInputStream(uri)?.use { input ->
                    target.outputStream().use { output -> input.copyTo(output) }
                } ?: return@runCatching null
                // 只保留当前壁纸，避免私有目录无限增长
                dir.listFiles()?.forEach { if (it.absolutePath != target.absolutePath) it.delete() }
                target.absolutePath
            }.getOrNull()
        } ?: return@launch
        settingsRepository.setPhotoWallpaperPath(path)
        settingsRepository.setThemeMode(com.webshell.core.data.THEME_MODE_PHOTO)
    }
}
