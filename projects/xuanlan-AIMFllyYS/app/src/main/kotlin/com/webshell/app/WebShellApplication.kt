package com.webshell.app

import android.app.Application
import com.webshell.core.data.AppLogSinkInstaller
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class WebShellApplication : Application() {

    @Inject
    lateinit var sinkInstaller: AppLogSinkInstaller

    override fun onCreate() {
        super.onCreate()
        // 启动时接通 AppLog → Room 持久化与崩溃捕获
        sinkInstaller.start()
    }
}
