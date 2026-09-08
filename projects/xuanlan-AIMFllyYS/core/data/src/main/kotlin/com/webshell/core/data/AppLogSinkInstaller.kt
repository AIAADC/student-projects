package com.webshell.core.data

import com.webshell.core.model.AppLog
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

/**
 * 把内存日志 AppLog 接到 Room：start() 后每条 Entry 异步落盘；
 * 同时接管未捕获异常——把崩溃堆栈作为 ERROR 级「crash」日志同步写入数据库，
 * 再转发给原默认 handler（不影响系统崩溃流程）。
 */
@Singleton
class AppLogSinkInstaller @Inject constructor(
    private val logDao: LogDao,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val started = AtomicBoolean(false)

    fun start() {
        if (!started.compareAndSet(false, true)) return
        AppLog.entrySink = { entry ->
            scope.launch {
                runCatching {
                    logDao.insert(
                        LogEntity(
                            timeMillis = entry.timeMillis,
                            level = entry.level.name,
                            tag = entry.tag,
                            message = entry.message,
                        ),
                    )
                }
            }
        }
        installCrashHandler()
    }

    private fun installCrashHandler() {
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            // runBlocking 保证崩溃日志在进程死亡前落盘
            runCatching {
                val stack = android.util.Log.getStackTraceString(throwable).orEmpty()
                runBlocking {
                    logDao.insert(
                        LogEntity(
                            timeMillis = System.currentTimeMillis(),
                            level = AppLog.Level.ERROR.name,
                            tag = "crash",
                            message = "未捕获异常 @${thread.name}: " +
                                "${throwable.javaClass.simpleName}: ${throwable.message}\n$stack",
                        ),
                    )
                }
            }
            previous?.uncaughtException(thread, throwable)
        }
    }
}
