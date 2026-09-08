package com.webshell.feature.me

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webshell.core.data.LogEntity
import com.webshell.core.data.LogRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job

data class LogViewerUiState(
    /** 已加载的条目（最新在前） */
    val entries: List<LogEntity> = emptyList(),
    val tags: List<String> = emptyList(),
    val tagFilter: String? = null,
    val hasMore: Boolean = false,
    val loadingMore: Boolean = false,
    /** 当前过滤条件下的总条数 */
    val totalCount: Int = 0,
    val refreshing: Boolean = false,
    val loadFailed: Boolean = false,
)

/**
 * 日志查看页状态中枢：从 Room 分页读取（每页 [PAGE_SIZE] 条），
 * 标签过滤变化时重置分页重查；清空后自动刷新。
 */
@HiltViewModel
class LogViewerViewModel @Inject constructor(
    private val logRepository: LogRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(LogViewerUiState())
    val state: StateFlow<LogViewerUiState> = _state.asStateFlow()
    private var queryGeneration = 0L
    private var refreshJob: Job? = null
    private var pageJob: Job? = null

    init {
        refresh()
    }

    fun refresh() {
        val generation = ++queryGeneration
        val tag = _state.value.tagFilter
        refreshJob?.cancel()
        pageJob?.cancel()
        _state.value = _state.value.copy(refreshing = true, loadingMore = false, loadFailed = false)
        refreshJob = viewModelScope.launch {
            try {
                val entries = logRepository.page(PAGE_SIZE, 0, tag)
                val total = logRepository.count(tag)
                val tags = logRepository.tags()
                if (generation != queryGeneration) return@launch
                _state.value = _state.value.copy(
                    entries = entries, tags = tags, totalCount = total,
                    hasMore = entries.size < total, refreshing = false, loadingMore = false,
                )
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                if (generation == queryGeneration) _state.value = _state.value.copy(refreshing = false, loadFailed = true)
            }
        }
    }

    /** 滚动到底部时追加下一页；无硬性总上限 */
    fun loadMore() {
        val s = _state.value
        if (s.refreshing || s.loadingMore || !s.hasMore) return
        val generation = queryGeneration
        _state.value = s.copy(loadingMore = true)
        pageJob = viewModelScope.launch {
            try {
                val more = logRepository.page(PAGE_SIZE, s.entries.size, s.tagFilter)
                // A late page for an old filter must never be mixed into the newly selected tag.
                if (generation != queryGeneration || s.tagFilter != _state.value.tagFilter) return@launch
                val combined = (_state.value.entries + more).distinctBy { it.id }
                _state.value = _state.value.copy(
                    entries = combined, loadingMore = false, loadFailed = false,
                    hasMore = more.size >= PAGE_SIZE && combined.size < _state.value.totalCount,
                )
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                if (generation == queryGeneration) _state.value = _state.value.copy(loadingMore = false, loadFailed = true)
            }
        }
    }

    fun setTagFilter(tag: String?) {
        if (_state.value.tagFilter == tag) return
        _state.value = _state.value.copy(tagFilter = tag, entries = emptyList(), hasMore = false)
        refresh()
    }

    fun clear() {
        viewModelScope.launch {
            try {
                logRepository.clear()
                refresh()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                _state.value = _state.value.copy(loadFailed = true)
            }
        }
    }

    /** 导出当前过滤条件下的全部条目（不只是已加载页） */
    suspend fun exportText(): String = logRepository.exportAllText(_state.value.tagFilter)

    companion object {
        const val PAGE_SIZE = 30
    }
}
