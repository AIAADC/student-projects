package com.webshell.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.core.view.WindowCompat
import com.webshell.app.catalog.CatalogRegistry
import com.webshell.app.catalog.PlaybookScreen
import com.webshell.core.designsystem.theme.WebShellTheme
import com.webshell.core.model.AppFontFamily
import com.webshell.core.model.AppFontScale

/** Debug-only activity hosts the exact production theme/catalog, with no ViewModels or real data. */
class CatalogHarnessActivity : ComponentActivity() {
    private var entryId by mutableStateOf<String?>(null)
    private val knownIds by lazy { CatalogRegistry.entries().mapTo(hashSetOf()) { it.id } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val family = AppFontFamily.normalize(intent.getStringExtra(EXTRA_FONT_FAMILY))
        val scale = AppFontScale.normalize(intent.getIntExtra(EXTRA_FONT_PERCENT, AppFontScale.DEFAULT))
        val theme = if (intent.getStringExtra(EXTRA_THEME) == "dark") "dark" else "light"
        val systemScale = intent.getFloatExtra(EXTRA_SYSTEM_FONT_SCALE, 0f)
            .takeIf { it.isFinite() && it in 0.5f..3f }
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = theme == "light"
            isAppearanceLightNavigationBars = theme == "light"
        }
        showEntry(intent.getStringExtra(EXTRA_ENTRY_ID))
        setContent {
            val platformDensity = LocalDensity.current
            val density = systemScale?.let { Density(platformDensity.density, it) } ?: platformDensity
            CompositionLocalProvider(LocalDensity provides density) {
                WebShellTheme(
                    themeMode = theme, transitionStyle = "none", appFontFamily = family, appFontScalePercent = scale,
                ) {
                    key(entryId) { PlaybookScreen(onBack = { finish() }, initialEntryId = entryId) }
                }
            }
        }
    }

    /** Instrumentation switches real catalog entries without reopening the process or adding UI. */
    fun showEntry(id: String?) {
        require(id == null || id in knownIds) { "Unknown catalog scene" }
        entryId = id
    }

    companion object {
        const val EXTRA_ENTRY_ID = "initialEntryId"
        const val EXTRA_FONT_FAMILY = "fontFamily"
        const val EXTRA_FONT_PERCENT = "fontPercent"
        const val EXTRA_SYSTEM_FONT_SCALE = "systemFontScale"
        const val EXTRA_THEME = "theme"
    }
}
