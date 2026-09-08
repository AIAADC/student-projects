package com.webshell.feature.add

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webshell.core.data.HomeSlotAllocator
import com.webshell.core.data.SettingsRepository
import com.webshell.core.data.UserIconRepository
import com.webshell.core.data.WebAppDao
import com.webshell.core.data.metadata.SiteMetadataFetcher
import com.webshell.core.model.AppLog
import dagger.hilt.android.lifecycle.HiltViewModel
import java.net.URLDecoder
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@HiltViewModel
class AddViewModel @Inject constructor(
    private val fetcher: SiteMetadataFetcher,
    private val importer: LocalAppImporter,
    private val dao: WebAppDao,
    private val settingsRepository: SettingsRepository,
    private val icons: UserIconRepository,
) : ViewModel() {
    private val _state = MutableStateFlow<AddUiState>(AddUiState.Input)
    val state: StateFlow<AddUiState> = _state.asStateFlow()
    private val _created = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val created: SharedFlow<Unit> = _created.asSharedFlow()
    private val _messages = MutableSharedFlow<Int>(extraBufferCapacity = 1)
    /** String resources only: failure details and local file paths are not presented or logged. */
    val messages: SharedFlow<Int> = _messages.asSharedFlow()
    private var preparation: Job? = null
    private var revision = 0L

    fun confirmUrl(rawUrl: String) {
        val normalized = AddUrl.normalize(rawUrl) ?: return
        preparation?.cancel()
        val expectedRevision = ++revision
        _state.value = AddUiState.Loading
        preparation = viewModelScope.launch {
            val metadata = fetcher.fetch(normalized).getOrNull()
            if (revision != expectedRevision) return@launch
            _state.value = if (metadata == null) {
                AppLog.warn("add", "Metadata unavailable; manual editor shown")
                AddUiState.Edit(
                    draft = AddDraft(appId = newAppId(), url = normalized, title = AddUrl.hostLabel(normalized)),
                    fetchFailed = true,
                )
            } else {
                AddUiState.Edit(
                    draft = AddDraft(
                        appId = newAppId(),
                        url = metadata.finalUrl,
                        title = metadata.title,
                        iconUrl = metadata.iconUrl.orEmpty(),
                    ),
                )
            }
        }
    }

    fun importLocal(uris: List<Uri>) {
        if (uris.isEmpty()) return
        preparation?.cancel()
        val expectedRevision = ++revision
        _state.value = AddUiState.Loading
        preparation = viewModelScope.launch {
            val appId = newAppId()
            val result = importer.import(appId, uris)
            if (revision != expectedRevision) return@launch
            result.onSuccess { entryUrl ->
                val entryName = runCatching {
                    URLDecoder.decode(entryUrl.substringAfterLast('/'), Charsets.UTF_8)
                }.getOrDefault("index.html")
                _state.value = AddUiState.Edit(
                    AddDraft(appId = appId, url = entryUrl, title = entryName.substringBeforeLast('.'), isLocal = true),
                )
            }.onFailure {
                AppLog.warn("add", "Local import failed")
                _state.value = AddUiState.Input
                _messages.tryEmit(R.string.add_import_failed)
            }
        }
    }

    fun importIcon(uri: Uri) {
        val editor = _state.value as? AddUiState.Edit ?: return
        if (editor.isSaving || editor.isImportingIcon) return
        val expectedId = editor.draft.appId
        _state.value = editor.copy(isImportingIcon = true)
        viewModelScope.launch {
            val result = icons.importIcon(uri)
            val current = _state.value as? AddUiState.Edit ?: return@launch
            if (current.draft.appId != expectedId) return@launch
            _state.value = current.copy(
                draft = result.getOrNull()?.let { current.draft.copy(iconUrl = it) } ?: current.draft,
                isImportingIcon = false,
            )
            if (result.isFailure) _messages.tryEmit(R.string.add_icon_import_failed)
        }
    }

    fun updateDraft(transform: (AddDraft) -> AddDraft) {
        val editor = _state.value as? AddUiState.Edit ?: return
        if (!editor.isSaving && !editor.isImportingIcon) _state.value = editor.copy(draft = transform(editor.draft))
    }

    fun save() {
        val editor = _state.value as? AddUiState.Edit ?: return
        if (editor.isSaving || editor.isImportingIcon) return
        val draft = editor.draft
        if (!draft.isLocal && AddUrl.normalize(draft.url) == null) {
            _messages.tryEmit(R.string.add_address_error)
            return
        }
        _state.value = editor.copy(isSaving = true)
        viewModelScope.launch {
            try {
                val settings = settingsRepository.settings.first()
                val (page, slot) = if (settings.autoArrangeHome) 0 to -1 else {
                    HomeSlotAllocator.appendSlot(
                        apps = dao.observeAll().first(),
                        pageCapacity = (settings.gridColumns * settings.gridRows).coerceAtLeast(1),
                    )
                }
                dao.upsert(draft.toNewEntity(page, slot, System.currentTimeMillis(), newAppId()))
                AppLog.log("add", "Site shortcut created")
                _messages.tryEmit(R.string.add_saved)
                _created.tryEmit(Unit)
                _state.value = AddUiState.Input
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                AppLog.warn("add", "Site save failed")
                _state.value = editor
                _messages.tryEmit(R.string.add_save_failed)
            }
        }
    }

    fun reset() {
        if ((_state.value as? AddUiState.Edit)?.isSaving == true) return
        preparation?.cancel()
        revision++
        _state.value = AddUiState.Input
    }

    private fun newAppId(): String = "app-" + UUID.randomUUID().toString().take(8)
}
