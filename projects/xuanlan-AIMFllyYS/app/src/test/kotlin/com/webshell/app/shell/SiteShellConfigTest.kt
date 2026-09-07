package com.webshell.app.shell

import com.webshell.core.data.WebAppEntity
import com.webshell.core.webengine.ShellConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SiteShellConfigTest {
    private fun site(url: String = "https://example.org/read") = WebAppEntity(
        id = "saved-app", title = "Example", url = url, iconUrl = null,
        desktopMode = true, darkMode = true, keepAlive = true, isFavorite = false,
        homePage = 1, homeCellIndex = 3, folderId = null, createdAt = 0,
        textZoomPercent = 125,
    )

    @Test fun savedAppOwnsExactSessionProfileAndStoredWebZoom() {
        val config = requireNotNull(configuredSiteShell(site()))
        assertEquals("saved-app", config.sessionId)
        assertEquals("saved-app", config.profileId)
        assertEquals(125, config.textZoomPercent)
        assertTrue(config.desktopMode)
        assertTrue(config.algorithmicDark)
        assertEquals(ShellConfig.ExternalLinkPolicy.OPEN_IN_SAME, config.externalLinkPolicy)
    }

    @Test fun savedExternalPolicyAndFavoriteBehaviorArePreserved() {
        assertEquals(ShellConfig.ExternalLinkPolicy.OPEN_IN_BROWSER,
            configuredSiteShell(site().copy(externalLinksToBrowser = true))?.externalLinkPolicy)
        assertEquals(ShellConfig.ExternalLinkPolicy.OPEN_IN_BROWSER,
            configuredSiteShell(site().copy(isFavorite = true))?.externalLinkPolicy)
    }

    @Test fun importedLocalSiteMapsOnlyItsOwnSavedDirectory() {
        val app = site("local://saved-app/index.html").copy(isLocal = true)
        val config = requireNotNull(configuredSiteShell(app))
        assertEquals("https://appassets.androidplatform.net/local/saved-app/index.html", config.startUrl)
        assertEquals(125, config.textZoomPercent)
        assertNull(configuredSiteShell(app.copy(url = "local://other-app/index.html")))
        assertNull(configuredSiteShell(app.copy(url = "local://saved-app/%2e%2e/other/index.html")))
    }

    @Test fun directLaunchAcceptsWebUrlsButNotPrivilegedSchemesOrCredentials() {
        assertEquals("https://example.org/read?q=value", validatedExternalSiteUrl("https://example.org/read?q=value"))
        assertNotNull(validatedExternalSiteUrl("http://localhost:8080/test"))
        assertNotNull(validatedExternalSiteUrl("https://appassets.androidplatform.net/assets/local_demo.html"))
        listOf("javascript:alert(1)", "file:///data/private", "content://private", "intent://open",
            "local://saved-app/index.html", "https://user:pass@example.org", "https://example.org:99999",
            "https://appassets.androidplatform.net/local/saved-app/index.html", "https://example.org/with space",
        ).forEach { assertNull(it, validatedExternalSiteUrl(it)) }
    }

    @Test fun defaultWebsiteZoomRemainsUnscaled() {
        val config = requireNotNull(configuredSiteShell(site().copy(textZoomPercent = 100, desktopMode = false)))
        assertEquals(100, config.textZoomPercent)
        assertFalse(config.desktopMode)
    }
}
