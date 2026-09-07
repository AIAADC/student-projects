package com.webshell.core.designsystem.components

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowLeft
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.SubcomposeLayout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.constrainHeight
import androidx.compose.ui.unit.constrainWidth
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.R

/**
 * Center the title against measured action widths, not assumed icon-sized slots.
 * Large-type text actions can wrap without drawing over the title; dp hit targets stay intact.
 * Insets remain the screen owner's responsibility.
 */
@Composable
fun AppNavigationBar(
    title: String,
    onBack: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
    backLabel: String = stringResource(R.string.designsystem_back),
    actions: @Composable RowScope.() -> Unit = {},
) {
    val largeType = LocalDensity.current.fontScale >= 1.5f
    SubcomposeLayout(modifier.fillMaxWidth().heightIn(min = 52.dp)) { constraints ->
        val edge = 4.dp.roundToPx()
        val gap = 8.dp.roundToPx()
        val minTitleWidth = 48.dp.roundToPx()
        val sideMaxWidth = if (constraints.hasBoundedWidth) {
            ((constraints.maxWidth - edge * 2 - gap * 2 - minTitleWidth) / 2).coerceAtLeast(0)
        } else Constraints.Infinity
        val sideConstraints = constraints.copy(minWidth = 0, minHeight = 0, maxWidth = sideMaxWidth)
        val start = subcompose(NavigationSlot.Back) {
            if (onBack != null) NavigationBackButton(onBack, backLabel, largeType)
        }.firstOrNull()?.measure(sideConstraints)
        val end = subcompose(NavigationSlot.Actions) {
            Row(verticalAlignment = Alignment.CenterVertically, content = actions)
        }.single().measure(sideConstraints)
        val clearance = navigationTitleClearance(start?.width ?: 0, end.width, edge, gap)
        val titleMaxWidth = if (constraints.hasBoundedWidth) {
            (constraints.maxWidth - clearance * 2).coerceAtLeast(0)
        } else Constraints.Infinity
        val titlePlaceable = subcompose(NavigationSlot.Title) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp).semantics { heading() },
            )
        }.single().measure(constraints.copy(minWidth = 0, minHeight = 0, maxWidth = titleMaxWidth))
        val width = if (constraints.hasBoundedWidth) constraints.maxWidth else {
            constraints.constrainWidth(titlePlaceable.width + clearance * 2)
        }
        val height = constraints.constrainHeight(maxOf(52.dp.roundToPx(), start?.height ?: 0, end.height, titlePlaceable.height))
        layout(width, height) {
            start?.let { it.placeRelative(edge, (height - it.height) / 2) }
            end.placeRelative((width - edge - end.width).coerceAtLeast(0), (height - end.height) / 2)
            titlePlaceable.placeRelative((width - titlePlaceable.width) / 2, (height - titlePlaceable.height) / 2)
        }
    }
}

@Composable
private fun NavigationBackButton(onBack: () -> Unit, label: String, iconOnly: Boolean) {
    if (iconOnly) {
        IconButton(onClick = onBack, modifier = Modifier.size(48.dp)) {
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowLeft, label, modifier = Modifier.size(24.dp))
        }
    } else {
        TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 48.dp)) {
            Icon(Icons.AutoMirrored.Rounded.KeyboardArrowLeft, null, modifier = Modifier.size(24.dp))
            Text(label, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

private enum class NavigationSlot { Back, Actions, Title }

internal fun navigationTitleClearance(startWidth: Int, endWidth: Int, edge: Int, gap: Int): Int {
    val actionWidth = maxOf(startWidth, endWidth)
    return edge + if (actionWidth > 0) actionWidth + gap else 0
}
