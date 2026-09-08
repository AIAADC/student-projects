package com.webshell.feature.home

import android.graphics.Rect
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.Dp
import com.webshell.core.data.HomeSettings

/** Cell rendering/registration only. The drag tracking coroutine remains in HomeScreen's root. */
@Composable
internal fun HomeGridSlot(
    page: Int,
    slot: Int,
    cell: HomeCell?,
    isAddSlot: Boolean,
    ui: HomeInteractionState,
    settings: HomeSettings,
    iconSize: Dp,
    cellHeight: Dp,
    jiggleRotation: State<Float>,
    onAddRequested: () -> Unit,
    onLaunch: (String, String) -> Unit,
    onFolderOpen: (String?) -> Unit,
    onDragMoved: (Offset) -> Unit,
) {
    val slotKey = "$page:$slot"
    DisposableEffect(slotKey) { onDispose { ui.slotBounds.remove(slotKey) } }
    val slotModifier = Modifier.fillMaxWidth().height(cellHeight).onGloballyPositioned { coords ->
        val topLeft = coords.positionInRoot()
        val bounds = Rect(
            topLeft.x.toInt(), topLeft.y.toInt(),
            (topLeft.x + coords.size.width).toInt(), (topLeft.y + coords.size.height).toInt(),
        )
        ui.slotBounds[slotKey] = bounds
        if (cell != null) ui.cellBounds[cell.key] = bounds
    }
    if (cell == null) {
        if (isAddSlot) AddCell(
            iconSize = iconSize, showLabel = settings.showLabels,
            cornerRadiusPercent = settings.iconCornerRadiusPercent,
            modifier = slotModifier.clickable(onClick = onAddRequested),
        ) else Spacer(slotModifier)
        return
    }

    DisposableEffect(cell.key) { onDispose { ui.cellBounds.remove(cell.key) } }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    LauncherCell(
        cell = cell, iconSize = iconSize, settings = settings,
        isSource = ui.draggingKey == cell.key,
        isMergeTarget = ui.folderArmed && ui.folderCandidate == cell.key,
        isReorderTarget = ui.dragHoverTarget == cell.key && !ui.folderArmed,
        jiggleRotation = jiggleRotation, isEditMode = ui.editMode,
        isEditSelected = ui.editSelection[cell.key] == true, isPressed = pressed,
        modifier = slotModifier.homeCellGesture(
            state = ui, cell = cell, iconSize = iconSize, interactionSource = interaction,
            haptics = LocalHapticFeedback.current, onLaunch = onLaunch,
            onFolderOpen = onFolderOpen, onDragMoved = onDragMoved,
        ),
    )
}
