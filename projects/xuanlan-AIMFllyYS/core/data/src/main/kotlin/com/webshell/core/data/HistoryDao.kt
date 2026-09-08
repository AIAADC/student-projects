package com.webshell.core.data

import androidx.room.Dao
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface HistoryDao {

    @Query("SELECT * FROM history ORDER BY visitedAt DESC LIMIT :limit")
    fun observeRecent(limit: Int = 100): Flow<List<HistoryEntity>>

    /** 相同 URL 的近期记录合并为一条最新记录，避免历史列表刷屏 */
    @Query("DELETE FROM history WHERE url = :url")
    suspend fun deleteByUrl(url: String)

    @Query("DELETE FROM history")
    suspend fun clearAll()

    @androidx.room.Insert
    suspend fun insert(entity: HistoryEntity): Long

    @androidx.room.Insert
    suspend fun insertAll(entities: List<HistoryEntity>)
}
