package com.webshell.core.data

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.IOException
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

/** Owns app-private icon imports. Neither launchers nor editors perform file I/O in composition. */
@Singleton
class UserIconRepository @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    suspend fun importIcon(uri: Uri): Result<String> = withContext(Dispatchers.IO) {
        var pending: File? = null
        try {
            val directory = File(context.filesDir, "icons")
            if (!directory.isDirectory && !directory.mkdirs()) throw IOException("Icon directory unavailable")
            val target = File(directory, "icon_${UUID.randomUUID()}.img")
            pending = target
            val source = context.contentResolver.openInputStream(uri)
                ?: throw IOException("Icon source unavailable")
            source.use { input ->
                target.outputStream().use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var total = 0L
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        if (total > MAX_ICON_BYTES) throw IOException("Icon exceeds size limit")
                        output.write(buffer, 0, count)
                    }
                }
            }
            // Bounds-only decode validates input without allocating a full-size bitmap.
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(target.absolutePath, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0 ||
                bounds.outWidth.toLong() * bounds.outHeight > MAX_ICON_PIXELS
            ) throw IOException("Unsupported icon image")
            pending = null
            Result.success(target.absolutePath)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            Result.failure(failure)
        } finally {
            // Only an incomplete file created by this import is removed, never an existing icon.
            pending?.delete()
        }
    }

    private companion object {
        const val MAX_ICON_BYTES = 20L * 1024 * 1024
        const val MAX_ICON_PIXELS = 100_000_000L
    }
}
