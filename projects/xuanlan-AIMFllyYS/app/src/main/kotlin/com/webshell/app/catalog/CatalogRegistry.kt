package com.webshell.app.catalog

import com.webshell.core.designsystem.catalog.CatalogEntry
import com.webshell.core.designsystem.catalog.designSystemCatalog
import com.webshell.feature.add.addCatalog
import com.webshell.feature.browser.browserCatalog
import com.webshell.feature.home.homeCatalog
import com.webshell.feature.me.settingsCatalog

/** app is the only cross-feature aggregation layer. No feature imports the app or another UI. */
object CatalogRegistry {
    fun entries(): List<CatalogEntry> = (designSystemCatalog() + homeCatalog() + addCatalog() +
        browserCatalog() + settingsCatalog() + appCatalog()).also { entries ->
        require(entries.map { it.id }.distinct().size == entries.size) { "Duplicate production catalog ID" }
    }
}
