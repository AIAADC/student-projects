package com.webshell.feature.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Derived rendering inputs, not a second source of interaction/session state. */
internal data class HomeGridLayout(
    val pages: List<List<HomeCell?>>,
    val flatCells: List<HomeCell?>,
    val pageCapacity: Int,
    val columns: Int,
    val verticalMode: Boolean,
    val freePlacement: Boolean,
    val tempLeftOffset: Int,
    val addSlotIndex: Int,
    val addFlatIndex: Int,
)

/** Both renderers use the same fixed slots. This container never owns a drag gesture coroutine. */
@Composable
internal fun HomeGridPages(
    layout: HomeGridLayout,
    geometry: LauncherGeometry,
    pagerState: PagerState,
    lazyGridState: LazyGridState,
    isDragging: Boolean,
    renderSlot: @Composable (page: Int, slot: Int, cell: HomeCell?, isAdd: Boolean) -> Unit,
    renderDenseAdd: @Composable () -> Unit,
) {
    val padding = PaddingValues(
        start = geometry.horizontalPaddingDp.dp, top = geometry.topPaddingDp.dp,
        end = geometry.horizontalPaddingDp.dp, bottom = geometry.bottomPaddingDp.dp,
    )
    if (layout.verticalMode) {
        LazyVerticalGrid(
            columns = GridCells.Fixed(layout.columns), state = lazyGridState, modifier = Modifier.fillMaxSize(),
            contentPadding = padding,
            horizontalArrangement = Arrangement.spacedBy(geometry.columnGapDp.dp),
            verticalArrangement = Arrangement.spacedBy(geometry.rowGapDp.dp),
            userScrollEnabled = !isDragging,
        ) {
            itemsIndexed(layout.flatCells, key = { index, cell -> cell?.key ?: "vslot-$index" }) { index, cell ->
                renderSlot(index / layout.pageCapacity, index % layout.pageCapacity, cell, index == layout.addFlatIndex)
            }
        }
    } else {
        HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize(), userScrollEnabled = !isDragging) { page ->
            val dataPage = page - layout.tempLeftOffset
            val cells = layout.pages.getOrNull(dataPage) ?: List(layout.pageCapacity) { null }
            LazyVerticalGrid(
                columns = GridCells.Fixed(layout.columns), modifier = Modifier.fillMaxSize(), contentPadding = padding,
                horizontalArrangement = Arrangement.spacedBy(geometry.columnGapDp.dp),
                verticalArrangement = Arrangement.spacedBy(geometry.rowGapDp.dp),
                // Short/large-type pages may overflow vertically, never clip accessible labels.
                userScrollEnabled = geometry.requiresVerticalScroll && !isDragging,
            ) {
                itemsIndexed(cells, key = { slot, cell -> cell?.key ?: "slot-$page-$slot" }) { slot, cell ->
                    renderSlot(page, slot, cell, dataPage == layout.pages.lastIndex && slot == layout.addSlotIndex)
                }
                if (!layout.freePlacement && dataPage == layout.pages.lastIndex) {
                    item(key = "__add__") { renderDenseAdd() }
                }
            }
        }
    }
}
