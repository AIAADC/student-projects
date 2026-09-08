package com.webshell.core.designsystem.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

// 苹果式浅灰底白卡/纯黑基底，全部 token 显式定义，杜绝 M3 默认紫色泄漏。
// 浅色 = iOS 分组规范：背景灰 #F2F2F7 托纯白卡片；次要文字 #55555B（白卡 7.4:1，达 AAA）。
// 规则：副标题用 onSurfaceVariant；outline/outlineVariant 只用于描边与分割线。见 docs/DESIGN.md

internal val AppleBlue = Color(0xFF007AFF)
internal val AppleBlueDark = Color(0xFF0A84FF)

internal val AppleLightColorScheme = lightColorScheme(
    primary = AppleBlue,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD6E9FF),
    onPrimaryContainer = Color(0xFF003A75),
    secondary = Color(0xFF55555B),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFF2F2F7),
    onSecondaryContainer = Color(0xFF1C1C1E),
    tertiary = Color(0xFF55555B),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFF2F2F7),
    onTertiaryContainer = Color(0xFF1C1C1E),
    background = Color(0xFFF2F2F7),
    onBackground = Color(0xFF1C1C1E),
    surface = Color.White,
    onSurface = Color(0xFF1C1C1E),
    surfaceVariant = Color(0xFFE5E5EA),
    onSurfaceVariant = Color(0xFF55555B),
    surfaceTint = AppleBlue,
    inverseSurface = Color(0xFF1C1C1E),
    inverseOnSurface = Color(0xFFF2F2F7),
    inversePrimary = AppleBlueDark,
    surfaceDim = Color(0xFFE5E5EA),
    surfaceBright = Color.White,
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color.White,
    surfaceContainer = Color(0xFFF2F2F7),
    surfaceContainerHigh = Color(0xFFECECF1),
    surfaceContainerHighest = Color(0xFFE5E5EA),
    outline = Color(0xFFD1D1D6),
    outlineVariant = Color(0xFFE5E5EA),
    error = Color(0xFFFF3B30),
    onError = Color.White,
    errorContainer = Color(0xFFFFE5E3),
    onErrorContainer = Color(0xFF5A1210),
    scrim = Color.Black,
)

internal val AppleDarkColorScheme = darkColorScheme(
    primary = AppleBlueDark,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF12355E),
    onPrimaryContainer = Color(0xFFD6E9FF),
    secondary = Color(0xFFAEAEB2),
    onSecondary = Color(0xFF1C1C1E),
    secondaryContainer = Color(0xFF2C2C2E),
    onSecondaryContainer = Color(0xFFF2F2F7),
    tertiary = Color(0xFF8E8E93),
    onTertiary = Color(0xFF1C1C1E),
    tertiaryContainer = Color(0xFF2C2C2E),
    onTertiaryContainer = Color(0xFFF2F2F7),
    background = Color.Black,
    onBackground = Color(0xFFF2F2F7),
    surface = Color.Black,
    onSurface = Color(0xFFF2F2F7),
    surfaceVariant = Color(0xFF1C1C1E),
    onSurfaceVariant = Color(0xFFAEAEB2),
    surfaceTint = AppleBlueDark,
    inverseSurface = Color(0xFFF2F2F7),
    inverseOnSurface = Color(0xFF1C1C1E),
    inversePrimary = AppleBlue,
    surfaceDim = Color.Black,
    surfaceBright = Color(0xFF2C2C2E),
    surfaceContainerLowest = Color.Black,
    surfaceContainerLow = Color(0xFF1C1C1E),
    surfaceContainer = Color(0xFF1C1C1E),
    surfaceContainerHigh = Color(0xFF2C2C2E),
    surfaceContainerHighest = Color(0xFF3A3A3C),
    outline = Color(0xFF3A3A3C),
    outlineVariant = Color(0xFF2C2C2E),
    error = Color(0xFFFF453A),
    onError = Color.Black,
    errorContainer = Color(0xFF5A1614),
    onErrorContainer = Color(0xFFFFD7D4),
    scrim = Color.Black,
)
