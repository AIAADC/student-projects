package com.webshell.feature.browser

internal fun String.stripScheme(): String =
    if (this == "about:blank") "" else removePrefix("https://").removePrefix("http://")

/** URL entry only; adding a search engine is a separate product capability. */
internal fun normalizeUrl(raw: String): String {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return ""
    return when {
        trimmed.startsWith("http://") || trimmed.startsWith("https://") -> trimmed
        trimmed.contains('.') && !trimmed.contains(' ') -> "https://$trimmed"
        else -> trimmed
    }
}
