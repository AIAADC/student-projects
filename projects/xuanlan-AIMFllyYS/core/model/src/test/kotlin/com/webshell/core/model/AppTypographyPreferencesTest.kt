package com.webshell.core.model

import org.junit.Assert.assertEquals
import org.junit.Test

class AppTypographyPreferencesTest {
    @Test fun fontIdsAreStableAndUnknownValuesUseDefault() {
        assertEquals(listOf("misans", "system", "noto_sans_sc"), AppFontFamily.all)
        AppFontFamily.all.forEach { assertEquals(it, AppFontFamily.normalize(it)) }
        listOf(null, "", "MiSans", "future_font").forEach {
            assertEquals(AppFontFamily.MISANS, AppFontFamily.normalize(it))
        }
    }

    @Test fun supportedScaleStepsRoundTripWithoutChangingTheDefault() {
        for (value in 90..130 step 5) assertEquals(value, AppFontScale.normalize(value))
        listOf(null, -1, 0, 89, 91, 129, 131, Int.MAX_VALUE).forEach {
            assertEquals(100, AppFontScale.normalize(it))
        }
        assertEquals(0.9f, AppFontScale.multiplier(90), 0.0001f)
        assertEquals(1.3f, AppFontScale.multiplier(130), 0.0001f)
        assertEquals(1f, AppFontScale.multiplier(500), 0.0001f)
    }
}
