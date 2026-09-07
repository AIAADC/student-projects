package com.webshell.core.designsystem.theme

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PaletteSamplingTest {
    @Test
    fun smallImagesAreNotUpsampled() {
        assertEquals(1, paletteSampleSize(64, 48))
        assertEquals(1, paletteSampleSize(256, 256))
    }

    @Test
    fun panoramaAndPortraitHaveTheSameBoundedDecode() {
        assertEquals(64, paletteSampleSize(16_384, 128))
        assertEquals(64, paletteSampleSize(128, 16_384))
    }

    @Test
    fun longestDecodedEdgeStaysWithinBudget() {
        listOf(257 to 128, 4032 to 3024, 12000 to 1, Int.MAX_VALUE to 1).forEach { (w, h) ->
            val sample = paletteSampleSize(w, h)
            assertTrue(sample > 0 && sample.countOneBits() == 1)
            assertTrue(maxOf(w, h).toLong() <= 256L * sample)
        }
    }
}
