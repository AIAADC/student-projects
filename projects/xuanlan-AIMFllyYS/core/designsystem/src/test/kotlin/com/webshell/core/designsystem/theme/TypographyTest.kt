package com.webshell.core.designsystem.theme

import com.webshell.core.model.AppFontFamily
import org.junit.Assert.assertEquals
import org.junit.Test

class TypographyTest {
    @Test fun compactSemanticTokensAreSingleSourceOfTruth() {
        val typography = typographyFor(AppFontFamily.MISANS)
        assertEquals(24f, typography.headlineLarge.fontSize.value, 0f)
        assertEquals(32f, typography.headlineLarge.lineHeight.value, 0f)
        assertEquals(17f, typography.titleLarge.fontSize.value, 0f)
        assertEquals(23f, typography.titleLarge.lineHeight.value, 0f)
        assertEquals(16f, typography.bodyLarge.fontSize.value, 0f)
        assertEquals(22f, typography.bodyLarge.lineHeight.value, 0f)
        assertEquals(15f, typography.bodyMedium.fontSize.value, 0f)
        assertEquals(13f, typography.bodySmall.fontSize.value, 0f)
        assertEquals(12f, typography.labelMedium.fontSize.value, 0f)
        assertEquals(11f, typography.labelSmall.fontSize.value, 0f)
    }
}
