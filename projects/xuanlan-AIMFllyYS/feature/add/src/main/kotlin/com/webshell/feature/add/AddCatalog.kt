package com.webshell.feature.add

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import com.webshell.core.designsystem.catalog.CatalogCategory
import com.webshell.core.designsystem.catalog.CatalogEntry

/** The app hosts these scenes; all input is in memory and callbacks never invoke business code. */
fun addCatalog(): List<CatalogEntry> = listOf(
    CatalogEntry("add.input", CatalogCategory.FORMS, R.string.add_catalog_input, R.string.add_catalog_input_detail) {
        CatalogInput(error = false)
    },
    CatalogEntry("add.input.error", CatalogCategory.FORMS, R.string.add_catalog_error, R.string.add_catalog_error_detail) {
        CatalogInput(error = true)
    },
    CatalogEntry("add.loading", CatalogCategory.CONTENT, R.string.add_catalog_loading, R.string.add_catalog_loading_detail) {
        AddLoadingContent()
    },
    CatalogEntry("add.editor", CatalogCategory.FORMS, R.string.add_catalog_editor, R.string.add_catalog_editor_detail) {
        CatalogEditor(local = false, fetchFailed = false)
    },
    CatalogEntry("add.editor.manual", CatalogCategory.FORMS, R.string.add_catalog_manual, R.string.add_catalog_manual_detail) {
        CatalogEditor(local = false, fetchFailed = true)
    },
    CatalogEntry("add.editor.local", CatalogCategory.FORMS, R.string.add_catalog_local, R.string.add_catalog_local_detail) {
        CatalogEditor(local = true, fetchFailed = false)
    },
)

@Composable
private fun CatalogInput(error: Boolean) {
    var url by remember { mutableStateOf(if (error) "https://" else "") }
    var invalid by remember { mutableStateOf(error) }
    AddInputContent(
        url = url, showError = invalid,
        onUrlChange = { url = it; invalid = false },
        onContinue = { invalid = AddUrl.normalize(url) == null },
        onImportLocal = {},
    )
}

@Composable
private fun CatalogEditor(local: Boolean, fetchFailed: Boolean) {
    val title = stringResource(if (local) R.string.add_catalog_local_name else R.string.add_catalog_site_name)
    var draft by remember(local) {
        mutableStateOf(AddDraft(
            appId = "catalog-add", title = title, isLocal = local,
            url = if (local) "local://catalog-add/index.html" else "https://example.invalid/reading",
        ))
    }
    AddEditorContent(
        state = AddUiState.Edit(draft = draft, fetchFailed = fetchFailed),
        onUpdate = { transform -> draft = transform(draft) },
        onSave = {}, onBack = {}, onPickIcon = {},
    )
}
