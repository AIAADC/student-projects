package com.webshell.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import com.webshell.core.designsystem.theme.LocalIsDarkTheme
import com.webshell.core.designsystem.theme.LocalPhotoWallpaperPath
import java.io.File

/**
 * Static, resolution-independent wallpaper. Paths/brushes are cached per size; no shaders,
 * timers, blur or bitmap allocation run during drag. The only photo decode belongs here.
 */
@Composable
internal fun LauncherBackdrop(modifier: Modifier = Modifier) {
    val dark = LocalIsDarkTheme.current
    val photo = LocalPhotoWallpaperPath.current
    val context = LocalContext.current
    Box(modifier.drawWithCache {
        val w = size.width
        val h = size.height
        val base = Brush.linearGradient(
            if (dark) listOf(Color(0xFF192B54), Color(0xFF111535), Color(0xFF281D50))
            else listOf(Color(0xFF356CAC), Color(0xFF4265BD), Color(0xFF443D88)),
            start = Offset.Zero, end = Offset(w, h),
        )
        val cyanRibbon = Path().apply {
            moveTo(-w * .18f, -h * .08f)
            cubicTo(w * .96f, -h * .12f, w * 1.40f, h * .22f, w * .66f, h * .52f)
            cubicTo(w * .04f, h * .76f, w * .37f, h * .91f, w * 1.12f, h * 1.08f)
            lineTo(-w * .15f, h * 1.08f)
            cubicTo(-w * .59f, h * .62f, w * .50f, h * .46f, w * .36f, h * .23f)
            cubicTo(w * .28f, h * .10f, w * .01f, h * .08f, -w * .18f, -h * .08f)
            close()
        }
        val cyan = Brush.linearGradient(
            if (dark) listOf(Color(0xFF1E768D), Color(0xFF29489A), Color(0xFF49337F))
            else listOf(Color(0xFF66C9DD), Color(0xFF458BCF), Color(0xFF7374C9)),
            start = Offset(w * .7f, 0f), end = Offset(w * .1f, h),
        )
        val innerFold = Path().apply {
            moveTo(w * 1.05f, h * .30f)
            cubicTo(w * .68f, h * .42f, w * .02f, h * .62f, w * .27f, h * .83f)
            cubicTo(w * .44f, h * .97f, w * .80f, h * .97f, w * 1.05f, h * 1.04f)
            close()
        }
        val fold = Brush.linearGradient(
            if (dark) listOf(Color(0xFF10305F), Color(0xFF324579), Color(0xFF5B4673))
            else listOf(Color(0xFF294B9C), Color(0xFF748CDA), Color(0xFFBAA8D1)),
            start = Offset(w * .40f, h * .48f), end = Offset(w, h),
        )
        val topVeil = Brush.verticalGradient(
            0f to Color.Black.copy(alpha = .18f),
            .20f to Color.Transparent,
            .78f to Color.Transparent,
            1f to Color.Black.copy(alpha = .12f),
        )
        onDrawBehind {
            drawRect(base)
            drawPath(cyanRibbon, cyan)
            drawPath(innerFold, fold)
            drawRect(topVeil)
        }
    }) {
        if (photo != null) {
            val request = remember(photo, context) {
                ImageRequest.Builder(context).data(File(photo)).build()
            }
            // AsyncImage uses the measured screen constraints to downsample on its IO executor.
            AsyncImage(
                model = request,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
            Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = if (dark) .38f else .28f)))
        }
    }
}
