package com.webshell.core.designsystem.theme

/** Bounds both dimensions, including panoramas and very tall user-supplied images. */
internal fun paletteSampleSize(width: Int, height: Int, maxEdge: Int = 256): Int {
    require(maxEdge > 0)
    var sample = 1
    val longestEdge = maxOf(width, height).coerceAtLeast(0)
    while (longestEdge.toLong() > maxEdge.toLong() * sample && sample < (1 shl 30)) {
        sample *= 2
    }
    return sample
}
