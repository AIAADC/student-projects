package com.webshell.app.ui

import androidx.annotation.StringRes
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webshell.app.R
import com.webshell.core.designsystem.components.glassSurface
import com.webshell.core.designsystem.theme.AppMotion
import dev.chrisbanes.haze.HazeState

internal val HomeDockHeight = 88.dp
internal val TabBarHeight = 66.dp

@Composable
internal fun measuredDockHeight(tab: MainTab): androidx.compose.ui.unit.Dp {
    if (tab == MainTab.HOME) return HomeDockHeight
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    val style = MaterialTheme.typography.labelSmall
    val label = stringResource(R.string.tab_me)
    val labelHeight = with(density) { measurer.measure(label, style = style).size.height.toDp() }
    return maxOf(TabBarHeight, labelHeight + 42.dp)
}

internal enum class MainTab(@StringRes val label: Int, val icon: ImageVector) {
    HOME(R.string.tab_home, Icons.Filled.Home),
    ADD(R.string.tab_add, Icons.Filled.Add),
    BROWSE(R.string.tab_browse, Icons.Filled.Explore),
    ME(R.string.tab_me, Icons.Filled.Settings),
}

/** Desktop shortcuts and detail tab bar share the same single glass backdrop. */
@Composable
internal fun LauncherDock(
    selectedTab: MainTab,
    onSelect: (MainTab) -> Unit,
    hazeState: HazeState,
    modifier: Modifier = Modifier,
) {
    val desktop = selectedTab == MainTab.HOME
    val height = measuredDockHeight(selectedTab)
    val shape = RoundedCornerShape(if (desktop) 34.dp else 32.dp)
    Box(
        modifier.widthIn(max = 500.dp).fillMaxWidth().navigationBarsPadding()
            .padding(horizontal = 18.dp, vertical = 10.dp),
    ) {
        DockItems(selectedTab, onSelect, Modifier.fillMaxWidth()
            .height(height)
            .glassSurface(hazeState, shape = shape))
    }
}

/** Shared production content: catalog and browser restoration never duplicate navigation UI. */
@Composable
internal fun DockItems(selectedTab: MainTab, onSelect: (MainTab) -> Unit, modifier: Modifier = Modifier) {
    val desktop = selectedTab == MainTab.HOME
    Row(
            modifier = modifier.selectableGroup().padding(horizontal = 8.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MainTab.entries.forEach { tab ->
                val label = stringResource(tab.label)
                val selected = tab == selectedTab
                if (desktop) {
                    Box(
                        Modifier.weight(1f).height(HomeDockHeight)
                            .selectable(selected, onClick = { onSelect(tab) }, role = Role.Tab),
                        contentAlignment = Alignment.Center,
                    ) { DockShortcut(tab, label) }
                } else {
                    val tint by animateColorAsState(
                        if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        tween(AppMotion.FastMs), label = "tab-tint",
                    )
                    Column(
                        modifier = Modifier.weight(1f).padding(horizontal = 2.dp)
                            .clip(RoundedCornerShape(24.dp))
                            .background(if (selected) tint.copy(alpha = 0.1f) else Color.Transparent)
                            .selectable(selected, onClick = { onSelect(tab) }, role = Role.Tab)
                            .padding(vertical = 7.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Icon(tab.icon, contentDescription = label, tint = tint, modifier = Modifier.size(24.dp))
                        Text(label, style = MaterialTheme.typography.labelSmall, color = tint,
                            maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
}

@Composable
private fun DockShortcut(tab: MainTab, label: String) {
    val colors = remember(tab) {
        when (tab) {
            MainTab.HOME -> listOf(Color(0xFF65DF8C), Color(0xFF10B458))
            MainTab.ADD -> listOf(Color(0xFF62B7FF), Color(0xFF0766E8))
            MainTab.BROWSE -> listOf(Color(0xFFFFFFFF), Color(0xFFD8F1FF))
            MainTab.ME -> listOf(Color(0xFFD7DCE4), Color(0xFF8A939F))
        }
    }
    val shape = RoundedCornerShape(27)
    Box(
        Modifier.size(58.dp).clip(shape).background(Brush.verticalGradient(colors))
            .border(0.5.dp, Color.White.copy(alpha = 0.52f), shape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            tab.icon, contentDescription = label,
            tint = when (tab) {
                MainTab.BROWSE -> Color(0xFF087DDB)
                MainTab.ME -> Color(0xFF434A55)
                else -> Color.White
            },
            modifier = Modifier.size(if (tab == MainTab.BROWSE) 44.dp else 35.dp),
        )
    }
}
