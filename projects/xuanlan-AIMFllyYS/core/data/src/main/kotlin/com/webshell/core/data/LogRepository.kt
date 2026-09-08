package com.webshell.core.data

import com.webshell.core.model.AppLog
import javax.inject.Inject
import javax.inject.Singleton

/** 应用内日志的持久化仓库：查看页分页读取、导出与清空都走这里。 */
@Singleton
class LogRepository @Inject constructor(
    private val logDao: LogDao,
) {

    /** 按时间倒序分页；tag 为 null 表示不过滤。 */
    suspend fun page(limit: Int, offset: Int, tag: String?): List<LogEntity> =
        if (tag == null) logDao.recent(limit, offset) else logDao.recentByTag(tag, limit, offset)

    suspend fun count(tag: String?): Int =
        if (tag == null) logDao.count() else logDao.countByTag(tag)

    suspend fun tags(): List<String> = logDao.distinctTags()

    suspend fun clear() = logDao.clear()

    /**
     * 导出当前过滤条件下的全部条目为纯文本（按时间正序）。
     * 每行格式：`时间 [级别] [tag] message`。
     */
    suspend fun exportAllText(tag: String?): String {
        val entries = if (tag == null) logDao.allEntries() else logDao.allEntriesByTag(tag)
        return entries.joinToString("\n") { e ->
            "${AppLog.formatTime(e.timeMillis)}  [${e.level}]  [${e.tag}]  ${e.message}"
        }
    }
}
