package com.webshell.feature.add

import android.content.Context
import android.net.Uri
import com.webshell.core.webengine.LocalWebHost
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject

/**
 * 本地 HTML 导入：把用户通过文档选择器选中的文件扁平拷贝到
 * filesDir/localapps/<appId>/，首个（或唯一）html 文件视为入口 index。
 * 持久化 URL 形如 local://<appId>/index.html（见 [LocalWebHost.buildLocalAppUrl]）。
 */
class LocalAppImporter @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /**
     * @param uris 文档选择器返回的 content:// URI（按选择顺序；首个 html 为入口）
     * @return 持久化用入口 URL（local://<appId>/<entryFile>）
     */
    suspend fun import(appId: String, uris: List<Uri>): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            require(uris.isNotEmpty()) { "未选择任何文件" }
            val dir = LocalWebHost.localAppDir(context, appId).apply { mkdirs() }
            val htmlName = tryCopyAll(uris, dir)
            LocalWebHost.buildLocalAppUrl(appId, htmlName)
        }
    }

    /** 扁平拷贝；入口取第一个 .html/.htm 文件，若无则取第一个文件 */
    private fun tryCopyAll(uris: List<Uri>, dir: File): String {
        var firstCopied: String? = null
        var entry: String? = null
        uris.forEach { uri ->
            val name = sanitizeFileName(queryName(uri))
            val target = File(dir, name)
            copyToFile(uri, target)
            if (firstCopied == null) firstCopied = name
            val isHtml = name.endsWith(".html", ignoreCase = true) ||
                name.endsWith(".htm", ignoreCase = true)
            if (entry == null && isHtml) entry = name
        }
        return entry ?: firstCopied ?: error("没有可拷贝的文件")
    }

    private fun copyToFile(uri: Uri, target: File) {
        context.contentResolver.openInputStream(uri)?.use { input ->
            target.outputStream().use { output -> input.copyTo(output) }
        } ?: error("无法读取所选文件：${uri.lastPathSegment}")
    }

    private fun queryName(uri: Uri): String =
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (idx >= 0 && cursor.moveToFirst()) cursor.getString(idx) else null
        } ?: uri.lastPathSegment ?: "index.html"

    private fun sanitizeFileName(name: String): String {
        val cleaned = name.substringAfterLast('/').substringAfterLast('\\')
            .replace(Regex("[/\\\\:*?\"<>|]"), "_")
            .trim()
            .ifBlank { "index.html" }
        return cleaned
    }
}
