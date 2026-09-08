package com.webshell.core.designsystem.catalog

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.R
import com.webshell.core.designsystem.components.AppConfirmDialog
import com.webshell.core.designsystem.components.AppContextMenu
import com.webshell.core.designsystem.components.AppContextMenuItem
import com.webshell.core.designsystem.components.AppFilterChip
import com.webshell.core.designsystem.components.AppFormField
import com.webshell.core.designsystem.components.AppListDivider
import com.webshell.core.designsystem.components.AppListRow
import com.webshell.core.designsystem.components.AppNavigationBar
import com.webshell.core.designsystem.components.AppPrimaryButton
import com.webshell.core.designsystem.components.AppSearchField
import com.webshell.core.designsystem.components.AppSelectionRow
import com.webshell.core.designsystem.components.AppSettingsSection
import com.webshell.core.designsystem.components.AppSheet
import com.webshell.core.designsystem.components.AppToggleRow
import com.webshell.core.designsystem.components.AppValueSlider
import com.webshell.core.designsystem.components.AppValueStepper
import com.webshell.core.designsystem.components.SiteIcon

/** Every demo calls the same component used in production, with only local fixture state. */
fun designSystemCatalog(): List<CatalogEntry> = foundationCatalog() + listOf(
    CatalogEntry("design.navigation", CatalogCategory.NAVIGATION, R.string.catalog_navigation, R.string.catalog_navigation_hint, layout = CatalogLayout.ScrollContent) {
        AppNavigationBar(stringResource(R.string.catalog_navigation), onBack = {}) {
            IconButton(onClick = {}) { Icon(Icons.Rounded.MoreHoriz, stringResource(R.string.catalog_actions)) }
        }
    },
    CatalogEntry("design.buttons", CatalogCategory.NAVIGATION, R.string.catalog_buttons, R.string.catalog_buttons_hint, layout = CatalogLayout.ScrollContent) { ButtonsSample() },
    CatalogEntry("design.fields", CatalogCategory.FORMS, R.string.catalog_fields, R.string.catalog_fields_hint, layout = CatalogLayout.ScrollContent) { FieldsSample() },
    CatalogEntry("design.selection", CatalogCategory.FORMS, R.string.catalog_selection, R.string.catalog_selection_hint, layout = CatalogLayout.ScrollContent) { SelectionSample() },
    CatalogEntry("design.values", CatalogCategory.FORMS, R.string.catalog_values, R.string.catalog_values_hint, layout = CatalogLayout.ScrollContent) { ValuesSample() },
    CatalogEntry("design.grouped-list", CatalogCategory.CONTENT, R.string.catalog_lists, R.string.catalog_lists_hint, layout = CatalogLayout.ScrollContent) { ListsSample() },
    CatalogEntry("design.site-icon", CatalogCategory.CONTENT, R.string.catalog_icons, R.string.catalog_icons_hint, layout = CatalogLayout.ScrollContent) {
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            SiteIcon(stringResource(R.string.catalog_sample_name), null)
            SiteIcon(stringResource(R.string.catalog_sample_local), null, localFallback = true)
            SiteIcon("", null, size = 44.dp)
        }
    },
    CatalogEntry("design.confirm-dialog", CatalogCategory.OVERLAYS, R.string.catalog_dialog, R.string.catalog_dialog_hint, layout = CatalogLayout.ScrollContent) { DialogSample() },
    CatalogEntry("design.context-menu", CatalogCategory.OVERLAYS, R.string.catalog_menu, R.string.catalog_menu_hint, layout = CatalogLayout.ScrollContent) { MenuSample() },
    CatalogEntry("design.sheet", CatalogCategory.OVERLAYS, R.string.catalog_sheet, R.string.catalog_sheet_hint, layout = CatalogLayout.ScrollContent) { SheetSample() },
)

@Composable
private fun ButtonsSample() {
    var loading by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AppPrimaryButton(stringResource(R.string.catalog_primary), onClick = { loading = true }, loading = loading)
        TextButton(onClick = { loading = false }) { Text(stringResource(R.string.catalog_reset)) }
        AppPrimaryButton(stringResource(R.string.catalog_disabled), onClick = {}, enabled = false)
    }
}

@Composable
private fun FieldsSample() {
    var query by remember { mutableStateOf("") }
    var value by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        AppSearchField(query, { query = it }, stringResource(R.string.catalog_search))
        AppFormField(value, { value = it }, label = stringResource(R.string.catalog_field_name),
            placeholder = stringResource(R.string.catalog_field_placeholder))
        AppFormField(value, { value = it }, label = stringResource(R.string.catalog_field_error),
            placeholder = stringResource(R.string.catalog_field_placeholder), isError = true)
        AppFormField("https://example.com", {}, label = stringResource(R.string.catalog_read_only), readOnly = true)
    }
}

@Composable
private fun SelectionSample() {
    var selected by remember { mutableStateOf(true) }
    var checked by remember { mutableStateOf(true) }
    AppSettingsSection(stringResource(R.string.catalog_selection)) {
        AppSelectionRow(stringResource(R.string.catalog_option_one), selected, { selected = true })
        AppListDivider(false)
        AppSelectionRow(stringResource(R.string.catalog_option_two), !selected, { selected = false })
        AppListDivider(false)
        AppToggleRow(stringResource(R.string.catalog_toggle), checked, { checked = it })
        AppToggleRow(stringResource(R.string.catalog_disabled), false, {}, enabled = false)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        AppFilterChip(stringResource(R.string.catalog_option_one), selected, { selected = true })
        AppFilterChip(stringResource(R.string.catalog_option_two), !selected, { selected = false })
    }
}

@Composable
private fun ValuesSample() {
    var value by remember { mutableIntStateOf(60) }
    var scale by remember { mutableIntStateOf(100) }
    Column {
        AppValueSlider(stringResource(R.string.catalog_slider), value, 44..72, { value = it }, suffix = " dp")
        AppValueStepper(scale, 90..130, 5, stringResource(R.string.catalog_stepper), { scale = it }, suffix = "%")
    }
}

@Composable
private fun ListsSample() {
    AppSettingsSection(stringResource(R.string.catalog_lists)) {
        AppListRow(stringResource(R.string.catalog_single_row))
        AppListDivider(false)
        AppListRow(stringResource(R.string.catalog_double_row), subtitle = stringResource(R.string.catalog_double_row_hint),
            leadingIcon = Icons.Rounded.Edit)
    }
}

@Composable
private fun DialogSample() {
    var open by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    AppPrimaryButton(stringResource(R.string.catalog_open_dialog), { open = true })
    if (open) AppConfirmDialog(
        title = stringResource(R.string.catalog_dialog),
        text = stringResource(R.string.catalog_dialog_message),
        confirmText = stringResource(R.string.catalog_confirm),
        dismissText = stringResource(R.string.catalog_cancel),
        confirmEnabled = name.isNotBlank(),
        onConfirm = { open = false },
        onDismiss = { open = false },
        content = { AppFormField(name, { name = it }, placeholder = stringResource(R.string.catalog_field_name)) },
    )
}

@Composable
private fun MenuSample() {
    var open by remember { mutableStateOf(false) }
    AppPrimaryButton(stringResource(R.string.catalog_open_menu), { open = true })
    if (open) AppContextMenu(listOf(
        AppContextMenuItem(stringResource(R.string.catalog_edit), Icons.Rounded.Edit) {},
        AppContextMenuItem(stringResource(R.string.catalog_delete), Icons.Rounded.Delete, destructive = true) {},
    ), onDismiss = { open = false })
}

@Composable
private fun SheetSample() {
    var open by remember { mutableStateOf(false) }
    AppPrimaryButton(stringResource(R.string.catalog_open_sheet), { open = true })
    if (open) AppSheet(onDismissRequest = { open = false }) {
        AppSettingsSection(stringResource(R.string.catalog_sheet), contentPadding = PaddingValues(16.dp)) {
            Text(stringResource(R.string.catalog_sheet_hint), style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(16.dp))
            AppPrimaryButton(stringResource(R.string.catalog_confirm), { open = false })
        }
    }
}
