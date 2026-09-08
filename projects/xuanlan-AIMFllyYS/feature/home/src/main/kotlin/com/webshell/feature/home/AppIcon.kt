package com.webshell.feature.home

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.webshell.core.data.WebAppEntity
import com.webshell.core.designsystem.components.SiteIcon
import com.webshell.core.designsystem.components.staticGlassSurface

/**
 * 主页图标：iOS 主屏规范 —— 图标本体直接落在壁纸上，无底座卡片容器。
 * 圆角由图标本体（白底/首字母色块/文件夹容器）自行裁剪；
 * 收藏应用以 2dp 边框标识。远端图标内容尺寸不参与网格测量。
 *
 * [shadowElevation] > 0 时用不透明网站图标本体的大圆角 shape 投影（拖拽浮动层用），
 * 阴影跟随圆角而非矩形 —— 不要在外层用 graphicsLayer{ clip=true } 投影，
 * 那会把圆角阴影裁成方块。半透明文件夹不投硬件阴影：RenderNode 的内部阴影剔除区
 * 会透过材质形成明显的矩形色差；玻璃描边足以定义其层次，不另外添加图层。
 */
@Composable
fun AppIcon(
    app: WebAppEntity,
    size: Dp,
    cornerRadiusPercent: Int = 26,
    modifier: Modifier = Modifier,
    folderPreview: List<WebAppEntity> = emptyList(),
    shadowElevation: Dp = 0.dp,
) {
    val shape = RoundedCornerShape(cornerRadiusPercent.coerceIn(0, 50))
    val isFolder = folderPreview.isNotEmpty()
    Box(
        modifier = modifier
            .size(size)
            .then(
                if (shadowElevation > 0.dp && !isFolder) {
                    Modifier.graphicsLayer {
                        this.shadowElevation = shadowElevation.toPx()
                        this.shape = shape
                        this.clip = false // 阴影需超出 bounds 绘制，仅按 shape 投影
                    }
                } else {
                    Modifier
                },
            )
            .then(
                if (app.isFavorite) {
                    Modifier.border(2.dp, MaterialTheme.colorScheme.primary, shape)
                } else {
                    Modifier
                },
            )
            .clip(shape),
        contentAlignment = Alignment.Center,
    ) {
        if (isFolder) {
            FolderPreview(
                apps = folderPreview,
                iconSize = size * 0.225f,
                shape = shape,
                cornerRadiusPercent = cornerRadiusPercent,
            )
        } else {
            SiteIcon(
                title = app.title,
                iconUrl = app.iconUrl,
                size = size,
                cornerRadiusPercent = cornerRadiusPercent,
                localFallback = app.isLocal,
            )
        }
    }
}
/** iOS folder tile: nine miniature icons in a translucent, softly edged material. No live blur. */
@Composable
private fun FolderPreview(
    apps: List<WebAppEntity>,
    iconSize: Dp,
    shape: Shape,
    cornerRadiusPercent: Int,
) {
    val gap = iconSize * 0.20f
    Box(
        modifier = Modifier
            .fillMaxSize()
            .staticGlassSurface(
                shape = shape,
                tint = MaterialTheme.colorScheme.surfaceContainerHigh,
                opacity = if (LocalLauncherWallpaperBacked.current) 0.62f else 0.88f,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Box(modifier = Modifier.size(iconSize * 3 + gap * 2)) {
            apps.take(9).forEachIndexed { index, app ->
                Box(
                    modifier = Modifier
                        .padding(
                            start = (iconSize + gap) * (index % 3),
                            top = (iconSize + gap) * (index / 3),
                        ),
                ) {
                    SiteIcon(
                        title = app.title,
                        iconUrl = app.iconUrl,
                        size = iconSize,
                        cornerRadiusPercent = cornerRadiusPercent,
                        localFallback = app.isLocal,
                    )
                }
            }
        }
    }
}
