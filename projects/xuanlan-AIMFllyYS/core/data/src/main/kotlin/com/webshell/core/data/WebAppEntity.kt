package com.webshell.core.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "web_apps")
data class WebAppEntity(
    @PrimaryKey val id: String,
    val title: String,
    val url: String,
    val iconUrl: String?,
    val desktopMode: Boolean,
    val darkMode: Boolean,
    val keepAlive: Boolean,
    val isFavorite: Boolean,
    val homePage: Int,
    val homeCellIndex: Int,
    val folderId: String?,
    val createdAt: Long,
    /**
     * 本地导入的 HTML 应用：url 形如 local://<appId>/index.html，
     * 文件存于 filesDir/localapps/<appId>/，由 LocalWebHost 以
     * https://appassets.androidplatform.net/local/<appId>/... 提供渲染。
     */
    val isLocal: Boolean = false,
    /** 外链（非当前站点域）在系统浏览器打开；false = 站内打开 */
    val externalLinksToBrowser: Boolean = false,
    /** 页面文本缩放百分比（80–130，100 = 不缩放） */
    val textZoomPercent: Int = 100,
)

/** 自由摆放模式下的槽位分配：与 feature/home 的稀疏分页规则保持一致。 */
object HomeSlotAllocator {

    /**
     * 新应用的“追加”槽位：最后一页的首个空槽；末页已满则新页首槽。
     * 文件夹成员与文件夹同槽，因此按 (page, index) 去重即为占用集合。
     */
    fun appendSlot(apps: List<WebAppEntity>, pageCapacity: Int): Pair<Int, Int> {
        val capacity = pageCapacity.coerceAtLeast(1)
        val occupied = apps.filter { it.homeCellIndex >= 0 }
            .mapTo(HashSet()) { it.homePage.coerceAtLeast(0) to it.homeCellIndex }
        if (occupied.isEmpty()) return 0 to 0
        val lastPage = apps.maxOf { it.homePage.coerceAtLeast(0) }
        for (slot in 0 until capacity) {
            if ((lastPage to slot) !in occupied) return lastPage to slot
        }
        return (lastPage + 1) to 0
    }
}
