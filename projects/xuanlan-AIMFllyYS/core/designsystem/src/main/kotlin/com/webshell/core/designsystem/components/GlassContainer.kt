package com.webshell.core.designsystem.components

import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.hazeEffect
import dev.chrisbanes.haze.materials.HazeMaterials
import com.webshell.core.designsystem.theme.LocalIsDarkTheme

/**
 * Shared dock material: a single bounded Haze backdrop with a restrained static edge light.
 * 全屏实时模糊 backdrop 预算不超过 1 处（当前为底部导航条），见 docs/PERFORMANCE.md。
 */
@Composable
fun Modifier.glassSurface(
    hazeState: HazeState,
    shape: Shape = RoundedCornerShape(32.dp),
    borderWidth: Dp = 0.75.dp,
): Modifier {
    val dark = LocalIsDarkTheme.current
    val surface = MaterialTheme.colorScheme.surface
    val regular = HazeMaterials.regular(surface)
    val material = remember(regular, surface, dark) {
        regular.copy(
            // Explicitly capped; never inherit a material preset above the 24dp budget.
            blurRadius = 20.dp,
            noiseFactor = 0.025f,
            tints = listOf(HazeTint(surface.copy(alpha = if (dark) 0.48f else 0.38f))),
            fallbackTint = HazeTint(surface.copy(alpha = if (dark) 0.90f else 0.88f)),
        )
    }
    return this
        .clip(shape)
        .hazeEffect(state = hazeState, style = material)
        .glassEdgeLight(shape, borderWidth, dark)
}

/**
 * Static translucent material for folders, menus, sheets and floating controls.
 * Deliberately has no HazeState, RenderEffect or animation: only the dock may blur live content.
 * Drawing is cached by size; it cannot participate in measurement or invalidate the launcher grid.
 */
@Composable
fun Modifier.staticGlassSurface(
    shape: Shape = RoundedCornerShape(24.dp),
    tint: Color = MaterialTheme.colorScheme.surfaceContainerHigh,
    opacity: Float = 0.92f,
    borderWidth: Dp = 0.5.dp,
): Modifier = this
    .clip(shape)
    .background(tint.copy(alpha = opacity.coerceIn(0f, 1f)))
    .glassEdgeLight(shape, borderWidth, LocalIsDarkTheme.current)

@Composable
private fun Modifier.glassEdgeLight(shape: Shape, borderWidth: Dp, dark: Boolean): Modifier {
    val rim = remember(dark) {
        Brush.verticalGradient(
            0f to Color.White.copy(alpha = if (dark) 0.28f else 0.80f),
            0.48f to Color.White.copy(alpha = if (dark) 0.07f else 0.16f),
            1f to Color.White.copy(alpha = if (dark) 0.12f else 0.40f),
        )
    }
    return this
        .drawWithCache {
            val reflection = Brush.linearGradient(
                colors = listOf(
                    Color.White.copy(alpha = if (dark) 0.055f else 0.13f),
                    Color.Transparent,
                    Color.Black.copy(alpha = if (dark) 0.035f else 0.018f),
                ),
                start = Offset.Zero,
                end = Offset(size.width, size.height),
            )
            onDrawWithContent {
                drawRect(reflection)
                drawContent()
            }
        }
        .border(borderWidth, rim, shape)
}
