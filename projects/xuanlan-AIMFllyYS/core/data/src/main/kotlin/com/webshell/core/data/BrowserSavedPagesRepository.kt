package com.webshell.core.data

import javax.inject.Inject
import javax.inject.Singleton

/** Owns saved-page persistence; the browser feature never receives a DAO. */
@Singleton
class BrowserSavedPagesRepository @Inject constructor(
    private val historyDao: HistoryDao,
    private val bookmarkDao: BookmarkDao,
) {
    fun observeHistory() = historyDao.observeRecent()
    fun observeBookmarks() = bookmarkDao.observeAll()

    suspend fun toggleBookmark(url: String, title: String) {
        if (url.isBlank() || url == "about:blank") return
        if (bookmarkDao.getByUrl(url) != null) bookmarkDao.deleteByUrl(url)
        else bookmarkDao.upsert(BookmarkEntity(url = url, title = title.ifBlank { url }, addedAt = System.currentTimeMillis()))
    }

    suspend fun removeBookmark(url: String) = bookmarkDao.deleteByUrl(url)

    suspend fun recordVisit(url: String, title: String) {
        if (url.isBlank() || url == "about:blank" || url.startsWith("data:")) return
        historyDao.deleteByUrl(url)
        historyDao.insert(HistoryEntity(url = url, title = title.ifBlank { url }, visitedAt = System.currentTimeMillis()))
    }

    suspend fun clearHistory() = historyDao.clearAll()
}
