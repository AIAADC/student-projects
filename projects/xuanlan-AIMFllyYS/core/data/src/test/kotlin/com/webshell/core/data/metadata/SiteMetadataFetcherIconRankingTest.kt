package com.webshell.core.data.metadata

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SiteMetadataFetcherIconRankingTest {

    private val fetcher = SiteMetadataFetcher(okhttp3.OkHttpClient())

    private fun icon(src: String, sizes: String = "", purpose: String = "") =
        mapOf("src" to src, "sizes" to sizes, "purpose" to purpose)

    @Test
    fun `prefers 512px any-purpose icon over larger non-preferred`() {
        val src = fetcher.chooseBestManifestIcon(
            listOf(
                icon("icon-1024.png", sizes = "1024x1024", purpose = "any"),
                icon("icon-512.png", sizes = "512x512", purpose = "any"),
                icon("icon-192.png", sizes = "192x192", purpose = "any"),
            ),
        )
        assertEquals("icon-512.png", src)
    }

    @Test
    fun `skips monochrome-only icons and undersized ones`() {
        val src = fetcher.chooseBestManifestIcon(
            listOf(
                icon("mono-512.png", sizes = "512x512", purpose = "monochrome"),
                icon("tiny-64.png", sizes = "64x64", purpose = "any"),
            ),
        )
        assertNull(src)
    }

    @Test
    fun `falls back to largest when no 512 declared`() {
        val src = fetcher.chooseBestManifestIcon(
            listOf(
                icon("icon-144.png", sizes = "144x144", purpose = "any"),
                icon("icon-256.png", sizes = "256x256", purpose = "maskable"),
                icon("icon-180.png", sizes = "180x180", purpose = ""),
            ),
        )
        assertEquals("icon-256.png", src)
    }

    @Test
    fun `unknown sizes are kept as fallback after valid ones`() {
        val src = fetcher.chooseBestManifestIcon(
            listOf(
                icon("vector.svg"), // 无 sizes
                icon("icon-192.png", sizes = "192x192", purpose = "any"),
            ),
        )
        assertEquals("icon-192.png", src)
    }

    @Test
    fun `missing or blank icons list yields null`() {
        assertNull(fetcher.chooseBestManifestIcon(null))
        assertNull(fetcher.chooseBestManifestIcon(emptyList()))
        assertNull(fetcher.chooseBestManifestIcon(listOf(icon("", sizes = "512x512"))))
    }

    @Test
    fun `parseIconSize reads largest side and ignores non-numeric tokens`() {
        assertEquals(96, fetcher.parseIconSize("48x48 96x96"))
        assertEquals(0, fetcher.parseIconSize("any"))
        assertEquals(0, fetcher.parseIconSize(""))
        assertEquals(180, fetcher.parseIconSize("180x180"))
    }
}
