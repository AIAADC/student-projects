package com.webshell.core.data

import androidx.room.Entity
import androidx.room.PrimaryKey

/** 应用内日志的 Room 持久化记录（对应 core/model 的 AppLog.Entry）。 */
@Entity(tableName = "app_log")
data class LogEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val timeMillis: Long,
    /** AppLog.Level.name：INFO / WARN / ERROR */
    val level: String,
    val tag: String,
    val message: String,
)
