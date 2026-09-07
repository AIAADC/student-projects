package com.webshell.feature.add

import java.net.URI

/** Pure, deterministic validation shared by input, save boundary and unit tests. */
internal object AddUrl {
    fun normalize(raw: String): String? {
        val trimmed = raw.trim()
        if (trimmed.isEmpty() || trimmed.any { it.isWhitespace() || it.isISOControl() }) return null
        val schemePrefix = trimmed.substringBefore("://", missingDelimiterValue = "")
        if (schemePrefix.isNotEmpty() && !schemePrefix.equals("http", true) &&
            !schemePrefix.equals("https", true)
        ) return null
        val candidate = if (schemePrefix.isEmpty()) "https://$trimmed" else trimmed
        return runCatching {
            val uri = URI(candidate)
            if (uri.host.isNullOrBlank() || uri.rawUserInfo != null || uri.port !in -1..65535 || uri.port == 0) null
            else candidate
        }.getOrNull()
    }

    fun hostLabel(url: String): String = runCatching {
        URI(url).host?.removePrefix("www.").orEmpty()
    }.getOrDefault("")
}
