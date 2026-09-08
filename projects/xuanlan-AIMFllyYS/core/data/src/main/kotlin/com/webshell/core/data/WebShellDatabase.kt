package com.webshell.core.data

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [WebAppEntity::class, HistoryEntity::class, BookmarkEntity::class, LogEntity::class],
    version = 3,
    exportSchema = true,
)
abstract class WebShellDatabase : RoomDatabase() {
    abstract fun webAppDao(): WebAppDao
    abstract fun historyDao(): HistoryDao
    abstract fun bookmarkDao(): BookmarkDao
    abstract fun logDao(): LogDao

    companion object {
        const val NAME = "webshell.db"

        /** v2 → v3：新增 app_log 表（应用内日志持久化），存量用户数据不动。 */
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `app_log` (" +
                        "`id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, " +
                        "`timeMillis` INTEGER NOT NULL, " +
                        "`level` TEXT NOT NULL, " +
                        "`tag` TEXT NOT NULL, " +
                        "`message` TEXT NOT NULL)",
                )
            }
        }
    }
}
