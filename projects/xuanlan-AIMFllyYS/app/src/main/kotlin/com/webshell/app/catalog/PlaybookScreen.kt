package com.webshell.app.catalog

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.webshell.app.R
import com.webshell.core.designsystem.catalog.CatalogCategory
import com.webshell.core.designsystem.catalog.CatalogLayout
import com.webshell.core.designsystem.components.AppCard
import com.webshell.core.designsystem.components.AppListDivider
import com.webshell.core.designsystem.components.AppListRow
import com.webshell.core.designsystem.components.AppNavigationBar
import com.webshell.core.designsystem.components.AppSearchField
import com.webshell.core.designsystem.components.AppSectionHeader
import com.webshell.core.designsystem.components.LocalImageLoadingEnabled

/** Real production catalog: one bounded scenario at a time; all data and callbacks are isolated. */
@Composable
fun PlaybookScreen(onBack: () -> Unit, initialEntryId: String? = null) {
    val entries = remember { CatalogRegistry.entries() }
    var selectedId by rememberSaveable { mutableStateOf(initialEntryId) }
    var query by rememberSaveable { mutableStateOf("") }
    var reset by remember { mutableIntStateOf(0) }
    val selected = entries.firstOrNull { it.id == selectedId }
    val back = { if (selectedId != null) selectedId = null else onBack() }
    BackHandler { back() }
    Column(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).safeDrawingPadding()) {
        AppNavigationBar(
            title = if (selected == null) stringResource(R.string.catalog_title) else stringResource(selected.titleRes),
            onBack = back,
            actions = { if (selected != null) TextButton(onClick = { reset++ }) { Text(stringResource(R.string.catalog_reset)) } },
        )
        if (selected == null) {
            Text(stringResource(R.string.catalog_intro, entries.size), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            AppSearchField(query, { query = it }, stringResource(R.string.catalog_search), Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            val matching = entries.filter {
                val title = stringResource(it.titleRes)
                query.isBlank() || it.id.contains(query.trim(), true) || title.contains(query.trim(), true)
            }
            LazyColumn(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp), modifier = Modifier.weight(1f)) {
                CatalogCategory.entries.forEach { category ->
                    val group = matching.filter { it.category == category }
                    if (group.isNotEmpty()) {
                        item(key = "group-${category.name}") { AppSectionHeader(stringResource(categoryLabel(category))) }
                        items(group, key = { it.id }) { entry ->
                            AppCard(contentPadding = PaddingValues(0.dp), modifier = Modifier.padding(bottom = 8.dp)) {
                                AppListRow(
                                    title = stringResource(entry.titleRes), subtitle = stringResource(entry.descriptionRes),
                                    onClick = { selectedId = entry.id },
                                    modifier = Modifier.semantics { contentDescription = "catalog:${entry.id}" },
                                    trailing = { Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null) },
                                )
                            }
                        }
                    }
                }
            }
        } else {
            Text(stringResource(selected.descriptionRes), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            AppListDivider(false)
            Box(Modifier.weight(1f).fillMaxWidth().semantics { contentDescription = "catalog-preview:${selected.id}" }) {
                CompositionLocalProvider(LocalImageLoadingEnabled provides false) {
                    key(selected.id, reset) {
                        if (selected.layout == CatalogLayout.ScrollContent) {
                            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
                                selected.content()
                            }
                        } else selected.content()
                    }
                }
            }
        }
    }
}

private fun categoryLabel(category: CatalogCategory) = when (category) {
    CatalogCategory.FOUNDATIONS -> R.string.catalog_foundations
    CatalogCategory.NAVIGATION -> R.string.catalog_navigation
    CatalogCategory.FORMS -> R.string.catalog_forms
    CatalogCategory.CONTENT -> R.string.catalog_content
    CatalogCategory.OVERLAYS -> R.string.catalog_overlays
    CatalogCategory.HOME -> R.string.catalog_home
    CatalogCategory.BROWSER -> R.string.catalog_browser
    CatalogCategory.DEVELOPER -> R.string.catalog_developer
}
