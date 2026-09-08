package com.webshell.feature.home

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import com.webshell.core.data.WebAppEntity

/** In-memory, deterministic, no remote images. Sample URLs are reserved invalid domains. */
@Composable
internal fun rememberHomeCatalogApps(): List<WebAppEntity> {
    val titles = listOf(
        stringResource(R.string.home_catalog_reading), stringResource(R.string.home_catalog_notes),
        stringResource(R.string.home_catalog_music), stringResource(R.string.home_catalog_atlas),
        stringResource(R.string.home_catalog_design), stringResource(R.string.home_catalog_studio),
        stringResource(R.string.home_catalog_canvas), stringResource(R.string.home_catalog_archive),
        stringResource(R.string.home_catalog_books), stringResource(R.string.home_catalog_photos),
        stringResource(R.string.home_catalog_travel),
    )
    return remember(titles) {
        titles.mapIndexed { index, title ->
            WebAppEntity(
                id = "catalog-home-$index", title = title, url = "https://example.invalid/$index", iconUrl = null,
                desktopMode = false, darkMode = false, keepAlive = true,
                isFavorite = index == 1, homePage = 0, homeCellIndex = index,
                folderId = null, createdAt = index.toLong(),
            )
        }
    }
}
