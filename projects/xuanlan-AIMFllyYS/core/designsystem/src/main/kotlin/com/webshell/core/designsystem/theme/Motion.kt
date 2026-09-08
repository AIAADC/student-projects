package com.webshell.core.designsystem.theme

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.graphics.TransformOrigin

/** 当前页面切换动效风格（slide/fade/scale/none），由主题层按用户设置提供。 */
val LocalTransitionStyle = compositionLocalOf { "slide" }

/**
 * 统一动效规范：常规过渡 150–300ms；弹簧物理曲线；不做改变布局 bounds 的装饰动画。
 * 所有菜单/弹窗/页面过渡复用同一组规格，保证全局一致（见 docs/DESIGN.md 动效章节）。
 */
object AppMotion {
    const val FastMs = 150
    const val NormalMs = 250

    fun <T> fade() = tween<T>(FastMs)

    fun <T> spring(): SpringSpec<T> = SpringSpec(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessMedium,
    )

    /** 弹出类（菜单/对话框）弹簧：紧凑、低回弹、快速安定。 */
    fun <T> popupSpring(): SpringSpec<T> = SpringSpec(
        dampingRatio = 0.82f,
        stiffness = 640f,
    )

    /** 二级/三级页面进入：从右侧滑入 + 淡入（统一规格）。 */
    val enterDetail: EnterTransition =
        slideInHorizontally(
            animationSpec = spring(),
            initialOffsetX = { fullWidth -> (fullWidth * 0.28f).toInt() },
        ) + fadeIn(animationSpec = tween(NormalMs))

    /** 二级/三级页面退出：向右滑出 + 淡出。 */
    val exitDetail: ExitTransition =
        slideOutHorizontally(
            animationSpec = spring(),
            targetOffsetX = { fullWidth -> (fullWidth * 0.28f).toInt() },
        ) + fadeOut(animationSpec = tween(NormalMs))

    /** 自由浮层（情境菜单/气泡）弹出：从锚点缩放到 1 + 淡入。 */
    fun popupEnter(origin: TransformOrigin = TransformOrigin.Center): EnterTransition =
        scaleIn(
            animationSpec = popupSpring(),
            initialScale = 0.92f,
            transformOrigin = origin,
        ) + fadeIn(animationSpec = tween(FastMs))

    /** 自由浮层收起：缩放回锚点 + 淡出。 */
    fun popupExit(origin: TransformOrigin = TransformOrigin.Center): ExitTransition =
        scaleOut(
            animationSpec = popupSpring(),
            targetScale = 0.92f,
            transformOrigin = origin,
        ) + fadeOut(animationSpec = tween(FastMs))

    /** 按用户选择的风格生成二级/三级页面进入过渡。 */
    fun detailEnterFor(style: String): EnterTransition = when (style) {
        "fade" -> fadeIn(animationSpec = tween(NormalMs))
        "scale" -> scaleIn(animationSpec = spring(), initialScale = 0.92f) +
            fadeIn(animationSpec = tween(NormalMs))
        "none" -> EnterTransition.None
        else -> enterDetail // slide（默认）
    }

    /** 按用户选择的风格生成二级/三级页面退出过渡。 */
    fun detailExitFor(style: String): ExitTransition = when (style) {
        "fade" -> fadeOut(animationSpec = tween(NormalMs))
        "scale" -> scaleOut(animationSpec = spring(), targetScale = 0.92f) +
            fadeOut(animationSpec = tween(NormalMs))
        "none" -> ExitTransition.None
        else -> exitDetail // slide（默认）
    }
}
