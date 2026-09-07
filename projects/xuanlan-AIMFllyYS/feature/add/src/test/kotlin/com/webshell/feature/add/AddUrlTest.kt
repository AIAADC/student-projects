package com.webshell.feature.add

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AddUrlTest {
    @Test
    fun `bare hosts normalize once and preserve paths query fragment`() {
        assertEquals("https://example.com/path?q=sample#section", AddUrl.normalize(" example.com/path?q=sample#section "))
        assertEquals("https://example.com", AddUrl.normalize(AddUrl.normalize("example.com").orEmpty()))
        assertEquals("http://localhost:8080/test", AddUrl.normalize("http://localhost:8080/test"))
        assertEquals("HTTPS://example.com", AddUrl.normalize("HTTPS://example.com"))
    }

    @Test
    fun `unsupported or malformed input cannot be saved as an https host`() {
        listOf("", "   ", "https://", "ftp://example.com", "javascript:alert(1)", "file:///etc/passwd", "example.com/path with spaces",
            "example.com:99999", "https://user:secret@example.com", "https://example.com:0").forEach {
            assertNull("Input must be rejected: $it", AddUrl.normalize(it))
        }
    }

    @Test
    fun `host labels never return an invalid url or private query`() {
        assertEquals("example.com", AddUrl.hostLabel("https://www.example.com/?private=value"))
        assertEquals("", AddUrl.hostLabel("not a valid URL"))
    }
}
