package com.webshell.feature.home

import android.graphics.Rect
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Apps
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.components.AppContextMenu
import com.webshell.core.designsystem.components.AppContextMenuItem
import com.webshell.core.designsystem.components.staticGlassSurface
import kotlin.math.roundToInt
import kotlinx.coroutines.withTimeoutOrNull

// 与图标同一套两段式阈值：长按弹菜单后累计位移超 16dp 转为自由拖动（Launcher3
// deep_shortcuts_start_drag_threshold）；≤16dp 松手菜单保持打开。
private val ENTRY_DRAG_THRESHOLD = 16.dp

/**
 * 「全部应用」浮动入口：渲染在 Pager/Grid 之外的 overlay（对齐 DragLayer 思路，
 * 不参与网格测量），位置持久化为归一化中心坐标（0..1，负值 = 默认右下角）。
 *
 * 手势与图标同一套单通道状态机：点按打开全部应用抽屉；长按弹小菜单
 * （含「隐藏全部应用入口」）；长按后移动超阈值进入自由拖动，松手持久化位置。
 */
@Composable
fun AllAppsEntry(
    iconSize: Dp,
    cornerRadiusPercent: Int,
    showLabel: Boolean,
    posX: Float,
    posY: Float,
    containerWidthPx: Float,
    containerHeightPx: Float,
    onOpen: () -> Unit,
    onHide: () -> Unit,
    onPositionChange: (x: Float, y: Float) -> Unit,
    onBoundsChanged: (Rect?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current
    val iconPx = with(density) { iconSize.toPx() }
    val labelMeasurer = rememberTextMeasurer()
    val labelPx = if (showLabel) {
        labelMeasurer.measure(stringResource(R.string.home_all_apps), style = launcherLabelStyle(), maxLines = 1).size.height +
            with(density) { 5.dp.toPx() }
    } else 0f
    val halfW = iconPx / 2f
    val halfH = (iconPx + labelPx) / 2f
    val marginPx = with(density) { 20.dp.toPx() }
    // 默认位：主屏右下角，抬高避开页码指示器/底部手势区
    val defaultBottomPx = with(density) { 96.dp.toPx() }

    fun clampCenter(c: Offset) = Offset(
        c.x.coerceIn(halfW, (containerWidthPx - halfW).coerceAtLeast(halfW)),
        c.y.coerceIn(halfH, (containerHeightPx - halfH).coerceAtLeast(halfH)),
    )
    fun defaultCenter() = clampCenter(
        Offset(
            containerWidthPx - marginPx - halfW,
            containerHeightPx - defaultBottomPx - halfH,
        ),
    )

    // 拖拽中的实时中心（px）；null = 不在拖拽，用持久化/默认位置
    var dragCenter by remember { mutableStateOf<Offset?>(null) }
    var dragging by remember { mutableStateOf(false) }
    var menuVisible by remember { mutableStateOf(false) }
    // 入口在根布局中的区域：空白处长按需要排除它（否则入口长按会双弹菜单）
    var originInRoot by remember { mutableStateOf(Offset.Zero) }

    val persistedValid = posX in 0f..1f && posY in 0f..1f && containerWidthPx > 0f
    val center = dragCenter ?: if (persistedValid) {
        clampCenter(Offset(posX * containerWidthPx, posY * containerHeightPx))
    } else {
        defaultCenter()
    }

    DisposableEffect(Unit) {
        onDispose { onBoundsChanged(null) }
    }

    val scale by animateFloatAsState(
        targetValue = if (dragging) 1.08f else 1f,
        animationSpec = spring(dampingRatio = 0.68f, stiffness = 520f),
        label = "all-apps-entry-scale",
    )

    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
            // 位置走 graphicsLayer 平移，不触发网格/布局重测（对齐 DragLayer 不变量）
            .graphicsLayer {
                translationX = center.x - halfW
                translationY = center.y - halfH
                scaleX = scale
                scaleY = scale
            }
            .onGloballyPositioned { coords ->
                val topLeft = coords.positionInRoot()
                originInRoot = topLeft
                onBoundsChanged(
                    Rect(
                        topLeft.x.toInt(),
                        topLeft.y.toInt(),
                        (topLeft.x + coords.size.width).toInt(),
                        (topLeft.y + coords.size.height).toInt(),
                    ),
                )
            }
            .pointerInput(posX, posY, containerWidthPx, containerHeightPx, showLabel, iconPx, labelPx) {
                val dragThresholdPx = ENTRY_DRAG_THRESHOLD.toPx()
                awaitEachGesture {
                    val down = awaitFirstDown()
                    // 长按超时窗口：提前松手 = 点按；位移超 touchSlop = 取消（交还父级滚动）
                    var isTap = false
                    var isCancelled = false
                    withTimeoutOrNull(
                        viewConfiguration.longPressTimeoutMillis,
                    ) {
                        var accumulated = Offset.Zero
                        while (true) {
                            val change = awaitPointerEvent()
                                .changes.firstOrNull { it.id == down.id }
                            if (change == null || change.isConsumed) {
                                isCancelled = true
                                return@withTimeoutOrNull
                            }
                            if (change.changedToUp()) {
                                isTap = true
                                return@withTimeoutOrNull
                            }
                            accumulated += change.positionChange()
                            if (accumulated.getDistance() > viewConfiguration.touchSlop) {
                                isCancelled = true
                                return@withTimeoutOrNull
                            }
                        }
                    }

                    when {
                        isTap -> onOpen()
                        isCancelled -> Unit
                        else -> {
                            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                            menuVisible = true
                            var accumulated = Offset.Zero
                            try {
                                while (true) {
                                    val change = awaitPointerEvent()
                                        .changes.firstOrNull { it.id == down.id }
                                        ?: break
                                    if (change.changedToUp()) break
                                    // 先取位移再消费：消费用于阻止 pager/列表滚动
                                    val delta = change.positionChange()
                                    change.consume()
                                    accumulated += delta
                                    if (!dragging && accumulated.getDistance() > dragThresholdPx) {
                                        menuVisible = false
                                        dragging = true
                                        dragCenter = center
                                    }
                                    if (dragging) {
                                        dragCenter = clampCenter((dragCenter ?: center) + delta)
                                    }
                                }
                                if (dragging && containerWidthPx > 0f && containerHeightPx > 0f) {
                                    dragCenter?.let {
                                        onPositionChange(
                                            it.x / containerWidthPx,
                                            it.y / containerHeightPx,
                                        )
                                    }
                                }
                            } finally {
                                dragging = false
                                dragCenter = null
                            }
                        }
                    }
                }
            },
    ) {
        // 半透明毛玻璃质感底：复用主题 surface 高透明，不新增实时模糊（docs/DESIGN.md）
        val shape = RoundedCornerShape(cornerRadiusPercent.coerceIn(0, 50))
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .size(iconSize)
                .staticGlassSurface(shape = shape, opacity = if (LocalLauncherWallpaperBacked.current) 0.45f else 0.88f),
        ) {
            Icon(
                Icons.Filled.Apps,
                contentDescription = stringResource(R.string.home_all_apps),
                tint = if (LocalLauncherWallpaperBacked.current) Color.White else MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.size(iconSize * 0.52f),
            )
        }
        if (showLabel) {
            Text(
                stringResource(R.string.home_all_apps),
                style = launcherLabelStyle(),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 5.dp),
            )
        }
    }

    if (menuVisible) {
        AppContextMenu(
            items = listOf(
                AppContextMenuItem(stringResource(R.string.home_hide_all_apps_entry), Icons.Filled.VisibilityOff) { onHide() },
            ),
            onDismiss = { menuVisible = false },
            // 锚定入口当前视觉中心（positionInRoot 已含 graphicsLayer 平移）
            anchorPoint = IntOffset(
                (originInRoot.x + halfW).roundToInt(),
                (originInRoot.y + halfH).roundToInt(),
            ),
        )
    }
}
