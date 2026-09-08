package com.webshell.feature.browser

import org.junit.Assert.assertEquals
import org.junit.Test

/** Address presentation must never rewrite the URL held by a tab/session. */
class BrowserUrlPresentationTest {
    @Test
    fun newTabUsesEmptyAddressPresentation() {
        assertEquals("", "about:blank".stripScheme())
    }

    @Test
    fun addressPresentationOnlyRemovesTheWebScheme() {
        assertEquals("example.com/path?q=value#section", "https://example.com/path?q=value#section".stripScheme())
        assertEquals("example.com:8080/", "http://example.com:8080/".stripScheme())
    }

    @Test
    fun localAndOtherSchemesAreNotMisrepresentedAsWebHosts() {
        assertEquals("local://sample/index.html", "local://sample/index.html".stripScheme())
        assertEquals("about:version", "about:version".stripScheme())
    }

    @Test
    fun displayedHostCanStillNavigateThroughExistingNormalizer() {
        assertEquals("https://example.com/path", normalizeUrl("example.com/path"))
        assertEquals("", normalizeUrl("   "))
    }
}
