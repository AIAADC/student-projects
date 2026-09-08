package com.webshell.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import com.webshell.core.designsystem.theme.LocalIsDarkTheme
import java.io.File

/** The app-owned Playbook disables loading even when a visitor edits a fixture's URL. */
val LocalImageLoadingEnabled = compositionLocalOf { true }

/**
 * The single website-icon loader. Callers map domain models to these presentation values.
 * The frame is deterministic, loading and error use the same fallback, and Coil owns all IO.
 */
@Composable
fun SiteIcon(
    title: String,
    iconUrl: String?,
    modifier: Modifier = Modifier,
    size: Dp = 60.dp,
    cornerRadiusPercent: Int = 26,
    localFallback: Boolean = false,
) {
    val shape = RoundedCornerShape(cornerRadiusPercent.coerceIn(0, 50))
    val loadingEnabled = LocalImageLoadingEnabled.current
    val model = remember(iconUrl, loadingEnabled) {
        if (!loadingEnabled) return@remember null
        iconUrl?.takeIf { it.isNotBlank() }?.let { url ->
            when {
                url.startsWith("/") -> File(url)
                url.startsWith("https://", true) || url.startsWith("http://", true) -> url
                else -> null
            }
        }
    }
    var imageLoaded by remember(model) { mutableStateOf(false) }
    Box(
        modifier = modifier.size(size).clip(shape).semantics { contentDescription = title },
        contentAlignment = Alignment.Center,
    ) {
        if (!imageLoaded || model == null) SiteIconFallback(title, size, localFallback)
        if (model != null) {
            AsyncImage(
                model = model,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                onState = { imageLoaded = it is AsyncImagePainter.State.Success },
                modifier = Modifier.fillMaxSize().then(if (imageLoaded) Modifier.background(Color.White) else Modifier),
            )
        }
    }
}

@Composable
private fun SiteIconFallback(title: String, size: Dp, localFallback: Boolean) {
    val dark = LocalIsDarkTheme.current
    val palette = if (dark) fallbackPaletteDark else fallbackPaletteLight
    val key = remember(title) { title.trim().ifBlank { "?" } }
    val colors = palette[key.codePointAt(0).mod(palette.size)]
    // A fallback glyph is artwork, not a reading label. Keep it inside the fixed icon frame.
    val glyphScale = LocalDensity.current.fontScale
    Box(Modifier.fillMaxSize().background(colors.first), contentAlignment = Alignment.Center) {
        if (localFallback) Icon(Icons.Rounded.Code, null, tint = colors.second, modifier = Modifier.size(size * 0.52f))
        else Text(
            key.substring(0, key.offsetByCodePoints(0, 1)).uppercase(),
            style = MaterialTheme.typography.titleLarge.copy(
                fontSize = (size.value * 0.4f / glyphScale).sp,
                lineHeight = (size.value * 0.52f / glyphScale).sp,
            ),
            color = colors.second,
            maxLines = 1,
        )
    }
}

private val fallbackPaletteLight = listOf(
    Color(0xFFDCE9FF) to Color(0xFF0B3D91), Color(0xFFDDF3E4) to Color(0xFF0B5D3B),
    Color(0xFFFCE3EC) to Color(0xFF8A1B4E), Color(0xFFFFF0D6) to Color(0xFF7A4E00),
    Color(0xFFE9E2FB) to Color(0xFF4A2C93), Color(0xFFDDF1F4) to Color(0xFF0B5563),
)
private val fallbackPaletteDark = listOf(
    Color(0xFF1D3A6E) to Color(0xFFD6E4FF), Color(0xFF14532D) to Color(0xFFD9F2E3),
    Color(0xFF6B1B41) to Color(0xFFFBDCE8), Color(0xFF7A4A00) to Color(0xFFFFE9C2),
    Color(0xFF3B2A73) to Color(0xFFE6DFFC), Color(0xFF0E4A55) to Color(0xFFD3EEF3),
)
