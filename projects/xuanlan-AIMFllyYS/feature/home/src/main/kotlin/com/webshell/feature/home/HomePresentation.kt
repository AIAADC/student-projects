package com.webshell.feature.home

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.webshell.core.data.HomeSettings
import com.webshell.core.designsystem.components.staticGlassSurface

/** The app root draws one wallpaper. Home only consumes its legibility contract. */
internal val LocalLauncherWallpaperBacked = staticCompositionLocalOf { false }

@Composable
internal fun launcherLabelStyle(): TextStyle = MaterialTheme.typography.labelSmall.copy(
    fontSize = 12.sp,
    lineHeight = 16.sp,
    fontWeight = FontWeight.Normal,
    color = if (LocalLauncherWallpaperBacked.current) Color.White else MaterialTheme.colorScheme.onSurface,
    textAlign = TextAlign.Center,
    shadow = if (LocalLauncherWallpaperBacked.current) {
        Shadow(Color.Black.copy(alpha = 0.42f), Offset(0f, 1f), 4f)
    } else {
        Shadow.None
    },
)

/** One shared clock exists only while editing. Idle pages do not schedule animation frames. */
@Composable
internal fun rememberLauncherJiggle(isEditing: Boolean): State<Float> {
    if (!isEditing) return rememberUpdatedState(0f)
    return rememberInfiniteTransition(label = "launcher-edit").animateFloat(
        initialValue = -1.6f,
        targetValue = 1.6f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 130, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "launcher-jiggle",
    )
}

@Composable
internal fun HomeSearchPill(
    pageCount: Int,
    currentPage: Int,
    showPages: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val wallpaper = LocalLauncherWallpaperBacked.current
    val description = stringResource(R.string.home_page_description, currentPage + 1, pageCount)
    Box(
        modifier = modifier.heightIn(min = 48.dp).clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            onClick = onClick,
        ),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            modifier = Modifier
                .heightIn(min = 30.dp)
                .staticGlassSurface(
                    shape = CircleShape,
                    tint = if (wallpaper) Color.Black else MaterialTheme.colorScheme.surfaceContainerHigh,
                    opacity = if (wallpaper) 0.20f else 0.88f,
                )
                .padding(horizontal = 13.dp, vertical = 6.dp)
                .then(if (showPages) Modifier.semantics { contentDescription = description } else Modifier),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val contentColor = if (wallpaper) Color.White else MaterialTheme.colorScheme.onSurface
            if (showPages && pageCount > 1) {
                // Limit the visible strip for large libraries without changing page numbers.
                val start = (currentPage - 3).coerceIn(0, (pageCount - 7).coerceAtLeast(0))
                repeat(minOf(pageCount, 7)) { offset ->
                    val selected = currentPage == start + offset
                    Box(
                        Modifier.size(6.dp).background(
                            contentColor.copy(alpha = if (selected) 1f else 0.38f),
                            CircleShape,
                        ),
                    )
                }
            } else {
                Icon(Icons.Filled.Search, contentDescription = null, tint = contentColor, modifier = Modifier.size(13.dp))
                Text(stringResource(R.string.home_search), style = MaterialTheme.typography.labelSmall, color = contentColor)
            }
        }
    }
}

@Composable
internal fun LauncherCell(
    cell: HomeCell,
    iconSize: Dp,
    settings: HomeSettings,
    isSource: Boolean,
    isMergeTarget: Boolean,
    isReorderTarget: Boolean,
    jiggleRotation: State<Float>,
    modifier: Modifier = Modifier,
    isEditMode: Boolean = false,
    isEditSelected: Boolean = false,
    isPressed: Boolean = false,
) {
    val targetScale by animateFloatAsState(
        targetValue = if (isMergeTarget) 1.12f else 1f,
        animationSpec = spring(dampingRatio = 0.72f, stiffness = 600f),
        label = "drop-target-scale",
    )
    val pressScale by animateFloatAsState(
        targetValue = if (isPressed) 0.92f else 1f,
        animationSpec = spring(dampingRatio = 0.7f, stiffness = 700f),
        label = "press-scale",
    )
    val phase = remember(cell.key) { if ((cell.key.hashCode() and 1) == 0) 1f else -1f }
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = modifier.alpha(if (isSource) 0.18f else 1f)) {
        Box {
            Surface(
                shape = RoundedCornerShape(settings.iconCornerRadiusPercent.coerceIn(0, 50)),
                color = Color.Transparent,
                border = if (isReorderTarget) BorderStroke(1.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.7f)) else null,
                modifier = Modifier.graphicsLayer {
                    scaleX = targetScale * pressScale
                    scaleY = targetScale * pressScale
                    rotationZ = jiggleRotation.value * phase
                },
            ) {
                AppIcon(
                    app = cell.app,
                    size = iconSize,
                    cornerRadiusPercent = settings.iconCornerRadiusPercent,
                    folderPreview = cell.folderMembers,
                    shadowElevation = if (LocalLauncherWallpaperBacked.current) 2.dp else 0.dp,
                )
            }
            if (isEditMode) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.align(Alignment.TopStart).offset(x = (-4).dp, y = (-4).dp)
                        .size(22.dp)
                        .background(
                            if (isEditSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface.copy(alpha = 0.9f),
                            CircleShape,
                        )
                        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape),
                ) {
                    if (isEditSelected) Icon(
                        Icons.Filled.Check,
                        contentDescription = stringResource(R.string.home_selected),
                        tint = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
        }
        if (settings.showLabels) {
            Text(
                text = if (cell.isFolder) stringResource(R.string.home_folder) else cell.app.title,
                style = launcherLabelStyle(),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.fillMaxWidth().padding(top = 5.dp, start = 1.dp, end = 1.dp),
            )
        }
    }
}

@Composable
internal fun AddCell(
    iconSize: Dp,
    showLabel: Boolean,
    cornerRadiusPercent: Int,
    modifier: Modifier = Modifier,
) {
    val wallpaper = LocalLauncherWallpaperBacked.current
    val shape = RoundedCornerShape(cornerRadiusPercent.coerceIn(0, 50))
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = modifier) {
        Box(
            modifier = Modifier.size(iconSize).staticGlassSurface(shape = shape, opacity = if (wallpaper) 0.25f else 0.8f),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Add,
                contentDescription = stringResource(R.string.home_add),
                tint = if (wallpaper) Color.White else MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.size(iconSize * 0.48f),
            )
        }
        if (showLabel) {
            Text(stringResource(R.string.home_add), style = launcherLabelStyle(), modifier = Modifier.padding(top = 5.dp))
        }
    }
}

@Composable
internal fun HomeEmptyState(modifier: Modifier = Modifier) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier.padding(horizontal = 24.dp),
    ) {
        Text(
            stringResource(R.string.home_empty_title),
            style = launcherLabelStyle().copy(
                fontSize = MaterialTheme.typography.titleMedium.fontSize,
                lineHeight = MaterialTheme.typography.titleMedium.lineHeight,
            ),
        )
        Text(
            stringResource(R.string.home_empty_description), style = launcherLabelStyle(),
            modifier = Modifier.padding(top = 6.dp),
        )
    }
}
