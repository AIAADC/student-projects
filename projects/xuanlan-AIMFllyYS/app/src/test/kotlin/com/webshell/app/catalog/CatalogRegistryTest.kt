package com.webshell.app.catalog

import com.webshell.core.designsystem.catalog.CatalogCategory
import org.junit.Assert.*
import org.junit.Test

class CatalogRegistryTest {
    @Test fun `production registry IDs unique and every family represented`() {
        val entries = CatalogRegistry.entries()
        assertEquals(entries.size, entries.distinctBy { it.id }.size)
        assertEquals(CatalogCategory.entries.toSet(), entries.map { it.category }.toSet())
        assertTrue(entries.all { it.titleRes != 0 && it.descriptionRes != 0 })
        val ids = entries.map { it.id }.toSet()
        assertTrue(ids.containsAll(setOf("app.dock", "app.browser-dock", "design.fields", "design.selection",
            "design.confirm-dialog", "home.folder", "home.rename", "home.library", "add.editor",
            "settings.fonts", "settings.logs")))
        assertTrue(entries.any { it.id.startsWith("browser.") })
    }
}
