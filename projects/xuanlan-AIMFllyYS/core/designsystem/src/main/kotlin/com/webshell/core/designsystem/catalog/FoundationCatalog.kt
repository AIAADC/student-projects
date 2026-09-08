package com.webshell.core.designsystem.catalog

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.R
import com.webshell.core.designsystem.components.AppCard
import com.webshell.core.designsystem.components.AppPrimaryButton
import com.webshell.core.designsystem.components.staticGlassSurface
import com.webshell.core.designsystem.theme.AppMotion
import com.webshell.core.designsystem.theme.AppSpacing

internal fun foundationCatalog(): List<CatalogEntry> = listOf(
    CatalogEntry("design.colors", CatalogCategory.FOUNDATIONS, R.string.catalog_colors, R.string.catalog_colors_hint, layout = CatalogLayout.ScrollContent) { ColorSamples() },
    CatalogEntry("design.typography", CatalogCategory.FOUNDATIONS, R.string.catalog_typography, R.string.catalog_typography_hint, layout = CatalogLayout.ScrollContent) { TypographySamples() },
    CatalogEntry("design.shape-spacing", CatalogCategory.FOUNDATIONS, R.string.catalog_spacing, R.string.catalog_spacing_hint, layout = CatalogLayout.ScrollContent) { ShapeSpacingSamples() },
    CatalogEntry("design.motion", CatalogCategory.FOUNDATIONS, R.string.catalog_motion, R.string.catalog_motion_hint, layout = CatalogLayout.ScrollContent) { MotionSample() },
    CatalogEntry("design.glass", CatalogCategory.FOUNDATIONS, R.string.catalog_glass, R.string.catalog_glass_hint, layout = CatalogLayout.ScrollContent) { GlassSample() },
)

@Composable
private fun ColorSamples() {
    val c = MaterialTheme.colorScheme
    val colors = listOf(
        "primary" to c.primary, "onPrimary" to c.onPrimary, "primaryContainer" to c.primaryContainer,
        "onPrimaryContainer" to c.onPrimaryContainer, "background" to c.background, "onBackground" to c.onBackground,
        "surface" to c.surface, "onSurface" to c.onSurface, "onSurfaceVariant" to c.onSurfaceVariant,
        "surfaceContainerLow" to c.surfaceContainerLow, "surfaceContainer" to c.surfaceContainer,
        "surfaceContainerHigh" to c.surfaceContainerHigh, "surfaceContainerHighest" to c.surfaceContainerHighest,
        "outline" to c.outline, "outlineVariant" to c.outlineVariant, "error" to c.error, "onError" to c.onError,
    )
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        colors.forEach { (name, value) ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(28.dp).clip(MaterialTheme.shapes.extraSmall).background(value))
                Text("$name · #${value.toArgb().toUInt().toString(16).uppercase()}",
                    style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun TypographySamples() {
    val t = MaterialTheme.typography
    val styles = listOf(
        "displayLarge" to t.displayLarge, "displayMedium" to t.displayMedium, "displaySmall" to t.displaySmall,
        "headlineLarge" to t.headlineLarge, "headlineMedium" to t.headlineMedium, "headlineSmall" to t.headlineSmall,
        "titleLarge" to t.titleLarge, "titleMedium" to t.titleMedium, "titleSmall" to t.titleSmall,
        "bodyLarge" to t.bodyLarge, "bodyMedium" to t.bodyMedium, "bodySmall" to t.bodySmall,
        "labelLarge" to t.labelLarge, "labelMedium" to t.labelMedium, "labelSmall" to t.labelSmall,
    )
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        styles.forEach { (name, style) ->
            Column {
                Text("$name · ${style.fontSize.value.toInt()}/${style.lineHeight.value.toInt()} sp · ${style.fontWeight?.weight}",
                    style = t.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(stringResource(R.string.catalog_sample_text), style = style)
            }
        }
    }
}

@Composable
private fun ShapeSpacingSamples() {
    val density = LocalDensity.current
    val shapes = MaterialTheme.shapes
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        listOf("extraSmall" to shapes.extraSmall, "small" to shapes.small, "medium" to shapes.medium,
            "large" to shapes.large, "extraLarge" to shapes.extraLarge).forEach { (name, shape) ->
            val corner = shape.topStart.toPx(Size(100f, 100f), density) / density.density
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.size(44.dp).clip(shape).background(MaterialTheme.colorScheme.primaryContainer))
                Text("$name · ${corner.toInt()} dp", style = MaterialTheme.typography.bodySmall)
            }
        }
        listOf("xs" to AppSpacing.xs, "sm" to AppSpacing.sm, "md" to AppSpacing.md,
            "lg" to AppSpacing.lg, "xl" to AppSpacing.xl, "xxl" to AppSpacing.xxl).forEach { (name, value) ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(Modifier.width(value).height(8.dp).background(MaterialTheme.colorScheme.primary))
                Text("$name · ${value.value.toInt()} dp", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun MotionSample() {
    var moved by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(stringResource(R.string.catalog_motion_values, AppMotion.FastMs, AppMotion.NormalMs),
            style = MaterialTheme.typography.bodySmall)
        BoxWithConstraints(Modifier.fillMaxWidth().height(52.dp)) {
            val offset by animateDpAsState(
                if (moved) (maxWidth - 36.dp).coerceAtLeast(0.dp) else 0.dp,
                animationSpec = AppMotion.spring(), label = "catalog-motion",
            )
            Box(Modifier.offset(x = offset).size(36.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
        }
        AppPrimaryButton(stringResource(R.string.catalog_toggle_motion), { moved = !moved })
    }
}

@Composable
private fun GlassSample() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(
            Modifier.fillMaxWidth().height(140.dp).clip(MaterialTheme.shapes.large)
                .background(Brush.linearGradient(listOf(Color(0xFF81D6F6), Color(0xFF1479E9), Color(0xFF184D90)))),
            contentAlignment = Alignment.Center,
        ) {
            Box(Modifier.staticGlassSurface(MaterialTheme.shapes.large, opacity = 0.82f).padding(16.dp)) {
                Text(stringResource(R.string.catalog_glass), style = MaterialTheme.typography.bodyLarge)
            }
        }
        AppCard { Text(stringResource(R.string.catalog_glass_hint), style = MaterialTheme.typography.bodySmall) }
    }
}
