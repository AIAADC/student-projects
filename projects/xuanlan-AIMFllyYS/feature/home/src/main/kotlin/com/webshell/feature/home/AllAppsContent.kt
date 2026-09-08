package com.webshell.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.changedToUp
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.components.AppSearchField
import kotlinx.coroutines.launch

/** Pure library scene shared by the dialog and Playbook. Indexes are precomputed by the caller. */
@Composable
internal fun AllAppsContent(
    sections: List<AllAppsIndex.Section>,
    columns: Int,
    iconSize: Dp,
    cornerRadiusPercent: Int,
    onLaunch: (String, String) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var query by remember { mutableStateOf("") }
    val filteredSections = remember(sections, query) { AllAppsIndex.filterSections(sections, query) }
    // Search reuses the precomputed alphabetical order; no pinyin work runs per keystroke.
    val flat = remember(filteredSections) { AllAppsIndex.flatten(filteredSections) }
    val gridState = rememberLazyGridState()
    val scope = rememberCoroutineScope()
    val letters = remember { ('A'..'Z').map { it.toString() } + AllAppsIndex.OTHER_SECTION }
    val present = remember(filteredSections) { filteredSections.mapTo(HashSet()) { it.letter } }
    var activeLetter by remember { mutableStateOf<String?>(null) }
    var barHeightPx by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(query) {
        activeLetter = null
        gridState.scrollToItem(0)
    }

    BoxWithConstraints(
        modifier = modifier
            .fillMaxSize()
            // Paint first, then inset content: the same opaque surface covers system bars.
            .background(MaterialTheme.colorScheme.background)
            .safeDrawingPadding(),
    ) {
        val density = LocalDensity.current
        val safeColumns = columns.coerceAtLeast(1)
        val libraryIconSize = iconSize.coerceAtMost(
            ((maxWidth - 56.dp - 8.dp * (safeColumns - 1)) / safeColumns - 4.dp).coerceAtLeast(16.dp),
        )
        val labelMeasurer = rememberTextMeasurer()
        val labelLineHeight = with(density) {
            labelMeasurer.measure("国Hg", style = MaterialTheme.typography.labelSmall, maxLines = 1).size.height.toDp()
        }
        val libraryCellHeight = libraryIconSize + labelLineHeight + 13.dp
        // The header is measured at its real font-scaled height. The list and letter rail
        // share the remaining body; neither assumes a 132dp header or a screen coordinate.
        Column(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Text(
                        stringResource(R.string.home_app_library),
                        style = MaterialTheme.typography.headlineLarge,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = onDismiss) { Text(stringResource(R.string.home_cancel)) }
                }
                AppSearchField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = stringResource(R.string.home_search_apps),
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                )
            }
            BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
                // The small alphabetical rail is a navigation affordance, not reading content.
                // Fit its line boxes into its measured body even in landscape / large-text mode.
                val railSlotHeight = ((maxHeight - 30.dp).coerceAtLeast(1.dp) / letters.size)
                val railFontSize = with(density) { (railSlotHeight * 0.68f).coerceAtMost(11.dp).toSp() }
                val railLineHeight = with(density) { railSlotHeight.toSp() }
                LazyVerticalGrid(
                    columns = GridCells.Fixed(columns.coerceAtLeast(1)),
                    state = gridState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = 16.dp,
                        top = 10.dp,
                        end = 40.dp, // 给右侧字母索引条留位
                        bottom = 24.dp,
                    ),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    itemsIndexed(
                        items = flat.items,
                        key = { _, item ->
                            when (item) {
                                is AllAppsIndex.Item.Header -> "header-${item.letter}"
                                is AllAppsIndex.Item.Entry -> item.app.id
                            }
                        },
                        span = { _, item ->
                            // 分区头独占整行
                            if (item is AllAppsIndex.Item.Header) {
                                GridItemSpan(maxLineSpan)
                            } else {
                                GridItemSpan(1)
                            }
                        },
                    ) { _, item ->
                        when (item) {
                            is AllAppsIndex.Item.Header -> Text(
                                item.letter,
                                style = MaterialTheme.typography.titleLarge,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.padding(top = 10.dp, bottom = 2.dp),
                            )
                            is AllAppsIndex.Item.Entry -> Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier
                                    .fillMaxWidth().height(libraryCellHeight)
                                    .clip(RoundedCornerShape(12.dp))
                                    .clickable { onLaunch(item.app.id, item.app.url) }
                                    .padding(vertical = 4.dp),
                            ) {
                                AppIcon(
                                    app = item.app,
                                    size = libraryIconSize,
                                    cornerRadiusPercent = cornerRadiusPercent,
                                )
                                Text(
                                    item.app.title,
                                    style = MaterialTheme.typography.labelSmall,
                                    maxLines = 1,
                                    textAlign = TextAlign.Center,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.fillMaxWidth().padding(top = 5.dp),
                                )
                            }
                        }
                    }
                }

                if (flat.items.isEmpty()) {
                    Text(
                        stringResource(R.string.home_no_search_results),
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.align(Alignment.Center),
                    )
                }

                // 右侧字母索引条：A→Z + # 等分纵向排列；点按与按住滑动共用一条手势通道，
                // 按 y 等比映射字母；无应用的分区置灰不跳转。
                Column(
                    verticalArrangement = Arrangement.Center,
                    modifier = Modifier
                        .align(Alignment.CenterEnd)
                        .fillMaxHeight()
                        .width(28.dp)
                        .padding(top = 10.dp, end = 4.dp, bottom = 20.dp)
                        .onSizeChanged { barHeightPx = it.height.toFloat() }
                        .pointerInput(letters, flat) {
                            awaitEachGesture {
                                val down = awaitFirstDown()
                                fun jumpTo(y: Float) {
                                    if (barHeightPx <= 0f) return
                                    val index = ((y / barHeightPx) * letters.size)
                                        .toInt()
                                        .coerceIn(0, letters.size - 1)
                                    val letter = letters[index]
                                    if (letter in present && activeLetter != letter) {
                                        activeLetter = letter
                                        flat.sectionFirstIndex[letter]?.let { firstIndex ->
                                            scope.launch { gridState.scrollToItem(firstIndex) }
                                        }
                                    }
                                }
                                jumpTo(down.position.y)
                                while (true) {
                                    val change = awaitPointerEvent()
                                        .changes.firstOrNull { it.id == down.id }
                                        ?: break
                                    if (change.changedToUp()) break
                                    change.consume()
                                    jumpTo(change.position.y)
                                }
                                activeLetter = null
                            }
                        },
                ) {
                    letters.forEach { letter ->
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .fillMaxWidth()
                                .weight(1f),
                        ) {
                            Text(
                                letter,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = railFontSize,
                                    lineHeight = railLineHeight,
                                ),
                                color = if (letter in present) {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                } else {
                                    // 无应用的分区置灰且不可点
                                    MaterialTheme.colorScheme.outlineVariant
                                },
                            )
                        }
                    }
                }

                // 当前字母放大气泡（索引条左侧）
                activeLetter?.let { letter ->
                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .align(Alignment.CenterEnd)
                            .padding(end = 44.dp)
                            .size(56.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.primary),
                    ) {
                        Text(
                            letter,
                            style = MaterialTheme.typography.headlineSmall,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    }
                }
            }
        }
    }
}
