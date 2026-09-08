package com.webshell.feature.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.components.staticGlassSurface

/** A stable reservation for both normal and selected footer; current selection never moves cells. */
@Composable
internal fun launcherFooterHeightDp(width: Dp, totalCount: Int): Float {
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    val style = MaterialTheme.typography.labelLarge
    val summary = stringResource(R.string.home_selection_count, totalCount, totalCount)
    val longestAction = stringResource(R.string.home_deselect_all)
    val stacked = stackLauncherEditActions(width.value, density.fontScale)
    return with(density) {
        val actionWidth = ((width - 64.dp) / 2 - 24.dp).coerceAtLeast(1.dp).roundToPx()
        val actionHeight = measurer.measure(
            longestAction, style = style, constraints = Constraints(maxWidth = actionWidth),
        ).size.height.toDp().value
        val buttonHeight = maxOf(48f, actionHeight + 16f)
        if (stacked) {
            val summaryHeight = measurer.measure(
                summary, style = style, constraints = Constraints(maxWidth = (width - 64.dp).coerceAtLeast(1.dp).roundToPx()),
            ).size.height.toDp().value
            summaryHeight + buttonHeight + 12f
        } else maxOf(52f, buttonHeight + 4f)
    }
}

@Composable
internal fun EditModeOverlay(
    selectedCount: Int,
    totalCount: Int,
    onSelectAll: () -> Unit,
    onClearSelection: () -> Unit,
    modifier: Modifier = Modifier,
) {
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val stacked = stackLauncherEditActions(maxWidth.value, LocalDensity.current.fontScale)
        val container = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, bottom = 4.dp)
            .staticGlassSurface(shape = RoundedCornerShape(26.dp), opacity = 0.88f)
            .padding(horizontal = 16.dp)
        val summary: @Composable (Modifier) -> Unit = { summaryModifier ->
            Text(
                stringResource(R.string.home_selection_count, selectedCount, totalCount),
                style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center, modifier = summaryModifier,
            )
        }
        if (stacked) {
            Column(container.padding(top = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                summary(Modifier.fillMaxWidth())
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    EditSelectionActions(selectedCount, totalCount, onSelectAll, onClearSelection, weighted = true)
                }
            }
        } else {
            Row(container, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                summary(Modifier.weight(1f))
                EditSelectionActions(selectedCount, totalCount, onSelectAll, onClearSelection, weighted = false)
            }
        }
    }
}

@Composable
private fun RowScope.EditSelectionActions(
    selectedCount: Int,
    totalCount: Int,
    onSelectAll: () -> Unit,
    onClearSelection: () -> Unit,
    weighted: Boolean,
) {
    val actionModifier = if (weighted) Modifier.weight(1f) else Modifier
    TextButton(onClick = onSelectAll, modifier = actionModifier, contentPadding = PaddingValues(12.dp, 8.dp)) {
        Text(
            stringResource(if (selectedCount == totalCount) R.string.home_deselect_all else R.string.home_select_all),
            style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center,
        )
    }
    TextButton(onClick = onClearSelection, enabled = selectedCount > 0, modifier = actionModifier, contentPadding = PaddingValues(12.dp, 8.dp)) {
        Text(stringResource(R.string.home_clear), style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center)
    }
}
