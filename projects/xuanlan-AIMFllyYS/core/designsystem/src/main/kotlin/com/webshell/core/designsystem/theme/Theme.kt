package com.webshell.core.designsystem.theme

import android.graphics.BitmapFactory
import androidx.core.graphics.ColorUtils
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import com.webshell.core.model.AppFontFamily
import com.webshell.core.model.AppFontScale
import androidx.palette.graphics.Palette
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** 照片壁纸路径；仅照片主题模式下非空，供主页背景读取 */
val LocalPhotoWallpaperPath = compositionLocalOf<String?> { null }

/** Effective appearance, including the user's explicit override of the system theme. */
val LocalIsDarkTheme = compositionLocalOf { false }

/**
 * Presentation-only theme. The composition root supplies a distinct theme projection from its
 * lifecycle-owned ViewModel; moving a launcher item must never invalidate the entire UI theme.
 */
@Composable
fun WebShellTheme(
    themeMode: String = "system",
    photoWallpaperPath: String? = null,
    transitionStyle: String = "slide",
    appFontFamily: String = AppFontFamily.MISANS,
    appFontScalePercent: Int = AppFontScale.DEFAULT,
    content: @Composable () -> Unit,
) {
    val systemDark = isSystemInDarkTheme()
    val darkTheme = when (themeMode) {
        "light" -> false
        "dark" -> true
        else -> systemDark
    }
    val wallpaperPath = photoWallpaperPath?.takeIf { themeMode == "photo" && it.isNotBlank() }

    // Cached in this lifecycle-owned state, not recomputed when non-theme settings change.
    // Tagging the result with its path prevents even a single frame of the previous photo's accent.
    val photoAccent by produceState<PhotoAccent?>(initialValue = null, wallpaperPath) {
        value = null
        val path = wallpaperPath ?: return@produceState
        value = withContext(Dispatchers.IO) {
            extractSeedColor(path)?.let { PhotoAccent(path, it) }
        }
    }

    val baseScheme = if (darkTheme) AppleDarkColorScheme else AppleLightColorScheme
    val seedColor = photoAccent?.takeIf { it.path == wallpaperPath }?.color
    val colorScheme = remember(baseScheme, seedColor, darkTheme) {
        seedColor?.let { seed ->
            val accent = accessibleAccent(seed, baseScheme.background, darkTheme)
            val onAccent = if (
                ColorUtils.calculateContrast(Color.White.toArgb(), accent.toArgb()) >= 4.5
            ) Color.White else Color.Black
            baseScheme.copy(
                primary = accent,
                onPrimary = onAccent,
                primaryContainer = lerp(baseScheme.surfaceContainerLow, accent, if (darkTheme) 0.24f else 0.13f),
                onPrimaryContainer = baseScheme.onSurface,
                surfaceTint = accent,
            )
        } ?: baseScheme
    }

    val systemDensity = LocalDensity.current
    val appDensity = remember(systemDensity.density, systemDensity.fontScale, appFontScalePercent) {
        Density(systemDensity.density, systemDensity.fontScale * AppFontScale.multiplier(appFontScalePercent))
    }
    val typography = remember(appFontFamily) { typographyFor(appFontFamily) }
    CompositionLocalProvider(
        LocalPhotoWallpaperPath provides wallpaperPath,
        LocalIsDarkTheme provides darkTheme,
        LocalTransitionStyle provides transitionStyle,
        LocalSystemFontScale provides systemDensity.fontScale,
        LocalDensity provides appDensity,
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = typography,
            shapes = WebShellShapes,
            content = content,
        )
    }
}

private data class PhotoAccent(val path: String, val color: Color)

private fun extractSeedColor(path: String): Color? {
    return runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val bitmap = BitmapFactory.decodeFile(
            path,
            BitmapFactory.Options().apply {
                inSampleSize = paletteSampleSize(bounds.outWidth, bounds.outHeight)
            },
        ) ?: return null
        try {
            val palette = Palette.from(bitmap).generate()
            Color(palette.getVibrantColor(palette.getMutedColor(0xFF007AFF.toInt())))
        } finally {
            // Palette owns swatches, not this temporary decoded bitmap.
            bitmap.recycle()
        }
    }.getOrNull()
}

/** Keep photo-derived links and selected controls readable on their actual neutral background. */
private fun accessibleAccent(seed: Color, background: Color, darkTheme: Boolean): Color {
    val target = if (darkTheme) Color.White else Color.Black
    var accent = seed.copy(alpha = 1f)
    repeat(20) {
        if (ColorUtils.calculateContrast(accent.toArgb(), background.toArgb()) >= 4.5) return accent
        accent = lerp(accent, target, 0.1f)
    }
    return accent
}
