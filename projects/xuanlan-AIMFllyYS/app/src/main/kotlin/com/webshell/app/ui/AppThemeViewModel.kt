package com.webshell.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webshell.core.data.SettingsRepository
import com.webshell.core.data.THEME_MODE_SYSTEM
import com.webshell.core.data.TRANSITION_SLIDE
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** Only appearance changes may invalidate the app-wide theme. */
data class AppThemeState(
    val mode: String = THEME_MODE_SYSTEM,
    val wallpaperPath: String? = null,
    val transitionStyle: String = TRANSITION_SLIDE,
    val appFontFamily: String = "misans",
    val appFontScalePercent: Int = 100,
)

@HiltViewModel
class AppThemeViewModel @Inject constructor(settingsRepository: SettingsRepository) : ViewModel() {
    val theme = settingsRepository.settings
        .map { AppThemeState(it.themeMode, it.photoWallpaperPath, it.transitionStyle, it.appFontFamily, it.appFontScalePercent) }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AppThemeState())
}
