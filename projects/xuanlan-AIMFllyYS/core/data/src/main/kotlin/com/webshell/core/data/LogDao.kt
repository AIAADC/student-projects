package com.webshell.core.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query

@Dao
interface LogDao {

    @Insert
    suspend fun insert(entity: LogEntity): Long

    /** 按时间倒序分页（查看页用：最新在前） */
    @Query("SELECT * FROM app_log ORDER BY timeMillis DESC, id DESC LIMIT :limit OFFSET :offset")
    suspend fun recent(limit: Int, offset: Int): List<LogEntity>

    @Query("SELECT * FROM app_log WHERE tag = :tag ORDER BY timeMillis DESC, id DESC LIMIT :limit OFFSET :offset")
    suspend fun recentByTag(tag: String, limit: Int, offset: Int): List<LogEntity>

    @Query("SELECT DISTINCT tag FROM app_log ORDER BY tag")
    suspend fun distinctTags(): List<String>

    @Query("SELECT COUNT(*) FROM app_log")
    suspend fun count(): Int

    @Query("SELECT COUNT(*) FROM app_log WHERE tag = :tag")
    suspend fun countByTag(tag: String): Int

    /** 全量导出（按时间正序） */
    @Query("SELECT * FROM app_log ORDER BY timeMillis ASC, id ASC")
    suspend fun allEntries(): List<LogEntity>

    @Query("SELECT * FROM app_log WHERE tag = :tag ORDER BY timeMillis ASC, id ASC")
    suspend fun allEntriesByTag(tag: String): List<LogEntity>

    @Query("DELETE FROM app_log")
    suspend fun clear()
}
