package com.webshell.feature.home

import com.webshell.core.data.WebAppEntity
import net.sourceforge.pinyin4j.PinyinHelper

/**
 * 全部应用抽屉的首字母索引：分组、排序与扁平化（纯逻辑，不碰 Android UI，可单测）。
 * 分组规则：ASCII 字母取大写；汉字用 pinyin4j 取拼音首字母大写；其余归入 "#"。
 */
object AllAppsIndex {

    /** 非字母分区键：数字、符号、emoji 等归入 "#"，排序时殿后。 */
    const val OTHER_SECTION = "#"

    /** 抽屉分区：letter（A-Z 或 #）+ 区内排好序的应用。 */
    data class Section(val letter: String, val apps: List<WebAppEntity>)

    /** 抽屉扁平列表项：分区头或应用项，LazyVerticalGrid 直接渲染。 */
    sealed interface Item {
        data class Header(val letter: String) : Item
        data class Entry(val app: WebAppEntity) : Item
    }

    /** 扁平化结果：渲染列表 + 各分区首项下标（右侧字母索引条跳转用）。 */
    data class FlatList(
        val items: List<Item>,
        val sectionFirstIndex: Map<String, Int>,
    )

    /** 标题首字符的分区键：ASCII 字母取大写；汉字取拼音首字母大写；其余归 #。 */
    fun sectionKey(title: String): String {
        val c = title.trim().firstOrNull() ?: return OTHER_SECTION
        if (c in 'A'..'Z') return c.toString()
        if (c in 'a'..'z') return c.uppercaseChar().toString()
        val first = firstPinyinReading(c)?.firstOrNull()
        return if (first != null && first in 'a'..'z') {
            first.uppercaseChar().toString()
        } else {
            OTHER_SECTION
        }
    }

    /**
     * 区内排序键：汉字逐个转拼音（去音调数字）、字母统一小写，其余字符原样 ——
     * 让中文标题按拼音序而非 Unicode 码位序排列。
     */
    internal fun sortKey(title: String): String = buildString(title.length) {
        title.trim().forEach { c ->
            when {
                c in 'A'..'Z' -> append(c.lowercaseChar())
                c in 'a'..'z' -> append(c)
                else -> {
                    val reading = firstPinyinReading(c)
                    if (reading != null) append(reading.dropLastWhile { it.isDigit() }) else append(c)
                }
            }
        }
    }

    /**
     * 分组排序：分区按 A→Z、# 殿后；区内按排序键 → 标题 → 创建时间排序，保证确定性。
     */
    fun buildSections(apps: List<WebAppEntity>): List<Section> {
        // Pinyin conversion is comparatively expensive: compute once per title, not repeatedly
        // inside the O(n log n) comparator while opening/searching the library.
        val sortKeys = apps.associate { it.id to sortKey(it.title) }
        return apps.groupBy { sectionKey(it.title) }
            .map { (letter, group) ->
                Section(
                    letter = letter,
                    apps = group.sortedWith(
                        compareBy<WebAppEntity> { sortKeys.getValue(it.id) }
                            .thenBy { it.title }
                            .thenBy { it.createdAt },
                    ),
                )
            }
            .sortedWith(compareBy({ it.letter == OTHER_SECTION }, { it.letter }))
    }

    /** Filter an already sorted index without changing its order or recomputing pinyin. */
    fun filterSections(sections: List<Section>, query: String): List<Section> {
        val normalized = query.trim()
        if (normalized.isEmpty()) return sections
        return sections.mapNotNull { section ->
            section.apps.filter { app ->
                app.title.contains(normalized, ignoreCase = true) ||
                    app.url.contains(normalized, ignoreCase = true)
            }.takeIf { it.isNotEmpty() }?.let { section.copy(apps = it) }
        }
    }

    /** 分区摊平为渲染列表（header + 应用），并给出每个分区首项在列表中的下标。 */
    fun flatten(sections: List<Section>): FlatList {
        val items = ArrayList<Item>()
        val firstIndex = HashMap<String, Int>(sections.size)
        sections.forEach { section ->
            firstIndex[section.letter] = items.size
            items += Item.Header(section.letter)
            section.apps.forEach { items += Item.Entry(it) }
        }
        return FlatList(items = items, sectionFirstIndex = firstIndex)
    }

    /** pinyin4j 首个读音（如 "zhong1"）；非汉字或转换失败返回 null。 */
    private fun firstPinyinReading(c: Char): String? =
        runCatching { PinyinHelper.toHanyuPinyinStringArray(c) }.getOrNull()?.firstOrNull()
}
