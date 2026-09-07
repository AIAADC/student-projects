package com.webshell.app

import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.webshell.app.ui.AppThemeViewModel
import com.webshell.app.ui.MainScaffold
import com.webshell.core.designsystem.theme.WebShellTheme
import com.webshell.core.model.AppLog
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val themeViewModel: AppThemeViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        logAppLaunch()
        val launchUrl = intent?.getStringExtra(EXTRA_URL)
        setContent {
            val theme by themeViewModel.theme.collectAsStateWithLifecycle()
            WebShellTheme(
                themeMode = theme.mode,
                photoWallpaperPath = theme.wallpaperPath,
                transitionStyle = theme.transitionStyle,
                appFontFamily = theme.appFontFamily,
                appFontScalePercent = theme.appFontScalePercent,
            ) {
                MainScaffold(launchUrl = launchUrl)
            }
        }
    }

    companion object {
        const val EXTRA_URL = "url"
    }

    private fun logAppLaunch() {
        runCatching {
            val info = packageManager.getPackageInfo(packageName, 0)
            val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                info.versionCode.toLong()
            }
            AppLog.log("app", "应用启动 v${info.versionName}($code)")
        }
    }
}
