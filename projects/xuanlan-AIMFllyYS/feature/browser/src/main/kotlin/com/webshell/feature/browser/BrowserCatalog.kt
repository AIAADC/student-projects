package com.webshell.feature.browser

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.catalog.CatalogCategory
import com.webshell.core.designsystem.catalog.CatalogEntry
import com.webshell.core.designsystem.catalog.CatalogLayout

/** Production components with isolated fixtures; this never instantiates a WebView or ViewModel. */
fun browserCatalog(): List<CatalogEntry> = listOf(
    CatalogEntry("browser.address", CatalogCategory.BROWSER, R.string.browser_catalog_address_title,
        R.string.browser_catalog_address_description, layout = CatalogLayout.ScrollContent) { AddressSample() },
    CatalogEntry("browser.menu", CatalogCategory.BROWSER, R.string.browser_catalog_menu_title,
        R.string.browser_catalog_menu_description) { MenuSample() },
    CatalogEntry("browser.tabs", CatalogCategory.BROWSER, R.string.browser_catalog_tabs_title,
        R.string.browser_catalog_tabs_description) { TabsSample() },
    CatalogEntry("browser.find", CatalogCategory.BROWSER, R.string.browser_catalog_find_title,
        R.string.browser_catalog_find_description, layout = CatalogLayout.ScrollContent) { FindSample() },
    CatalogEntry("browser.saved-pages", CatalogCategory.BROWSER, R.string.browser_catalog_saved_title,
        R.string.browser_catalog_saved_description) { SavedPagesSample() },
    CatalogEntry("browser.feedback", CatalogCategory.BROWSER, R.string.browser_catalog_empty_title,
        R.string.browser_catalog_empty_description, layout = CatalogLayout.ScrollContent) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            EmptyTabsPrompt(Modifier.fillMaxWidth().padding(vertical = 24.dp), {})
            WebSessionStatusMessage(stringResource(R.string.browser_page_loading_error), Modifier.padding(16.dp))
        }
    },
    CatalogEntry("browser.security", CatalogCategory.BROWSER, R.string.browser_catalog_security_title,
        R.string.browser_catalog_security_description, layout = CatalogLayout.ScrollContent) {
        var show by remember { mutableStateOf(false) }
        TextButton(onClick = { show = true }) { Text(stringResource(R.string.browser_ssl_title)) }
        if (show) BrowserCertificateDialog("-1", { show = false }, { show = false })
    },
)

@Composable
private fun AddressSample() {
    var address by remember { mutableStateOf(TextFieldValue("https://example.org/read/a-long-path?view=compact")) }
    var editing by remember { mutableStateOf(false) }
    BrowserTopBar(address, editing, { address = it }, { editing = it }, {}, false, 12, {}, {}, 100)
}

@Composable
private fun MenuSample() {
    var action by remember { mutableStateOf<BrowserMenuAction?>(null) }
    Column(Modifier.fillMaxSize()) {
        BrowserMenuContent(BrowserMenuState(hasPage = true, hasTabs = true, canGoBack = true),
            { action = it }, {}, Modifier.weight(1f))
        // One parent owns layout, so feedback never overlaps the still-interactive menu.
        if (action != null) WebSessionStatusMessage(stringResource(R.string.browser_done), Modifier.padding(12.dp))
    }
}

@Composable
private fun TabsSample() {
    val title = stringResource(R.string.browser_catalog_sample_title)
    var tabs by remember { mutableStateOf(listOf(
        BrowserTab("sample-a", title, "https://example.org/read"),
        BrowserTab("sample-b", title, "https://example.org/library"),
    )) }
    var active by remember { mutableStateOf<String?>("sample-a") }
    var nextId by remember { mutableStateOf(0) }
    TabSwitcherContent(tabs, active, { active = it }, { id -> tabs = tabs.filterNot { it.tabId == id } },
        { nextId++; tabs = tabs + BrowserTab("new-$nextId", title, "about:blank") },
        { tabs = emptyList() }, {}, Modifier.fillMaxSize())
}

@Composable
private fun FindSample() {
    var query by remember { mutableStateOf("") }
    FindBar(query, 0, if (query.isEmpty()) 0 else 3, { query = it }, {}, {}, { query = "" })
}

@Composable
private fun SavedPagesSample() {
    val title = stringResource(R.string.browser_catalog_sample_title)
    var bookmarks by remember { mutableStateOf(false) }
    var entries by remember { mutableStateOf(listOf(BrowserSavedPage(1, title, "https://example.org/read"))) }
    Column(Modifier.fillMaxSize()) {
        TextButton(onClick = { bookmarks = !bookmarks }) {
            Text(stringResource(if (bookmarks) R.string.browser_history else R.string.browser_bookmarks))
        }
        SavedPagesContent(entries, bookmarks, {}, { entries = entries.filterNot { entry -> entry.url == it } },
            { entries = emptyList() }, {}, Modifier.weight(1f))
    }
}
