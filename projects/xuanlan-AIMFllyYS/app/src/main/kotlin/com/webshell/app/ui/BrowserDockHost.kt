package com.webshell.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.updateTransition
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.webshell.app.R
import com.webshell.core.designsystem.components.staticGlassSurface
import com.webshell.core.designsystem.theme.AppMotion
import com.webshell.feature.browser.BottomChromeMode
import com.webshell.feature.browser.BrowserChromeController
import com.webshell.feature.browser.BrowserChromeEvent
import kotlin.math.roundToInt

/**
 * Browser-only overlay. Its changing bounds never constrain or remeasure the sibling WebView.
 * The same glass effect node morphs between Dock and orb. The material is deliberately static:
 * live backdrop blur resamples the WebView every scrolled frame and visibly flickers, so the
 * single live-blur budget stays with LauncherDock over Compose-rendered tabs (docs/PERFORMANCE.md).
 */
@Composable
internal fun BrowserDockHost(
    chrome: BrowserChromeController,
    preferences: BrowserHostPreferences,
    onSelect: (MainTab) -> Unit,
    onAnchorChanged: (Float, Float) -> Unit,
) {
    val state = chrome.state
    val density = LocalDensity.current
    val imeVisible = WindowInsets.ime.getBottom(density) > 0
    if (imeVisible || state.overlay != null || state.interactionBlocked) return
    var anchor by remember { mutableStateOf(OrbAnchor.restored(preferences.orbX, preferences.orbY)) }
    var dragCenter by remember { mutableStateOf<Offset?>(null) }
    val latestSave = rememberUpdatedState(onAnchorChanged)
    LaunchedEffect(preferences.orbX, preferences.orbY) {
        anchor = OrbAnchor.restored(preferences.orbX, preferences.orbY)
    }
    BackHandler(enabled = dragCenter != null) { dragCenter = null }
    // This host contains the only Compose layer that is allowed to receive browser-chrome
    // touches. Keep the whole host above the native WebView child, including the parked edge
    // handle whose painted bar is intentionally much narrower than its hit target.
    BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding().zIndex(1f)) {
        val bounds = remember(maxWidth, maxHeight) { DockBounds(maxWidth.value, maxHeight.value) }
        val mode = state.bottomMode
        val expanded = mode == BottomChromeMode.Expanded
        val orbCenterX = bounds.centerX(anchor)
        val orbCenterY = bounds.centerY(anchor)
        val fullWidth = (maxWidth.value - 36).coerceIn(1f, 464f)
        val dockHeight = measuredDockHeight(MainTab.BROWSE).value
        val transition = updateTransition(targetState = mode, label = "browser-dock")
        val width by transition.animateFloat(
            transitionSpec = {
                if (initialState == BottomChromeMode.Edge && targetState == BottomChromeMode.Expanded) {
                    snap()
                } else {
                    AppMotion.popupSpring()
                }
            },
            label = "dock-width",
        ) { target -> if (target == BottomChromeMode.Expanded) fullWidth else bounds.orbSize }
        val height by transition.animateFloat(
            transitionSpec = {
                if (initialState == BottomChromeMode.Edge && targetState == BottomChromeMode.Expanded) {
                    snap()
                } else {
                    AppMotion.popupSpring()
                }
            },
            label = "dock-height",
        ) { target -> if (target == BottomChromeMode.Expanded) dockHeight else bounds.orbSize }
        val baseCenterX by transition.animateFloat(
            transitionSpec = {
                if (initialState == BottomChromeMode.Edge && targetState == BottomChromeMode.Expanded) {
                    snap()
                } else {
                    AppMotion.popupSpring()
                }
            },
            label = "dock-x",
        ) { target -> if (target == BottomChromeMode.Expanded) maxWidth.value / 2 else orbCenterX }
        val baseCenterY by transition.animateFloat(
            transitionSpec = {
                if (initialState == BottomChromeMode.Edge && targetState == BottomChromeMode.Expanded) {
                    snap()
                } else {
                    AppMotion.popupSpring()
                }
            },
            label = "dock-y",
        ) { target -> if (target == BottomChromeMode.Expanded) maxHeight.value - dockHeight / 2 - 10 else orbCenterY }
        val recallLabel = stringResource(R.string.browser_restore_navigation)
        val parkLabel = stringResource(R.string.browser_park_navigation)

        if (mode == BottomChromeMode.Edge) {
            val parked = stringResource(R.string.browser_navigation_parked)
            // Leave a small inset so the recover target is not swallowed by the system's
            // back-gesture exclusion strip on gesture-navigation devices.
            val edgeInset = 24.dp
            Box(
                Modifier.offset {
                    IntOffset(
                        with(density) {
                            (if (anchor.x < .5f) edgeInset else maxWidth - 48.dp - edgeInset).roundToPx()
                        },
                        with(density) { (bounds.centerY(anchor) - 24f).dp.roundToPx() },
                    )
                }.size(48.dp)
                    .zIndex(1f)
                    .clickable(role = Role.Button, onClickLabel = recallLabel) {
                        chrome.dispatch(BrowserChromeEvent.Reveal)
                    }
                    .semantics {
                        contentDescription = recallLabel
                        stateDescription = parked
                    },
                contentAlignment = if (anchor.x < .5f) Alignment.CenterStart else Alignment.CenterEnd,
            ) {
                Box(Modifier.size(6.dp, 36.dp).background(
                    MaterialTheme.colorScheme.onSurface.copy(alpha = .42f), RoundedCornerShape(3.dp)))
            }
        } else {
            val position = rememberUpdatedState(Offset(orbCenterX, orbCenterY))
            val moveModifier = if (!expanded) Modifier.pointerInput(bounds, mode) {
                detectDragGestures(
                    onDragStart = { dragCenter = position.value },
                    onDragCancel = {
                        val at = dragCenter ?: position.value
                        if (bounds.isEdgeDrop(at.x)) {
                            anchor = bounds.anchorAt(at.x, at.y)
                            latestSave.value(anchor.x, anchor.y)
                            chrome.dispatch(BrowserChromeEvent.Park)
                        }
                        dragCenter = null
                    },
                    onDragEnd = {
                        val at = dragCenter ?: position.value
                        anchor = bounds.anchorAt(at.x, at.y)
                        latestSave.value(anchor.x, anchor.y)
                        if (bounds.isEdgeDrop(at.x)) chrome.dispatch(BrowserChromeEvent.Park)
                        dragCenter = null
                    },
                    onDrag = { change, amount ->
                        change.consume()
                        val at = dragCenter ?: position.value
                        dragCenter = Offset(
                            (at.x + amount.x / density.density).coerceIn(bounds.orbSize / 2, bounds.width - bounds.orbSize / 2),
                            (at.y + amount.y / density.density).coerceIn(bounds.minY, bounds.maxY),
                        )
                    },
                )
            }.semantics {
                contentDescription = recallLabel
                customActions = listOf(CustomAccessibilityAction(parkLabel) {
                    chrome.dispatch(BrowserChromeEvent.Park); true
                })
            }.clickable(role = Role.Button, onClickLabel = recallLabel) { chrome.dispatch(BrowserChromeEvent.Reveal) }
            else Modifier
            Box(
                modifier = Modifier.offset {
                    IntOffset(
                        with(density) { (baseCenterX - width / 2).dp.roundToPx() },
                        with(density) { (baseCenterY - height / 2).dp.roundToPx() },
                    )
                }.size(width.dp, height.dp)
                    .then(moveModifier)
                    .semantics(mergeDescendants = !expanded) {
                        if (!expanded) contentDescription = recallLabel
                    },
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .staticGlassSurface(
                            shape = RoundedCornerShape(if (expanded) 32.dp else 26.dp),
                            tint = MaterialTheme.colorScheme.surface,
                            opacity = 0.72f,
                        )
                        .graphicsLayer {
                            translationX = with(density) { ((dragCenter?.x ?: baseCenterX) - baseCenterX).dp.toPx() }
                            translationY = with(density) { ((dragCenter?.y ?: baseCenterY) - baseCenterY).dp.toPx() }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    if (expanded) DockItems(MainTab.BROWSE, onSelect, Modifier.fillMaxSize())
                    else Icon(Icons.Rounded.MoreHoriz, contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurface, modifier = Modifier.size(24.dp))
                }
            }
        }
    }
}
