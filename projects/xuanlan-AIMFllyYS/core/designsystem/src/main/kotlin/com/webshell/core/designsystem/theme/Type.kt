package com.webshell.core.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.sp
import com.webshell.core.designsystem.R
import com.webshell.core.model.AppFontFamily
import com.webshell.core.model.AppFontScale

/** Existing MiSans subsets are retained byte-for-byte; see the packaged font notices. */
val MiSansFamily = FontFamily(
    Font(R.font.misans_regular, FontWeight.Normal),
    Font(R.font.misans_medium, FontWeight.Medium),
    Font(R.font.misans_semibold, FontWeight.SemiBold),
    Font(R.font.misans_semibold, FontWeight.Bold),
)

@OptIn(ExperimentalTextApi::class)
private val NotoSansScFamily = FontFamily(
    listOf(FontWeight.Normal, FontWeight.Medium, FontWeight.SemiBold, FontWeight.Bold).map {
        Font(
            resId = R.font.noto_sans_sc,
            weight = it,
            variationSettings = FontVariation.Settings(FontVariation.weight(it.weight)),
        )
    },
)

fun appFontFamilyFor(id: String): FontFamily = when (AppFontFamily.normalize(id)) {
    AppFontFamily.SYSTEM -> FontFamily.Default
    AppFontFamily.NOTO_SANS_SC -> NotoSansScFamily
    else -> MiSansFamily
}

private fun fontStyle(family: FontFamily, size: Int, weight: FontWeight, lineHeight: Int) = TextStyle(
    fontFamily = family,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    letterSpacing = 0.sp,
    platformStyle = PlatformTextStyle(includeFontPadding = false),
)

/** Compact semantic hierarchy. Font scaling changes only sp conversion, never token values. */
fun typographyFor(fontFamily: String): Typography {
    val family = appFontFamilyFor(fontFamily)
    fun style(size: Int, weight: FontWeight, lineHeight: Int) =
        fontStyle(family, size, weight, lineHeight)
    return Typography(
        displayLarge = style(32, FontWeight.SemiBold, 42),
        displayMedium = style(28, FontWeight.SemiBold, 37),
        displaySmall = style(24, FontWeight.SemiBold, 32),
        headlineLarge = style(24, FontWeight.SemiBold, 32),
        headlineMedium = style(22, FontWeight.SemiBold, 30),
        headlineSmall = style(20, FontWeight.SemiBold, 27),
        titleLarge = style(17, FontWeight.SemiBold, 23),
        titleMedium = style(16, FontWeight.Medium, 22),
        titleSmall = style(15, FontWeight.Medium, 21),
        bodyLarge = style(16, FontWeight.Normal, 22),
        bodyMedium = style(15, FontWeight.Normal, 21),
        bodySmall = style(13, FontWeight.Normal, 18),
        labelLarge = style(15, FontWeight.Medium, 21),
        labelMedium = style(12, FontWeight.Medium, 16),
        labelSmall = style(11, FontWeight.Medium, 16),
    )
}

/** Captured before app scaling so local previews never multiply the user's setting twice. */
val LocalSystemFontScale = compositionLocalOf { 1f }

@Composable
fun AppTypographyPreview(
    fontFamily: String,
    scalePercent: Int,
    content: @Composable () -> Unit,
) {
    val density = LocalDensity.current
    val fontScale = LocalSystemFontScale.current * AppFontScale.multiplier(scalePercent)
    val previewDensity = remember(density.density, fontScale) { Density(density.density, fontScale) }
    val typography = remember(fontFamily) { typographyFor(fontFamily) }
    CompositionLocalProvider(LocalDensity provides previewDensity) {
        androidx.compose.material3.MaterialTheme(typography = typography, content = content)
    }
}
