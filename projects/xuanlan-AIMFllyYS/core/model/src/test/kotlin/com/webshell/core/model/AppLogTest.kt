package com.webshell.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class AppLogTest {

    @Before
    fun setUp() {
        AppLog.clear()
    }

    @Test
    fun `log appends entries in order`() {
        AppLog.log("home", "first")
        AppLog.log("home", "second")

        val entries = AppLog.entries()
        assertEquals(2, entries.size)
        assertEquals("first", entries[0].message)
        assertEquals("second", entries[1].message)
    }

    @Test
    fun `buffer evicts oldest beyond capacity`() {
        repeat(AppLog.CAPACITY + 50) { index ->
            AppLog.log("home", "msg-$index")
        }

        val entries = AppLog.entries()
        assertEquals(AppLog.CAPACITY, entries.size)
        assertEquals("msg-50", entries.first().message)
        assertEquals("msg-${AppLog.CAPACITY + 49}", entries.last().message)
    }

    @Test
    fun `exportText contains time tag and message`() {
        AppLog.log("theme", "switched to pure black")

        val text = AppLog.exportText()
        assertTrue(text.contains("[theme]"))
        assertTrue(text.contains("switched to pure black"))
        assertTrue(text.contains(AppLog.formatTime(AppLog.entries().first().timeMillis)))
    }

    @Test
    fun `clear empties the buffer`() {
        AppLog.log("home", "hello")
        AppLog.clear()

        assertTrue(AppLog.entries().isEmpty())
        assertTrue(AppLog.exportText().isEmpty())
    }

    @Test
    fun `log defaults to INFO level`() {
        AppLog.log("home", "plain")

        assertEquals(AppLog.Level.INFO, AppLog.entries().first().level)
    }

    @Test
    fun `warn and error write their levels`() {
        AppLog.warn("web", "degraded")
        AppLog.error("web", "failed")

        val entries = AppLog.entries()
        assertEquals(AppLog.Level.WARN, entries[0].level)
        assertEquals(AppLog.Level.ERROR, entries[1].level)
    }

    @Test
    fun `entrySink receives appended entries`() {
        val received = mutableListOf<AppLog.Entry>()
        AppLog.entrySink = { received.add(it) }
        try {
            AppLog.log("app", "started")
            AppLog.error("web", "boom")
        } finally {
            AppLog.entrySink = null
        }

        assertEquals(2, received.size)
        assertEquals("started", received[0].message)
        assertEquals(AppLog.Level.ERROR, received[1].level)
    }

    @Test
    fun `throwing sink does not break log`() {
        AppLog.entrySink = { error("sink exploded") }
        try {
            AppLog.log("app", "still works")
        } finally {
            AppLog.entrySink = null
        }

        val entries = AppLog.entries()
        assertEquals(1, entries.size)
        assertEquals("still works", entries.first().message)
    }
}
