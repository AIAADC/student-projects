package com.webshell.core.designsystem.components

import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MenuPositionTest {
    @Test
    fun edgeAnchorsKeepMenuInsideCompactScreen() {
        val width = 320
        val height = 640
        val margin = 12
        val size = IntSize(252, 300)
        listOf(
            IntOffset(0, 0), IntOffset(width, 0),
            IntOffset(0, height), IntOffset(width, height),
            IntOffset(width / 2, height / 2),
        ).forEach { anchor ->
            val position = menuPositionFor(anchor, margin, width, height, size)
            assertTrue(position.offset.x >= margin)
            assertTrue(position.offset.y >= margin)
            assertTrue(position.offset.x + size.width <= width - margin)
            assertTrue(position.offset.y + size.height <= height - margin)
            assertTrue(position.transformOrigin.pivotFractionX in 0f..1f)
        }
    }

    @Test
    fun topAnchorOpensDownAndBottomAnchorOpensUp() {
        val size = IntSize(252, 300)
        val down = menuPositionFor(IntOffset(160, 40), 12, 320, 640, size)
        val up = menuPositionFor(IntOffset(160, 600), 12, 320, 640, size)
        assertEquals(0f, down.transformOrigin.pivotFractionY, 0f)
        assertEquals(1f, up.transformOrigin.pivotFractionY, 0f)
        assertTrue(down.offset.y > 40)
        assertTrue(up.offset.y + size.height < 600)
    }

    @Test
    fun zeroSizedFirstMeasurementHasFiniteAnimationOrigin() {
        val position = menuPositionFor(null, 12, 320, 640, IntSize.Zero)
        assertEquals(0.5f, position.transformOrigin.pivotFractionX, 0f)
        assertTrue(position.transformOrigin.pivotFractionY in 0f..1f)
    }
}
