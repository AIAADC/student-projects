package com.webshell.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.webshell.core.model.AppLog
import com.webshell.core.webengine.KeepAliveRegistry
import com.webshell.app.MainActivity
import com.webshell.app.R

/**
 * User-visible foreground service for explicitly enabled site sessions. Android/OEM memory,
 * power policy and website throttling remain authoritative; this is not permanent execution.
 */
class WebHostService : Service() {

    companion object {
        val running = kotlinx.coroutines.flow.MutableStateFlow(false)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        AppLog.log("service", "保活服务 onCreate")
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            KeepAliveRegistry.ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                running.value = false
                return START_NOT_STICKY
            }
            else -> startInForeground()
        }
        running.value = true
        return START_STICKY
    }

    private fun startInForeground() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                KeepAliveRegistry.NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(KeepAliveRegistry.NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(): Notification {
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, KeepAliveRegistry.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_shell)
            .setContentTitle(getString(R.string.service_title))
            .setContentText(summaryText())
            .setOngoing(true)
            .setContentIntent(contentIntent)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    private fun summaryText(): String {
        val count = KeepAliveRegistry.entries.size
        return if (count == 0) {
            getString(R.string.service_empty)
        } else {
            getString(R.string.service_summary, count)
        }
    }

    private fun createChannel() {
        val channel = NotificationChannel(
            KeepAliveRegistry.CHANNEL_ID,
            getString(R.string.service_channel),
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = getString(R.string.service_description)
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    override fun onDestroy() {
        running.value = false
        AppLog.log("service", "保活服务 onDestroy")
        super.onDestroy()
    }
}
