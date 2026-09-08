package com.webshell.feature.add

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/** Route owns lifecycle, activity results and one-shot feedback; catalog reuses pure presentation. */
@Composable
fun AddScreen(
    modifier: Modifier = Modifier,
    onCreated: () -> Unit = {},
    viewModel: AddViewModel = androidx.hilt.navigation.compose.hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val currentOnCreated by rememberUpdatedState(onCreated)
    val importLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) {
        viewModel.importLocal(it)
    }
    val iconLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let(viewModel::importIcon)
    }
    var urlText by rememberSaveable { mutableStateOf("") }
    var showError by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(viewModel) {
        viewModel.messages.collect { Toast.makeText(context, context.getString(it), Toast.LENGTH_SHORT).show() }
    }
    LaunchedEffect(viewModel) {
        viewModel.created.collect {
            urlText = ""
            showError = false
            currentOnCreated()
        }
    }
    BackHandler(enabled = state != AddUiState.Input) { viewModel.reset() }
    when (val current = state) {
        AddUiState.Input -> AddInputContent(
            url = urlText,
            showError = showError,
            onUrlChange = { urlText = it; showError = false },
            onContinue = {
                if (AddUrl.normalize(urlText) != null) viewModel.confirmUrl(urlText) else showError = true
            },
            onImportLocal = { importLauncher.launch(arrayOf("text/html")) },
            modifier = modifier,
        )
        AddUiState.Loading -> AddLoadingContent(modifier)
        is AddUiState.Edit -> AddEditorContent(
            state = current,
            onUpdate = viewModel::updateDraft,
            onSave = viewModel::save,
            onBack = viewModel::reset,
            onPickIcon = {
                iconLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            },
            modifier = modifier,
        )
    }
}
