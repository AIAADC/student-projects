package com.webshell.core.designsystem.components

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NavigationBarGeometryTest {
    @Test fun titleReservesTheLargerTextActionSymmetrically() {
        val clearance = navigationTitleClearance(startWidth = 48, endWidth = 94, edge = 4, gap = 8)
        assertEquals(106, clearance)
        val width = 320
        val titleWidth = width - clearance * 2
        assertEquals(108, titleWidth)
        assertTrue((width - titleWidth) / 2 >= 48 + 4 + 8)
        assertTrue((width + titleWidth) / 2 <= width - 94 - 4 - 8)
    }

    @Test fun ordinaryBackLabelAlsoParticipatesInClearance() {
        assertEquals(92, navigationTitleClearance(80, 48, 4, 8))
        assertEquals(4, navigationTitleClearance(0, 0, 4, 8))
    }
}
