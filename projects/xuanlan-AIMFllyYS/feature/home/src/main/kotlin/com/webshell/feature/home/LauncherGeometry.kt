package com.webshell.feature.home

import kotlin.math.min

/** The footer reserves its edit-mode height even before editing, so cells never jump on entry. */
internal fun stackLauncherEditActions(widthDp: Float, fontScale: Float): Boolean =
    fontScale > 1.3f || (widthDp < 360f && fontScale > 1.1f)

/**
 * Constraint-only launcher geometry. Images and drawing/drag transforms never enter this model.
 * Both scroll modes use the same cell dimensions, so a saved slot keeps its visual position.
 * The paged grid reserves its footer before resolving icon size, including dense user layouts.
 */
internal data class LauncherGeometry(
    val iconSizeDp: Float,
    val cellHeightDp: Float,
    val horizontalPaddingDp: Float,
    val topPaddingDp: Float,
    val bottomPaddingDp: Float,
    val columnGapDp: Float,
    val rowGapDp: Float,
    val requiresVerticalScroll: Boolean,
) {
    companion object {
        // Both reservations exist outside edit mode, keeping grid and drag registration fixed
        // when the Done affordance replaces blank header space or the footer changes controls.
        const val HEADER_HEIGHT_DP = 56f
        const val SEARCH_FOOTER_HEIGHT_DP = 52f // 48dp touch target + 4dp bottom margin

        fun resolve(
            widthDp: Float,
            heightDp: Float,
            columns: Int,
            rows: Int,
            requestedIconSizeDp: Float,
            showLabels: Boolean,
            fontScale: Float = 1f,
            measuredLabelHeightDp: Float? = null,
            measuredHeaderHeightDp: Float? = null,
            measuredFooterHeightDp: Float? = null,
        ): LauncherGeometry {
            val width = widthDp.takeIf { it.isFinite() }?.coerceAtLeast(1f) ?: 1f
            val height = heightDp.takeIf { it.isFinite() }?.coerceAtLeast(1f) ?: 1f
            val columnCount = columns.coerceAtLeast(1)
            val rowCount = rows.coerceAtLeast(1)
            val safeFontScale = fontScale.takeIf { it.isFinite() }?.coerceAtLeast(1f) ?: 1f
            val horizontalPadding = min(if (width < 360f) 14f else 22f, width * 0.06f)
            val columnGap = min(8f, width / (columnCount * 5f))
            val topPadding = measuredHeaderHeightDp?.takeIf { it.isFinite() && it > 0 }
                ?.coerceAtLeast(HEADER_HEIGHT_DP) ?: maxOf(HEADER_HEIGHT_DP, 21f * safeFontScale + 24f)
            val bottomPadding = maxOf(
                SEARCH_FOOTER_HEIGHT_DP,
                min(62f, height * 0.14f),
                21f * safeFontScale + 20f,
                measuredFooterHeightDp?.takeIf { it.isFinite() && it > 0 } ?: 0f,
            )
            val availableHeight = (height - topPadding - bottomPadding).coerceAtLeast(1f)
            val minimumRowGap = min(12f, availableHeight / (rowCount * 5f))
            val cellHeightLimit = (availableHeight - minimumRowGap * (rowCount - 1)) / rowCount
            // 16sp line box + 5dp top spacing, with a small descender allowance. Respect font
            // scaling before sizing the bitmap so accessibility text does not steal another row.
            val labelSpace = if (showLabels) {
                (measuredLabelHeightDp?.takeIf { it.isFinite() && it > 0 } ?: (20f * safeFontScale)) + 5f
            } else 12f
            val widthLimit = (
                (width - horizontalPadding * 2f - columnGap * (columnCount - 1)) / columnCount - 6f
                ).coerceAtLeast(1f)
            // Accessible text is never clipped to fit a physically impossible short/dense page.
            // Keep a usable artwork size and let the caller scroll that fixed-capacity page.
            val minimumIconSize = min(24f, widthLimit)
            val heightLimit = (cellHeightLimit - labelSpace).coerceAtLeast(minimumIconSize)
            val requestedSize = requestedIconSizeDp.takeIf { it.isFinite() }?.coerceAtLeast(1f) ?: 60f
            val iconSize = min(requestedSize, min(widthLimit, heightLimit))
            val cellHeight = iconSize + labelSpace
            val overflows = cellHeight * rowCount + minimumRowGap * (rowCount - 1) > availableHeight
            val rowGap = if (overflows) minimumRowGap else if (rowCount > 1) {
                ((availableHeight - cellHeight * rowCount) / (rowCount - 1))
                    .coerceIn(0f, 32f)
            } else {
                0f
            }
            return LauncherGeometry(
                iconSizeDp = iconSize,
                cellHeightDp = cellHeight,
                horizontalPaddingDp = horizontalPadding,
                topPaddingDp = topPadding,
                bottomPaddingDp = bottomPadding,
                columnGapDp = columnGap,
                rowGapDp = rowGap,
                requiresVerticalScroll = overflows,
            )
        }
    }
}
