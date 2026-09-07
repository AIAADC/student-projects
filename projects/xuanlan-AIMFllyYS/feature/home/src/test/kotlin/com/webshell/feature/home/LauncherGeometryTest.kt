package com.webshell.feature.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LauncherGeometryTest {
    @Test
    fun `standard desktop uses sixty point icons with spacious fixed rows`() {
        val geometry = LauncherGeometry.resolve(393f, 690f, 4, 5, 60f, true)
        assertEquals(60f, geometry.iconSizeDp, 0.001f)
        assertEquals(85f, geometry.cellHeightDp, 0.001f)
        assertEquals(32f, geometry.rowGapDp, 0.001f)
    }

    @Test
    fun `all columns fit and short dense pages explicitly opt into scrolling`() {
        for (width in listOf(320f, 360f, 393f, 430f, 600f, 840f)) {
            for (height in listOf(255f, 320f, 480f, 620f, 780f)) {
                for (columns in 3..6) {
                    for (rows in 3..8) {
                        for (showLabels in listOf(false, true)) {
                            val g = LauncherGeometry.resolve(width, height, columns, rows, 88f, showLabels)
                            val usedWidth = g.horizontalPaddingDp * 2 +
                                (g.iconSizeDp + 6f) * columns + g.columnGapDp * (columns - 1)
                            val usedHeight = g.topPaddingDp + g.bottomPaddingDp +
                                g.cellHeightDp * rows + g.rowGapDp * (rows - 1)
                            assertTrue("width=$width columns=$columns", usedWidth <= width + 0.01f)
                            assertTrue("height=$height rows=$rows", usedHeight <= height + 0.01f || g.requiresVerticalScroll)
                            if (g.requiresVerticalScroll) assertTrue(g.iconSizeDp >= 24f)
                            assertTrue(g.iconSizeDp > 0f)
                        }
                    }
                }
            }
        }
    }

    @Test
    fun `layout is deterministic and does not depend on app count or bitmap size`() {
        val first = LauncherGeometry.resolve(360f, 640f, 4, 5, 56f, true)
        val afterImageLoaded = LauncherGeometry.resolve(360f, 640f, 4, 5, 56f, true)
        assertEquals(first, afterImageLoaded)
    }

    @Test
    fun `dense compact desktop budgets increased label line height before icons`() {
        val geometry = LauncherGeometry.resolve(320f, 610f, 6, 7, 88f, true, fontScale = 1.5f)
        assertTrue(geometry.cellHeightDp - geometry.iconSizeDp >= 16f * 1.5f + 5f)
        val usedHeight = geometry.topPaddingDp + geometry.bottomPaddingDp +
            geometry.cellHeightDp * 7 + geometry.rowGapDp * 6
        assertTrue(usedHeight <= 610.01f)
        val usedWidth = geometry.horizontalPaddingDp * 2 +
            (geometry.iconSizeDp + 6) * 6 + geometry.columnGapDp * 5
        assertTrue(usedWidth <= 320.01f)
    }

    @Test
    fun `landscape always reserves the actual search touch target and bottom margin`() {
        val geometry = LauncherGeometry.resolve(600f, 255f, 4, 5, 60f, true)
        assertTrue(geometry.bottomPaddingDp >= LauncherGeometry.SEARCH_FOOTER_HEIGHT_DP)
        val finalCellBottom = geometry.topPaddingDp + geometry.cellHeightDp * 5 + geometry.rowGapDp * 4
        assertTrue(finalCellBottom <= 255f - 52f + 0.01f || geometry.requiresVerticalScroll)
    }

    @Test
    fun `fixed header clears done target without moving the desktop when editing starts`() {
        for (fontScale in listOf(1f, 1.5f, 2f)) {
            val beforeEdit = LauncherGeometry.resolve(393f, 690f, 4, 5, 60f, true, fontScale)
            val duringEdit = LauncherGeometry.resolve(393f, 690f, 4, 5, 60f, true, fontScale)
            assertEquals(beforeEdit, duringEdit)
            assertTrue(beforeEdit.topPaddingDp >= 48f)
            assertTrue(beforeEdit.topPaddingDp >= 21f * fontScale + 16f)
            assertTrue(beforeEdit.bottomPaddingDp >= 21f * fontScale + 20f)
        }
    }

    @Test
    fun `single cell and invalid dimensions cannot divide by zero`() {
        val single = LauncherGeometry.resolve(320f, 480f, 1, 1, 60f, true)
        assertEquals(0f, single.rowGapDp, 0.001f)
        val invalid = LauncherGeometry.resolve(Float.NaN, Float.POSITIVE_INFINITY, 0, 0, 60f, false)
        assertTrue(invalid.iconSizeDp.isFinite())
        assertTrue(invalid.cellHeightDp.isFinite())
    }

    @Test
    fun `measured text wins over the linear scale estimate without clipping`() {
        val measured = LauncherGeometry.resolve(
            320f, 480f, 4, 5, 60f, true, fontScale = 2.6f,
            measuredLabelHeightDp = 49f, measuredHeaderHeightDp = 76f, measuredFooterHeightDp = 130f,
        )
        assertEquals(54f, measured.cellHeightDp - measured.iconSizeDp, 0.001f)
        assertTrue(measured.topPaddingDp >= 76f)
        assertTrue(measured.bottomPaddingDp >= 130f)
        assertTrue(measured.requiresVerticalScroll)
        assertTrue(measured.iconSizeDp >= 24f)
    }

    @Test
    fun `large type footer stacks before editing without changing geometry`() {
        assertTrue(stackLauncherEditActions(320f, 1.3f))
        assertTrue(stackLauncherEditActions(411f, 2.6f))
        assertTrue(!stackLauncherEditActions(411f, 1f))
        assertTrue(!stackLauncherEditActions(320f, 1f))
    }
}
