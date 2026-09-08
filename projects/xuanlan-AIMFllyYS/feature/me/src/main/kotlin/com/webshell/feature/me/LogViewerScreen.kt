package com.webshell.feature.me

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.unit.IntOffset
import com.webshell.core.designsystem.components.AppContextMenu
import com.webshell.core.designsystem.components.AppContextMenuItem
import com.webshell.core.designsystem.components.AppConfirmDialog
import com.webshell.core.designsystem.components.AppFilterChip
import com.webshell.core.designsystem.components.AppListRow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webshell.core.data.LogEntity
import com.webshell.core.designsystem.components.AppNavigationBar
import com.webshell.core.designsystem.theme.AppSpacing
import com.webshell.core.model.AppLog
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 日志查看器：从 Room 倒序分页加载（每页 30 条，滚动到底自动加载更多），
 * 支持按标签过滤、复制/分享完整导出（TXT 经 FileProvider）、二次确认后清空。
 */
@Composable
internal fun LogViewerPage(
    onBack: () -> Unit,
    viewModel: LogViewerViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showClearConfirm by remember { mutableStateOf(false) }
    var showActions by remember { mutableStateOf(false) }
    var menuAnchor by remember { mutableStateOf(IntOffset.Zero) }

    /** 完整导出（含头部）+ 当前过滤条件下的全部条目 */
    suspend fun fullExport(): String =
        buildExportHeader(context, state.totalCount) + "\n\n" + viewModel.exportText()

    fun copyAll() {
        scope.launch {
            val text = fullExport()
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("app_log", text))
        }
    }

    fun shareAll() {
        scope.launch {
            val text = fullExport()
            val stamp = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date())
            val file = withContext(Dispatchers.IO) {
                val dir = File(context.cacheDir, "logs").apply { mkdirs() }
                File(dir, "PocketWebShell-logs-$stamp.txt").apply { writeText(text) }
            }
            val uri = FileProvider.getUriForFile(
                context,
                "${context.packageName}.fileprovider",
                file,
            )
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(Intent.createChooser(send, context.getString(R.string.me_log_share_title)))
        }
    }

    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        AppNavigationBar(title = stringResource(R.string.me_logs), onBack = onBack, actions = {
            Box(Modifier.onGloballyPositioned { coordinates ->
                val position = coordinates.positionInWindow()
                menuAnchor = IntOffset((position.x + coordinates.size.width / 2).toInt(), (position.y + coordinates.size.height).toInt())
            }) {
                IconButton(onClick = { showActions = true }) {
                    Icon(Icons.Filled.MoreHoriz, stringResource(R.string.me_log_actions))
                }

            }
        })

        if (state.tags.isNotEmpty()) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(AppSpacing.sm),
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = AppSpacing.lg),
            ) {
                AppFilterChip(stringResource(R.string.me_log_all), selected = state.tagFilter == null,
                    onClick = { viewModel.setTagFilter(null) })
                state.tags.forEach { tag ->
                    AppFilterChip(tag, selected = state.tagFilter == tag,
                        onClick = { viewModel.setTagFilter(if (state.tagFilter == tag) null else tag) })
                }
            }
            Spacer(Modifier.height(AppSpacing.sm))
        }

        if (state.loadFailed && state.entries.isNotEmpty()) {
            AppListRow(stringResource(R.string.me_log_failed), onClick = viewModel::refresh)
        }
        if (state.entries.isEmpty()) {
            Text(
                text = if (state.loadFailed) stringResource(R.string.me_log_failed)
                else if (state.refreshing) stringResource(R.string.me_log_loading)
                else if (state.tagFilter == null) {
                    stringResource(R.string.me_log_empty)
                } else {
                    stringResource(R.string.me_log_empty_filter)
                },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(AppSpacing.lg),
            )
        } else {
            val listState = rememberLazyListState()
            // 最后一个可见 item 到达末尾时自动加载下一页
            val reachedEnd by remember {
                derivedStateOf {
                    val info = listState.layoutInfo
                    val last = info.visibleItemsInfo.lastOrNull() ?: return@derivedStateOf false
                    last.index >= info.totalItemsCount - 1
                }
            }
            LaunchedEffect(reachedEnd, state.entries.size, state.hasMore, state.refreshing) {
                if (reachedEnd && !state.refreshing && !state.loadFailed) viewModel.loadMore()
            }

            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    horizontal = AppSpacing.lg,
                    vertical = AppSpacing.sm,
                ),
            ) {
                items(state.entries, key = { it.id }) { entry ->
                    LogRow(entry)
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                }
                item {
                    Text(
                        text = if (state.hasMore || state.loadingMore) {
                            stringResource(R.string.me_log_loading)
                        } else {
                            stringResource(R.string.me_log_count, state.entries.size, state.totalCount)
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = AppSpacing.sm),
                    )
                }
            }
        }
    }

    if (showActions) {
        AppContextMenu(
            items = listOf(
                AppContextMenuItem(stringResource(R.string.me_log_refresh), Icons.Filled.Refresh) { viewModel.refresh() },
                AppContextMenuItem(stringResource(R.string.me_log_copy), Icons.Filled.ContentCopy) { copyAll() },
                AppContextMenuItem(stringResource(R.string.me_log_share), Icons.Filled.Share) { shareAll() },
                AppContextMenuItem(stringResource(R.string.me_log_clear), Icons.Filled.Delete, destructive = true) { showClearConfirm = true },
            ),
            onDismiss = { showActions = false },
            anchorPoint = menuAnchor,
        )
    }
    if (showClearConfirm) {
        AppConfirmDialog(
            title = stringResource(R.string.me_log_clear_title),
            text = stringResource(R.string.me_log_clear_hint),
            confirmText = stringResource(R.string.me_clear),
            dismissText = stringResource(R.string.me_cancel),
            destructive = true,
            onConfirm = { showClearConfirm = false; viewModel.clear() },
            onDismiss = { showClearConfirm = false },
        )
    }
}

/** Message stays full width; header metadata wraps without stealing its reading column. */
@Composable
internal fun LogRow(entry: LogEntity) {
    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Text(AppLog.formatTime(entry.timeMillis), style = MaterialTheme.typography.labelSmall,
                fontFamily = FontFamily.Monospace, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(8.dp))
            Text(entry.tag, style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
        }
        Text(entry.message, style = MaterialTheme.typography.bodySmall,
            color = if (entry.level == AppLog.Level.ERROR.name) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
    }
}

/** 导出头部：应用版本、设备与系统版本、条目总数（设备信息在 Composable 侧拼装） */
private fun buildExportHeader(context: Context, totalCount: Int): String {
    val info = runCatching { context.packageManager.getPackageInfo(context.packageName, 0) }.getOrNull()
    val exportedAt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date())
    return buildString {
        appendLine("PocketWebShell 日志导出")
        appendLine("导出时间：$exportedAt")
        appendLine("应用版本：${info?.versionName ?: "?"}(${info?.longVersionCode ?: "?"})")
        appendLine("设备：${Build.MANUFACTURER} ${Build.MODEL}")
        appendLine("Android：${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})")
        append("条目总数：$totalCount")
    }
}
