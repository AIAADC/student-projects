package com.webshell.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import com.webshell.core.data.WebAppEntity
import com.webshell.core.designsystem.components.staticGlassSurface

/** iOS folder: title outside the glass sheet, nine fixed cells per page, no unbounded column. */
@Composable
internal fun FolderExpandedPage(
    members: List<WebAppEntity>,
    cornerRadiusPercent: Int,
    onLaunch: (String, String) -> Unit,
    onDissolve: () -> Unit,
    onDismiss: () -> Unit,
) {
    val folderPages = remember(members) { members.chunked(9).ifEmpty { listOf(emptyList()) } }
    val pagerState = rememberPagerState(pageCount = { folderPages.size })
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    ) {
        val window = (LocalView.current.parent as? DialogWindowProvider)?.window
        LaunchedEffect(window) { window?.setDimAmount(0f) }
        Box(
            modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.38f)).clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onDismiss,
            ),
        ) {
            // Scrim covers system bars; only interactive folder content consumes safe insets.
            BoxWithConstraints(Modifier.fillMaxSize().safeDrawingPadding()) {
                val density = LocalDensity.current
                val labelMeasurer = rememberTextMeasurer()
                val labelHeight = with(density) {
                    labelMeasurer.measure("国Hg", style = MaterialTheme.typography.labelSmall, maxLines = 1).size.height.toDp()
                }
                val sheetHeight = (maxHeight * 0.58f).coerceAtMost(368.dp)
                val memberSize = ((maxWidth - 48.dp - 48.dp) / 3).coerceAtMost(60.dp).coerceAtLeast(24.dp)
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.align(Alignment.Center).fillMaxWidth().heightIn(max = maxHeight).padding(horizontal = 24.dp),
                ) {
                    Text(
                        stringResource(R.string.home_folder),
                        style = MaterialTheme.typography.headlineLarge.copy(fontWeight = FontWeight.Normal),
                        color = Color.White,
                        modifier = Modifier.padding(bottom = 24.dp),
                    )
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.weight(1f, fill = false).widthIn(max = 380.dp).fillMaxWidth()
                            .staticGlassSurface(shape = RoundedCornerShape(36.dp), opacity = 0.88f)
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                            ) { /* Keep taps on the sheet out of the dismiss target. */ }
                            .padding(top = 18.dp, bottom = 12.dp),
                    ) {
                        HorizontalPager(state = pagerState, modifier = Modifier.fillMaxWidth().height(sheetHeight)) { page ->
                            LazyVerticalGrid(
                                columns = GridCells.Fixed(3),
                                modifier = Modifier.fillMaxSize(),
                                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                                verticalArrangement = Arrangement.spacedBy(18.dp),
                            ) {
                                items(folderPages[page], key = { it.id }) { member ->
                                    Column(
                                        horizontalAlignment = Alignment.CenterHorizontally,
                                        modifier = Modifier.fillMaxWidth().height(memberSize + labelHeight + 8.dp)
                                            .clickable { onLaunch(member.id, member.url) },
                                    ) {
                                        AppIcon(member, memberSize, cornerRadiusPercent)
                                        Text(
                                            member.title,
                                            style = MaterialTheme.typography.labelSmall,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            maxLines = 1,
                                            textAlign = TextAlign.Center,
                                            overflow = TextOverflow.Ellipsis,
                                            modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                                        )
                                    }
                                }
                            }
                        }
                        if (folderPages.size > 1) {
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(vertical = 6.dp)) {
                                repeat(folderPages.size) { index ->
                                    Box(Modifier.size(6.dp).background(
                                        MaterialTheme.colorScheme.onSurface.copy(alpha = if (pagerState.currentPage == index) 0.9f else 0.2f),
                                        CircleShape,
                                    ))
                                }
                            }
                        }
                    }
                    TextButton(onClick = onDissolve, modifier = Modifier.padding(top = 16.dp)) {
                        Text(stringResource(R.string.home_folder_dissolve), color = Color.White.copy(alpha = 0.9f))
                    }
                }
            }
        }
    }
}
