package com.webshell.feature.home

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class HomeInteractionStateTest {
    @Test
    fun `late page animation callback after reset cannot repopulate drag targets or edges`() {
        val haptics = object : HapticFeedback {
            override fun performHapticFeedback(hapticFeedbackType: HapticFeedbackType) {
                error("An idle drag callback must not emit haptic feedback")
            }
        }
        for (verticalMode in listOf(false, true)) {
            val state = HomeInteractionState().apply {
                draggingKey = "app"
                tempPageSide = -1
                edgeDirection = 1
                verticalEdgeDirection = 1
            }
            state.resetDrag()
            // Matches HomeDragEffects' animation-finally callback, after reset set position=0.
            state.updateDropTargets(
                position = state.dragPosition,
                pages = listOf(emptyList()),
                currentPage = 0,
                verticalMode = verticalMode,
                containerWidthPx = 393f,
                containerHeightPx = 600f,
                iconSize = 60.dp,
                density = Density(1f),
                haptics = haptics,
            )
            assertNull(state.draggingKey)
            assertEquals(0, state.edgeDirection)
            assertEquals(0, state.verticalEdgeDirection)
            assertEquals(-1, state.dragTargetCellIndex)
            assertEquals(-1, state.dragTargetPage)
            assertNull(state.dragHoverTarget)
            assertNull(state.folderCandidate)
            assertFalse(state.folderArmed)
            assertEquals(0, state.tempPageSide)
        }
    }

    @Test
    fun `drop or cancellation clears every transient drag field`() {
        val state = HomeInteractionState().apply {
            draggingKey = "app"
            dragPosition = Offset(110f, 220f)
            dragRegistration = Offset(20f, 30f)
            dragHoverTarget = "other"
            dragTargetCellIndex = 4
            dragTargetPage = 1
            folderCandidate = "other"
            folderArmed = true
            edgeDirection = 1
            verticalEdgeDirection = -1
            tempPageSide = -1
            menuPressPoint = Offset(80f, 90f)
        }
        state.resetDrag()
        assertNull(state.draggingKey)
        assertEquals(Offset.Zero, state.dragPosition)
        assertEquals(Offset.Zero, state.dragRegistration)
        assertNull(state.dragHoverTarget)
        assertEquals(-1, state.dragTargetCellIndex)
        assertEquals(-1, state.dragTargetPage)
        assertNull(state.folderCandidate)
        assertFalse(state.folderArmed)
        assertEquals(0, state.edgeDirection)
        assertEquals(0, state.verticalEdgeDirection)
        assertEquals(0, state.tempPageSide)
        assertNull(state.menuPressPoint)
    }
}
