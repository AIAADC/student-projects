package com.webshell.core.data

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.first

/** Read-only launch lookup. Explicit IDs never silently fall through to another site's config. */
@Singleton
class WebAppLookupRepository @Inject constructor(private val webAppDao: WebAppDao) {
    suspend fun getById(id: String): WebAppEntity? = webAppDao.getById(id)
    suspend fun findByUrl(url: String): WebAppEntity? =
        webAppDao.observeAll().first().firstOrNull { it.url == url }
}
