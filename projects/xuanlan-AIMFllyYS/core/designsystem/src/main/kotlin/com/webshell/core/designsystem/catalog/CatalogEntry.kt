package com.webshell.core.designsystem.catalog

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable

/** Catalog uses actual stateless production components with isolated, non-persistent fixtures. */
data class CatalogEntry(
    val id: String,
    val category: CatalogCategory,
    @StringRes val titleRes: Int,
    @StringRes val descriptionRes: Int,
    /** Viewport scenes own their scroll/layout; flow samples receive a host scrolling Column. */
    val layout: CatalogLayout = CatalogLayout.Viewport,
    val content: @Composable () -> Unit,
)

enum class CatalogCategory {
    FOUNDATIONS, NAVIGATION, FORMS, CONTENT, OVERLAYS, HOME, BROWSER, DEVELOPER,
}

enum class CatalogLayout { Viewport, ScrollContent }
