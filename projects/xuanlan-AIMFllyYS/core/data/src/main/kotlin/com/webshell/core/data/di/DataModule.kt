package com.webshell.core.data.di

import android.content.Context
import androidx.room.Room
import com.webshell.core.data.BookmarkDao
import com.webshell.core.data.HistoryDao
import com.webshell.core.data.LogDao
import com.webshell.core.data.WebAppDao
import com.webshell.core.data.WebShellDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DataModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): WebShellDatabase =
        Room.databaseBuilder(context, WebShellDatabase::class.java, WebShellDatabase.NAME)
            // v1 → v2：新增 isLocal/externalLinksToBrowser/textZoomPercent 三列，
            // 里程碑阶段无迁移需求，直接重建库。
            // v2 → v3：显式迁移新增 app_log 表；fallback 仅作兜底，不能依赖它（会清掉用户数据）。
            .addMigrations(WebShellDatabase.MIGRATION_2_3)
            .fallbackToDestructiveMigration(dropAllTables = true)
            .build()

    @Provides
    fun provideWebAppDao(db: WebShellDatabase): WebAppDao = db.webAppDao()

    @Provides
    fun provideHistoryDao(db: WebShellDatabase): HistoryDao = db.historyDao()

    @Provides
    fun provideBookmarkDao(db: WebShellDatabase): BookmarkDao = db.bookmarkDao()

    @Provides
    fun provideLogDao(db: WebShellDatabase): LogDao = db.logDao()
}
