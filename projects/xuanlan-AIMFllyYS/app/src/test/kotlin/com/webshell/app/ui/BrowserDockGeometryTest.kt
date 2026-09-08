package com.webshell.app.ui

import org.junit.Assert.*
import org.junit.Test

class BrowserDockGeometryTest {
    @Test fun `anchors stay in safe rectangle across phone and landscape bounds`() {
        for (width in listOf(320f, 411f, 800f)) for (height in listOf(230f, 500f, 850f)) {
            val bounds = DockBounds(width, height)
            for (x in listOf(-1f, 0f, .5f, 1f, Float.NaN)) {
                val anchor = OrbAnchor.restored(x, x)
                assertTrue(bounds.centerX(anchor) in bounds.minX..bounds.maxX)
                assertTrue(bounds.centerY(anchor) in bounds.minY..bounds.maxY)
            }
        }
    }
    @Test fun `drop snaps to side and parks only near edge`() {
        val bounds = DockBounds(320f, 600f)
        assertTrue(bounds.isEdgeDrop(bounds.minX))
        assertTrue(bounds.isEdgeDrop(bounds.maxX))
        assertTrue(bounds.isEdgeDrop(bounds.minX + 35f))
        assertTrue(bounds.isEdgeDrop(bounds.maxX - 35f))
        assertFalse(bounds.isEdgeDrop((bounds.minX + bounds.maxX) / 2f))
        assertEquals(0f, bounds.anchorAt(90f, 100f).x)
        assertEquals(1f, bounds.anchorAt(290f, 5000f).y)
    }
}
