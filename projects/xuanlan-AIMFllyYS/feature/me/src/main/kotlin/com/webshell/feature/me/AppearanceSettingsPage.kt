package com.webshell.feature.me

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material.icons.filled.Wallpaper
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.webshell.core.data.HomeSettings
import com.webshell.core.data.THEME_MODE_DARK
import com.webshell.core.data.THEME_MODE_LIGHT
import com.webshell.core.data.THEME_MODE_PHOTO
import com.webshell.core.data.THEME_MODE_SYSTEM
import com.webshell.core.data.TRANSITION_FADE
import com.webshell.core.data.TRANSITION_NONE
import com.webshell.core.data.TRANSITION_SCALE
import com.webshell.core.data.TRANSITION_SLIDE
import com.webshell.core.designsystem.components.AppListDivider
import com.webshell.core.designsystem.components.AppListRow
import com.webshell.core.designsystem.components.AppSelectionRow
import com.webshell.core.designsystem.components.AppSettingsSection
import java.io.File

@Composable
internal fun AppearanceSettingsPage(
    settings: HomeSettings,
    onThemeMode: (String) -> Unit,
    onTransitionStyle: (String) -> Unit,
    onPickWallpaper: (Uri) -> Unit,
    onOpenFonts: () -> Unit,
    onBack: () -> Unit,
) {
    val pickWallpaper = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) {
        if (it != null) onPickWallpaper(it)
    }
    fun pick() = pickWallpaper.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    DetailPage(stringResource(R.string.me_appearance), onBack) {
        AppearanceSettingsContent(
            settings, onThemeMode, onTransitionStyle, ::pick, onOpenFonts,
        )
    }
}

@Composable
internal fun AppearanceSettingsContent(
    settings: HomeSettings,
    onThemeMode: (String) -> Unit,
    onTransitionStyle: (String) -> Unit,
    onPickWallpaper: () -> Unit,
    onOpenFonts: () -> Unit,
) {
    AppSettingsSection(stringResource(R.string.me_theme_mode)) {
        val choices = listOf(
            Triple(THEME_MODE_SYSTEM, R.string.me_theme_system, R.string.me_theme_system_hint),
            Triple(THEME_MODE_LIGHT, R.string.me_theme_light, R.string.me_theme_light_hint),
            Triple(THEME_MODE_DARK, R.string.me_theme_dark, R.string.me_theme_dark_hint),
            Triple(THEME_MODE_PHOTO, R.string.me_theme_photo, R.string.me_theme_photo_hint),
        )
        choices.forEachIndexed { index, (mode, title, hint) ->
            AppSelectionRow(stringResource(title), settings.themeMode == mode,
                onClick = {
                    if (mode == THEME_MODE_PHOTO && settings.photoWallpaperPath.isNullOrBlank()) onPickWallpaper()
                    else onThemeMode(mode)
                },
                subtitle = stringResource(hint),
            )
            if (index < choices.lastIndex) AppListDivider(false)
        }
    }
    Spacer(Modifier.height(16.dp))
    AppSettingsSection(stringResource(R.string.me_font_section)) {
        AppListRow(
            title = stringResource(R.string.me_fonts),
            subtitle = stringResource(R.string.me_font_summary, appFontName(settings.appFontFamily), settings.appFontScalePercent),
            leadingIcon = Icons.Filled.TextFields,
            onClick = onOpenFonts,
            trailing = { SettingsChevron() },
        )
    }
    Spacer(Modifier.height(16.dp))
    AppSettingsSection(stringResource(R.string.me_motion)) {
        val choices = listOf(
            Triple(TRANSITION_SLIDE, R.string.me_motion_slide, R.string.me_motion_slide_hint),
            Triple(TRANSITION_FADE, R.string.me_motion_fade, R.string.me_motion_fade_hint),
            Triple(TRANSITION_SCALE, R.string.me_motion_scale, R.string.me_motion_scale_hint),
            Triple(TRANSITION_NONE, R.string.me_motion_none, R.string.me_motion_none_hint),
        )
        choices.forEachIndexed { index, (mode, title, hint) ->
            AppSelectionRow(stringResource(title), settings.transitionStyle == mode,
                onClick = { onTransitionStyle(mode) }, subtitle = stringResource(hint))
            if (index < choices.lastIndex) AppListDivider(false)
        }
    }
    Spacer(Modifier.height(16.dp))
    AppSettingsSection(stringResource(R.string.me_wallpaper)) {
        settings.photoWallpaperPath?.takeIf { it.isNotBlank() }?.let { path ->
            AsyncImage(
                model = File(path),
                contentDescription = stringResource(R.string.me_wallpaper_preview),
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 12.dp)
                    .height(140.dp).clip(RoundedCornerShape(12.dp)),
            )
        }
        AppListRow(
            title = stringResource(if (settings.photoWallpaperPath.isNullOrBlank()) R.string.me_wallpaper_choose else R.string.me_wallpaper_change),
            subtitle = stringResource(R.string.me_wallpaper_choose_hint),
            leadingIcon = Icons.Filled.Wallpaper,
            onClick = onPickWallpaper,
        )
    }
    Spacer(Modifier.height(24.dp))
}
