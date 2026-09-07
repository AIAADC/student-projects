package com.webshell.feature.add

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AddDraftMappingTest {
    @Test
    fun `new shortcuts always use default website zoom and assigned stable slot`() {
        val entity = AddDraft(url = "example.com", title = "  Reading  ").toNewEntity(2, 4, 123L, "new-site")
        assertEquals(100, entity.textZoomPercent)
        assertEquals("https://example.com", entity.url)
        assertEquals("Reading", entity.title)
        assertEquals("new-site", entity.id)
        assertEquals(2, entity.homePage)
        assertEquals(4, entity.homeCellIndex)
        assertEquals(123L, entity.createdAt)
        assertFalse(entity.isFavorite)
        assertNull(entity.folderId)
    }

    @Test
    fun `local html retains its entry and settings without normalization`() {
        val draft = AddDraft(
            appId = "local-example", url = "local://local-example/index.html", title = "Offline",
            iconUrl = "/private/icons/imported.img", isLocal = true,
            desktopMode = true, darkMode = true, keepAlive = false, externalLinksToBrowser = true,
        )
        val entity = draft.toNewEntity(0, -1, 20L, "unused")
        assertEquals(draft.appId, entity.id)
        assertEquals(draft.url, entity.url)
        assertEquals(draft.iconUrl, entity.iconUrl)
        assertTrue(entity.isLocal)
        assertTrue(entity.desktopMode)
        assertTrue(entity.darkMode)
        assertFalse(entity.keepAlive)
        assertTrue(entity.externalLinksToBrowser)
        assertEquals(100, entity.textZoomPercent)
    }

    @Test
    fun `invalid icons are removed and absent title falls back only to host`() {
        val entity = AddDraft(url = "https://example.com/?private=value", iconUrl = "javascript:alert(1)")
            .toNewEntity(0, 0, 0, "example")
        assertEquals("example.com", entity.title)
        assertNull(entity.iconUrl)
    }

    @Test(expected = IllegalArgumentException::class)
    fun `save boundary rejects invalid remote scheme`() {
        AddDraft(url = "ftp://example.com").toNewEntity(0, 0, 0, "example")
    }
}
