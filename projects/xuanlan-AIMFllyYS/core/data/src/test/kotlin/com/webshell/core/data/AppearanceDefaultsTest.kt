package com.webshell.core.data

import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.mutablePreferencesOf
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AppearanceDefaultsTest {
    @Test fun legacyPreferencesAndInvalidValuesDecodeWithSafeDefaults() {
        assertEquals("misans" to 100, SettingsRepository.readAppTypography(emptyPreferences()))
        val unknown = mutablePreferencesOf(
            stringPreferencesKey("app_font_family") to "future_font",
            intPreferencesKey("app_font_scale_percent") to 1000,
        )
        assertEquals("misans" to 100, SettingsRepository.readAppTypography(unknown))
    }

    @Test fun atomicTypographyWriteRoundTripsAndPreservesUnrelatedKeys() {
        val legacyKey = intPreferencesKey("grid_columns")
        val prefs = mutablePreferencesOf(legacyKey to 5)
        SettingsRepository.writeAppTypography(prefs, "noto_sans_sc", 115)
        val reloaded = prefs.toPreferences()
        assertEquals("noto_sans_sc" to 115, SettingsRepository.readAppTypography(reloaded))
        assertEquals(5, reloaded[legacyKey])
        SettingsRepository.writeAppTypography(prefs, "system", 90)
        assertEquals("system" to 90, SettingsRepository.readAppTypography(prefs.toPreferences()))
    }

    @Test fun additiveAppearanceDefaultsPreserveLegacyLayout() {
        val settings = HomeSettings()
        assertEquals("misans", settings.appFontFamily)
        assertEquals(100, settings.appFontScalePercent)
        assertTrue(settings.browserAutoCollapse)
        assertEquals(-1f, settings.browserOrbX, 0f)
        assertEquals(4, settings.gridColumns)
        assertEquals(5, settings.gridRows)
        assertEquals(60, settings.iconSizeDp)
    }

    @Test fun orbCoordinatesRejectCorruptionAndClampValidValues() {
        listOf(null, Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY, -5f).forEach {
            assertEquals(-1f, normalizedOrbCoordinate(it), 0f)
        }
        assertEquals(0f, normalizedOrbCoordinate(0f), 0f)
        assertEquals(0.4f, normalizedOrbCoordinate(0.4f), 0f)
        assertEquals(1f, normalizedOrbCoordinate(2f), 0f)
    }
}
