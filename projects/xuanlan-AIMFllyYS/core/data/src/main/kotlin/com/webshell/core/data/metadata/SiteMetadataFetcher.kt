package com.webshell.core.data.metadata

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import java.net.URI

/** 抓取到的站点元数据 */
data class SiteMetadata(
    val title: String,
    val iconUrl: String?,
    val themeColor: String?,
    val finalUrl: String,
)

/**
 * 单个站点的元数据抓取器：HTML → 标题 / 主题色 / 图标。
 * 纯 JVM（OkHttp + jsoup + org.json），可注入 OkHttpClient 便于测试与全局复用。
 * 位于 core/data：feature/add（新增）与 feature/home（强制刷新）共用。
 */
class SiteMetadataFetcher @javax.inject.Inject constructor(
    private val client: OkHttpClient,
) {

    suspend fun fetch(url: String): Result<SiteMetadata> = withContext(Dispatchers.IO) {
        runCatching {
            val doc = getDocument(url)
            val finalUrl = doc.location() ?: url
            val title = doc.title().trim()
                .ifBlank { doc.selectFirst("meta[property=og:title]")?.attr("content")?.trim().orEmpty() }
                .ifBlank { hostLabel(finalUrl) }
            val themeColor = doc.selectFirst("meta[name=theme-color]")?.attr("content")?.trim()
                ?.takeIf { it.isNotEmpty() }
            val iconUrl = pickBestIcon(finalUrl, doc)
            SiteMetadata(
                title = title,
                iconUrl = iconUrl,
                themeColor = themeColor,
                finalUrl = finalUrl,
            )
        }
    }

    private fun getDocument(url: String): Document {
        val response = client.newCall(request(url)).execute()
        response.use { resp ->
            check(resp.isSuccessful) { "HTTP ${resp.code}" }
            val body = checkNotNull(resp.body) { "Empty response body" }
            return Jsoup.parse(body.byteStream(), null, url)
        }
    }

    private fun request(url: String): Request =
        Request.Builder()
            .url(url)
            .header("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/*;q=0.8,*/*;q=0.5")
            .build()

    private fun hostLabel(url: String): String =
        runCatching { URI(url).host }.getOrNull()?.removePrefix("www.") ?: url

    // ===== 图标挑选（manifest → apple-touch-icon → icon → /favicon.ico）=====

    private fun pickBestIcon(finalUrl: String, doc: Document): String? {
        linkCandidates(doc, "manifest", finalUrl).firstOrNull()?.let { (manifestUrl, _) ->
            manifestIconCandidates(manifestUrl)?.let { icons ->
                chooseBestManifestIcon(icons)?.let { src ->
                    return sanitizeIconUrl(resolveUrl(finalUrl, src))
                }
            }
        }
        linkCandidates(doc, "apple-touch-icon", finalUrl)
            .maxByOrNull { parseIconSize(it.second) }
            ?.let { return sanitizeIconUrl(it.first) }
        linkCandidates(doc, "icon", finalUrl)
            .maxByOrNull { parseIconSize(it.second) }
            ?.let { return sanitizeIconUrl(it.first) }
        return sanitizeIconUrl(resolveUrl(finalUrl, DEFAULT_FAVICON_PATH))
    }

    /** 仅接受 http(s) 图标地址；data:/blob: 等伪 URL 一律视为无图标 */
    private fun sanitizeIconUrl(url: String): String? =
        url.takeIf {
            it.startsWith("http://") || it.startsWith("https://")
        }

    /** rel 关键字匹配（rel 属性是多值空格分隔列表，如 "shortcut icon"） */
    private fun linkCandidates(doc: Document, relKeyword: String, baseUrl: String): List<Pair<String, String>> =
        doc.select("link[rel]").mapNotNull { el ->
            val rels = el.attr("rel").lowercase().split(Regex("\\s+"))
            if (relKeyword !in rels) return@mapNotNull null
            val href = el.attr("abs:href").ifBlank { resolveUrl(baseUrl, el.attr("href")) }
            href.takeIf { it.isNotEmpty() }?.let { it to el.attr("sizes") }
        }

    /** 拉取 web manifest 并把 icons[] 转为 map 列表；任何失败都安静降级为 null */
    private fun manifestIconCandidates(manifestUrl: String): List<Map<String, String>>? = runCatching {
        val response = client.newCall(request(manifestUrl)).execute()
        response.use { resp ->
            if (!resp.isSuccessful) return null
            val body = resp.body ?: return null
            val icons = JSONObject(body.string()).optJSONArray("icons") ?: return null
            iconsToCandidates(icons)
        }
    }.getOrNull()

    private fun iconsToCandidates(icons: JSONArray): List<Map<String, String>> =
        (0 until icons.length())
            .mapNotNull { icons.optJSONObject(it) }
            .map { obj ->
                mapOf(
                    "src" to obj.optString("src"),
                    "sizes" to obj.optString("sizes"),
                    "purpose" to obj.optString("purpose"),
                )
            }
            .filter { it.getValue("src").isNotBlank() }

    /**
     * 纯函数：从 manifest icons[]（map 列表）里挑最合适的图标，返回 src 原值（未相对解析）。
     * 规则：purpose 缺省/含 any/maskable 才可用；有效尺寸 ≥ [MIN_ICON_SIDE]px 优先进入候选；
     * 同组内优先 512px（声明 512 的排最前），再按最大边长取最大。
     * sizes 缺省（未知尺寸）保留为兜底候选，排序时按 0 处理。
     */
    fun chooseBestManifestIcon(icons: List<Map<String, String>>?): String? {
        if (icons.isNullOrEmpty()) return null
        data class Candidate(val src: String, val anyPurpose: Boolean, val maxSide: Int)

        val candidates = icons.mapNotNull { icon ->
            val src = icon["src"]?.takeIf { it.isNotBlank() } ?: return@mapNotNull null
            val purpose = icon["purpose"]?.lowercase().orEmpty()
            // purpose 缺省视为 any；maskable 有安全区但仍可做应用图标
            val anyPurpose = purpose.isEmpty() || "any" in purpose || "maskable" in purpose
            Candidate(src, anyPurpose, parseIconSize(icon["sizes"].orEmpty()))
        }
        return candidates.asSequence()
            .filter { it.anyPurpose }
            .filter { it.maxSide >= MIN_ICON_SIDE || it.maxSide == 0 }
            .maxWithOrNull(compareBy({ it.maxSide == PREFERRED_SIDE }, { it.maxSide }))
            ?.src
    }

    /** "48x48 96x96" → 96；"any" 或空 → 0（未知） */
    fun parseIconSize(sizes: String): Int =
        sizes.trim().split(Regex("\\s+"))
            .mapNotNull { token ->
                val parts = token.lowercase().split("x")
                if (parts.size == 2) parts[0].toIntOrNull() else null
            }
            .maxOrNull() ?: 0

    private fun resolveUrl(base: String, spec: String): String = try {
        URI(base).resolve(spec.replace(" ", "%20")).toString()
    } catch (_: Exception) {
        spec
    }

    private companion object {
        const val DEFAULT_FAVICON_PATH = "/favicon.ico"
        const val MIN_ICON_SIDE = 129
        const val PREFERRED_SIDE = 512
    }
}
