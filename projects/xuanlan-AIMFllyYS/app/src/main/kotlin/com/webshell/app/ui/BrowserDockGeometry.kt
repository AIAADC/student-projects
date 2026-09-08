package com.webshell.app.ui

import kotlin.math.min

/** Coordinates are dp in the safe content rectangle, independent of fonts and WebView size. */
internal data class OrbAnchor(val x: Float = 1f, val y: Float = 1f) {
    companion object {
        fun restored(x: Float, y: Float) = OrbAnchor(
            if (x.isFinite() && x >= 0f) x.coerceIn(0f, 1f) else 1f,
            if (y.isFinite() && y >= 0f) y.coerceIn(0f, 1f) else 1f,
        )
    }
}

internal data class DockBounds(val width: Float, val height: Float) {
    val orbSize = min(52f, min(width, height)).coerceAtLeast(1f)
    private val marginX = min(16f, ((width - orbSize) / 2).coerceAtLeast(0f))
    private val marginY = min(16f, ((height - orbSize) / 2).coerceAtLeast(0f))
    val minX = marginX + orbSize / 2
    val maxX = (width - marginX - orbSize / 2).coerceAtLeast(minX)
    val minY = marginY + orbSize / 2
    val maxY = (height - marginY - orbSize / 2).coerceAtLeast(minY)
    fun centerX(anchor: OrbAnchor) = minX + (maxX - minX) * anchor.x
    fun centerY(anchor: OrbAnchor) = minY + (maxY - minY) * anchor.y
    fun anchorAt(x: Float, y: Float) = OrbAnchor(
        if (x < width / 2) 0f else 1f,
        if (maxY == minY) 1f else ((y - minY) / (maxY - minY)).coerceIn(0f, 1f),
    )
    /**
     * Edge detection uses the reachable center range. The orb center can never reach x=0 or
     * x=width because its size and safe margin are part of the clamp; comparing against the
     * raw viewport edges would therefore make a normal drag to either extreme impossible to
     * park.
     */
    fun isEdgeDrop(x: Float) = x <= minX + 36f || x >= maxX - 36f
}
