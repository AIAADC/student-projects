package com.webshell.core.designsystem.components

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupProperties
import com.webshell.core.designsystem.theme.AppMotion

/**
 * iOS context action: label on the left and a simple monochrome glyph on the right.
 * Only destructive actions receive a semantic color; all other actions are neutral.
 */
data class AppContextMenuItem(
    val label: String,
    val icon: ImageVector,
    val destructive: Boolean = false,
    val onClick: () -> Unit,
)

/**
 * 锚点浮窗情境菜单（对齐 HyperOS/iOS 主屏长按效果）：
 * - 以按压点为准心（[anchorPoint] 为手指在根布局中的像素坐标）：
 *   水平以按压点居中展开；垂直优先向按压点上方展开，上方放不下且下方空间更大时
 *   翻转到下方（Launcher3 `ArrowPopup.orientAboutObject` 的本地化取舍）；
 *   四边以屏幕边距钳制，任何位置都不被截断；
 * - 纵向列表项：左标签 + 右侧单色图标；破坏性操作红色、分隔后置底；
 * - 半透明磨砂材质（复用主题 surface 高透明），不新增第二处实时模糊，见 docs/PERFORMANCE.md；
 * - 弹出动画统一走 [AppMotion.popupEnter]，锚点为靠近按压点的一侧。
 *
 * 窗口层级纪律（血泪教训）：**必须 focusable = false**。可聚焦 Popup 弹出时夺取
 * 窗口焦点，系统会给主窗口进行中的触摸流补发 ACTION_CANCEL —— 长按弹菜单后继续
 * 拖动图标的两段式手势（Launcher3 deep shortcuts 模式）会整个断掉，表现为
 * "长按后拖不动"。Launcher3 的 ArrowPopup 是挂在 DragLayer 里的窗口内视图，
 * 从不夺焦点；这里用不可聚焦的全屏 Popup + 内部透明遮罩达到同等效果：
 * 外部点击由遮罩承担（不可聚焦 Popup 没有自带 outside-touch），BACK 由
 * BackHandler 承担，主窗口的触摸流不受影响。
 */
@Composable
fun AppContextMenu(
    items: List<AppContextMenuItem>,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    anchorPoint: IntOffset? = null,
) {
    val density = LocalDensity.current
    val marginPx = with(density) { AppContextMenuDefaults.screenMargin.roundToPx() }

    BackHandler(onBack = onDismiss)

    Popup(properties = PopupProperties(focusable = false, clippingEnabled = false)) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val windowW = constraints.maxWidth
            val windowH = constraints.maxHeight

            // 透明遮罩：外部点击关闭。注意遮罩只盖透明像素，不做暗化 ——
            // 长按菜单期间主屏内容保持原样（对齐 Launcher3/iOS）。
            Box(
                Modifier
                    .fillMaxSize()
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = onDismiss,
                    ),
            )

            // 面板先测量再定位：尺寸未知时按零尺寸估算并保持全透明，避免首帧跳变。
            var menuSize by remember { mutableStateOf(IntSize.Zero) }
            val position = remember(anchorPoint, marginPx, windowW, windowH, menuSize) {
                menuPositionFor(anchorPoint, marginPx, windowW, windowH, menuSize)
            }
            var visible by remember { mutableStateOf(false) }
            androidx.compose.runtime.LaunchedEffect(Unit) { visible = true }

            AnimatedVisibility(
                visible = visible,
                enter = AppMotion.popupEnter(position.transformOrigin),
                exit = AppMotion.popupExit(position.transformOrigin),
                modifier = Modifier
                    .offset { position.offset }
                    .alpha(if (menuSize == IntSize.Zero) 0f else 1f),
            ) {
                MenuPanel(
                    items = items,
                    onAction = { it.onClick(); onDismiss() },
                    modifier = modifier
                        .widthIn(max = (maxWidth - AppContextMenuDefaults.screenMargin * 2).coerceAtLeast(0.dp))
                        .heightIn(max = (maxHeight - AppContextMenuDefaults.screenMargin * 2).coerceAtLeast(0.dp))
                        .onSizeChanged { menuSize = it },
                )
            }
        }
    }
}

@Composable
private fun MenuPanel(
    items: List<AppContextMenuItem>,
    onAction: (AppContextMenuItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    val regular = remember(items) { items.filterNot { it.destructive } }
    val destructive = remember(items) { items.filter { it.destructive } }
    val shape = remember { RoundedCornerShape(AppContextMenuDefaults.cornerRadius) }

    Column(
        modifier = modifier
            .width(AppContextMenuDefaults.menuWidth)
            .shadow(
                elevation = 18.dp,
                shape = shape,
                ambientColor = Color.Black.copy(alpha = 0.12f),
                spotColor = Color.Black.copy(alpha = 0.12f),
            )
            .staticGlassSurface(shape = shape, opacity = AppContextMenuDefaults.panelAlpha)
            .verticalScroll(rememberScrollState()),
    ) {
        regular.forEachIndexed { index, item ->
            MenuRow(item = item, onClick = { onAction(item) })
            if (index < regular.lastIndex) {
                RowDivider()
            }
        }
        if (destructive.isNotEmpty()) {
            if (regular.isNotEmpty()) {
                HorizontalDivider(
                    thickness = 6.dp,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.055f),
                )
            }
            destructive.forEachIndexed { index, item ->
                MenuRow(item = item, onClick = { onAction(item) })
                if (index < destructive.lastIndex) {
                    RowDivider()
                }
            }
        }
    }
}

@Composable
private fun MenuRow(item: AppContextMenuItem, onClick: () -> Unit) {
    val destructive = item.destructive
    val tintColor = when {
        destructive -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.onSurface
    }
    val textColor = if (destructive) {
        MaterialTheme.colorScheme.error
    } else {
        MaterialTheme.colorScheme.onSurface
    }

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(
            text = item.label,
            style = MaterialTheme.typography.bodyLarge,
            color = textColor,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.width(16.dp))
        Icon(
            imageVector = item.icon,
            contentDescription = null,
            tint = tintColor,
            modifier = Modifier.size(21.dp),
        )
    }
}

@Composable
private fun RowDivider() {
    HorizontalDivider(
        thickness = 0.5.dp,
        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f),
    )
}

/** 菜单位置计算结果：面板左上角偏移 + 弹出动画锚点。 */
internal data class MenuPosition(val offset: IntOffset, val transformOrigin: TransformOrigin)

/**
 * 按压点定位纯函数（Launcher3 `ArrowPopup.orientAboutObject` 的本地化派生）：
 * 1. 垂直：`spaceAbove = pressY`、`spaceBelow = windowH - pressY`；上方放得下
 *    （`spaceAbove >= menuH + gap`）或上方空间更大时向上展开，否则向下展开，
 *    菜单与按压点保留半个屏幕边距的间隙（gap = marginPx / 2）；
 * 2. 水平：以按压点为中心（`x = pressX - menuW/2`）；
 * 3. 两轴最终都 clamp 进 [margin, window - menu - margin]，任何边缘位置不截断；
 * 4. `transformOrigin` 的 pivot 始终落在按压点一侧（clamp 后重算），
 *    弹出动画从按压点展开，对应 Launcher3 的 `setPivotY(mIsAboveIcon ? height : 0)`。
 * 与 Launcher3 的差异：不画箭头、不做左/右对齐递归重试——固定宽度菜单下
 * "按压点居中 + clamp" 等价覆盖其分支，且为纯函数、更适合 Compose。
 */
internal fun menuPositionFor(
    pressPoint: IntOffset?,
    marginPx: Int,
    windowW: Int,
    windowH: Int,
    menuSize: IntSize,
): MenuPosition {
    val point = pressPoint ?: IntOffset(windowW / 2, windowH / 2)
    val menuW = menuSize.width
    val menuH = menuSize.height
    val gap = marginPx / 2

    // 垂直：默认上方，上方放不下且下方空间更大时翻转到下方
    val spaceAbove = point.y
    val spaceBelow = windowH - point.y
    val openUp = spaceAbove >= menuH + gap || spaceAbove >= spaceBelow
    val rawY = if (openUp) point.y - gap - menuH else point.y + gap

    // 水平：按压点居中
    val rawX = point.x - menuW / 2

    val maxX = (windowW - menuW - marginPx).coerceAtLeast(marginPx)
    val maxY = (windowH - menuH - marginPx).coerceAtLeast(marginPx)
    val x = rawX.coerceIn(marginPx, maxX)
    val y = rawY.coerceIn(marginPx, maxY)
    val origin = TransformOrigin(
        // clamp 后按压点可能不在菜单正中央，pivotX 需按实际偏移重算
        pivotFractionX = if (menuW > 0) {
            ((point.x - x).toFloat() / menuW).coerceIn(0f, 1f)
        } else {
            0.5f
        },
        pivotFractionY = if (openUp) 1f else 0f,
    )
    return MenuPosition(offset = IntOffset(x, y), transformOrigin = origin)
}

/** 情境菜单规格：与 docs/DESIGN.md 第 6 节同步维护。 */
private object AppContextMenuDefaults {
    val menuWidth = 252.dp
    val cornerRadius = 20.dp
    val screenMargin = 12.dp
    const val panelAlpha = 0.94f
}
