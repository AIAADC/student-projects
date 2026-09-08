package com.webshell.core.model

/** Stable preference IDs. Never persist enum ordinals or display labels. */
object AppFontFamily {
    const val MISANS = "misans"
    const val SYSTEM = "system"
    const val NOTO_SANS_SC = "noto_sans_sc"
    val all = listOf(MISANS, SYSTEM, NOTO_SANS_SC)

    fun normalize(value: String?): String = value?.takeIf { it in all } ?: MISANS
}

object AppFontScale {
    const val DEFAULT = 100
    const val MIN = 90
    const val MAX = 130
    const val STEP = 5

    /** Corrupted or future values fall back safely without affecting website text zoom. */
    fun normalize(value: Int?): Int = value?.takeIf {
        it in MIN..MAX && (it - MIN) % STEP == 0
    } ?: DEFAULT

    fun multiplier(value: Int): Float = normalize(value) / 100f
}
