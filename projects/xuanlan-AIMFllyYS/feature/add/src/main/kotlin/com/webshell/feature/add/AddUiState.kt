package com.webshell.feature.add

/** New-site draft only. Legacy website text zoom remains in persistence, not in this editor. */
data class AddDraft(
    val appId: String = "",
    val url: String = "",
    val title: String = "",
    val iconUrl: String = "",
    val desktopMode: Boolean = false,
    val darkMode: Boolean = false,
    val keepAlive: Boolean = true,
    val externalLinksToBrowser: Boolean = false,
    val isLocal: Boolean = false,
)

sealed interface AddUiState {
    data object Input : AddUiState
    data object Loading : AddUiState
    data class Edit(
        val draft: AddDraft,
        val fetchFailed: Boolean = false,
        val isSaving: Boolean = false,
        val isImportingIcon: Boolean = false,
    ) : AddUiState
}
