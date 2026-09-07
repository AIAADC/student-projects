package com.webshell.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.webshell.core.data.WebAppDao
import com.webshell.core.data.WebAppEntity
import com.webshell.core.data.HomeSettings
import com.webshell.core.data.SettingsRepository
import com.webshell.core.data.UserIconRepository
import com.webshell.core.data.metadata.SiteMetadataFetcher
import com.webshell.core.model.AppLog
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val dao: WebAppDao,
    private val settingsRepository: SettingsRepository,
    private val fetcher: SiteMetadataFetcher,
    private val icons: UserIconRepository,
) : ViewModel() {

    val apps: StateFlow<List<WebAppEntity>> = dao.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val settings: StateFlow<HomeSettings> = settingsRepository.settings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeSettings())

    /** Library indexing is CPU work, not composition work; opening it never blocks a frame. */
    val allAppsSections: StateFlow<List<AllAppsIndex.Section>> = apps
        .map(AllAppsIndex::buildSections)
        .flowOn(Dispatchers.Default)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 1)
    /** 轻量提示（toast 浮层）：刷新成功/失败等一次性消息。 */
    val messages: SharedFlow<String> = _messages.asSharedFlow()

    /** Route may cancel a dismissed picker; the repository cleans up an incomplete import. */
    suspend fun importIcon(uri: android.net.Uri): Result<String> = icons.importIcon(uri)

    /**
     * 自由摆放落子：把 cell（应用或文件夹）移动到 (toPage, toSlot)；
     * 目标槽被占用则双方交换槽位。图标停在松手的网格位，不自动压实。
     */
    fun moveCellToSlot(draggedKey: String, toPage: Int, toSlot: Int, pageCapacity: Int) {
        viewModelScope.launch {
            val updates = HomePages.resolveSlotMove(
                apps = apps.value,
                draggedKey = draggedKey,
                toPage = toPage,
                toSlot = toSlot,
                pageCapacity = pageCapacity,
            )
            if (updates.isEmpty()) return@launch
            dao.upsertAll(updates)
            val title = updates.firstOrNull { it.id == draggedKey || "folder-${it.folderId}" == draggedKey }?.title
                ?: updates.first().title
            AppLog.log("home", "移动「$title」到第 ${toPage + 1} 页第 ${toSlot + 1} 格")
        }
    }

    /** 首屏左缘开新屏：被拖 cell 落到新首屏 (0, toSlot)，其余所有应用页号 +1。 */
    fun prependPageMove(draggedKey: String, toSlot: Int, pageCapacity: Int) {
        viewModelScope.launch {
            val updates = HomePages.resolvePrependMove(
                apps = apps.value,
                draggedKey = draggedKey,
                toSlot = toSlot,
                pageCapacity = pageCapacity,
            )
            if (updates.isEmpty()) return@launch
            dao.upsertAll(updates)
            val title = updates.firstOrNull { it.id == draggedKey || "folder-${it.folderId}" == draggedKey }?.title
                ?: updates.first().title
            AppLog.log("home", "移动「$title」到新的首屏第 ${toSlot + 1} 格")
        }
    }

    /** 把 app 移动到 (page, cellIndex)，并同页顺序压实 */
    fun moveApp(appId: String, toPage: Int, toCellIndex: Int) {
        viewModelScope.launch {
            val all = apps.value
            val moved = all.firstOrNull { it.id == appId } ?: return@launch
            val siblings = all.filter {
                it.folderId == null && it.id != appId && it.homePage == toPage
            }.sortedWith(compareBy<WebAppEntity> { it.homeCellIndex }.thenBy { it.createdAt })
                .toMutableList()
            val insertAt = toCellIndex.coerceIn(0, siblings.size)
            siblings.add(insertAt, moved.copy(homePage = toPage))
            val updates = siblings.mapIndexed { index, entity ->
                entity.copy(homePage = toPage, homeCellIndex = index)
            }
            updates.forEach { dao.upsert(it) }
            AppLog.log("home", "移动应用「${moved.title}」到第 ${toPage + 1} 页")
        }
    }

    /**
     * 以“桌面单元格”为单位排序；文件夹的全部成员共享同一个位置。
     * 这避免了直接对 Room 实体列表排序时，一个文件夹被按成员数重复占位。
     */
    fun moveCell(fromKey: String, toKey: String, pageCapacity: Int) {
        if (fromKey == toKey) return
        viewModelScope.launch {
            val cells = HomePages.build(
                apps = apps.value,
                pageCapacity = pageCapacity,
            ).flatten().toMutableList()
            val fromIndex = cells.indexOfFirst { it.key == fromKey }
            val toIndex = cells.indexOfFirst { it.key == toKey }
            if (fromIndex < 0 || toIndex < 0) return@launch
            val moved = cells.removeAt(fromIndex)
            val insertAt = if (fromIndex < toIndex) toIndex - 1 else toIndex
            cells.add(insertAt.coerceIn(0, cells.size), moved)
            persistCellOrder(cells, pageCapacity)
            AppLog.log("home", "重排「${moved.app.title}」至第 ${insertAt + 1} 格")
        }
    }

    /** 拖拽普通应用到普通应用/已有文件夹；文件夹自身不再嵌套。 */
    fun createFolder(aKey: String, bKey: String) {
        viewModelScope.launch {
            val all = apps.value
            val cells = HomePages.build(all).flatten()
            val source = cells.firstOrNull { it.key == aKey } ?: return@launch
            val target = cells.firstOrNull { it.key == bKey } ?: return@launch
            if (source.isFolder || source.app.folderId != null) return@launch
            val a = source.app
            val folderId = target.app.folderId
                ?: "f-${a.id.takeLast(4)}${target.app.id.takeLast(4)}"
            dao.upsert(
                a.copy(
                    folderId = folderId,
                    homePage = target.app.homePage,
                    homeCellIndex = target.app.homeCellIndex,
                ),
            )
            if (!target.isFolder) {
                val b = target.app
                dao.upsert(
                    b.copy(
                        folderId = folderId,
                        homePage = b.homePage,
                        homeCellIndex = b.homeCellIndex,
                    ),
                )
            }
            AppLog.log("home", "创建文件夹（「${a.title}」+「${target.app.title}」）")
        }
    }

    /** 文件夹解散：自动整理模式成员回到原页尾部；自由摆放模式从文件夹槽位起顺序占空槽。 */
    fun dissolveFolder(folderId: String) {
        viewModelScope.launch {
            val settings = settingsRepository.settings.first()
            if (!settings.autoArrangeHome) {
                val updates = HomePages.resolveDissolve(
                    apps = apps.value,
                    folderId = folderId,
                    pageCapacity = (settings.gridColumns * settings.gridRows).coerceAtLeast(1),
                )
                if (updates.isEmpty()) return@launch
                dao.upsertAll(updates)
                AppLog.log("home", "解散文件夹（${updates.size} 个成员）")
                return@launch
            }
            val members = apps.value.filter { it.folderId == folderId }
            val page = members.minOfOrNull { it.homePage } ?: return@launch
            members.forEachIndexed { index, entity ->
                dao.upsert(entity.copy(folderId = null, homePage = page, homeCellIndex = -1 - index))
            }
            AppLog.log("home", "解散文件夹（${members.size} 个成员）")
        }
    }

    /** 从文件夹中移出单个应用：自由摆放模式放到文件夹旁的第一个空槽。 */
    fun removeFromFolder(appId: String) {
        viewModelScope.launch {
            val settings = settingsRepository.settings.first()
            if (!settings.autoArrangeHome) {
                val updated = HomePages.resolveRemoveFromFolder(
                    apps = apps.value,
                    appId = appId,
                    pageCapacity = (settings.gridColumns * settings.gridRows).coerceAtLeast(1),
                ) ?: return@launch
                dao.upsert(updated)
                AppLog.log("home", "「${updated.title}」移出文件夹")
                return@launch
            }
            apps.value.firstOrNull { it.id == appId }?.let {
                dao.upsert(it.copy(folderId = null, homeCellIndex = -1))
                AppLog.log("home", "「${it.title}」移出文件夹")
            }
        }
    }

    fun toggleDesktopMode(appId: String) {
        viewModelScope.launch {
            apps.value.firstOrNull { it.id == appId }?.let {
                dao.upsert(it.copy(desktopMode = !it.desktopMode))
                AppLog.log("home", "「${it.title}」切换${if (!it.desktopMode) "桌面版" else "手机版"}")
            }
        }
    }

    fun toggleKeepAlive(appId: String) {
        viewModelScope.launch {
            apps.value.firstOrNull { it.id == appId }?.let {
                dao.upsert(it.copy(keepAlive = !it.keepAlive))
                AppLog.log("home", "「${it.title}」${if (!it.keepAlive) "开启" else "关闭"}后台保活")
            }
        }
    }

    /** 重命名：空白输入直接忽略。 */
    fun rename(appId: String, newTitle: String) {
        val title = newTitle.trim()
        if (title.isEmpty()) return
        viewModelScope.launch {
            apps.value.firstOrNull { it.id == appId }?.let {
                dao.upsert(it.copy(title = title))
                AppLog.log("home", "「${it.title}」重命名为「$title」")
            }
        }
    }

    /**
     * 更改图标：接受 http(s) 远端地址或 "/" 开头的本地路径；
     * null/空白 = 清除图标，回退首字母兜底。
     */
    fun updateIcon(appId: String, iconUrl: String?) {
        val cleaned = iconUrl?.trim()?.takeIf {
            it.startsWith("http://") || it.startsWith("https://") || it.startsWith("/")
        }
        viewModelScope.launch {
            apps.value.firstOrNull { it.id == appId }?.let {
                dao.upsert(it.copy(iconUrl = cleaned))
                AppLog.log("home", "「${it.title}」${if (cleaned != null) "更换图标" else "清除自定义图标"}")
            }
        }
    }

    /** 强制刷新站点元数据：成功时把非空的 iconUrl/title 写回实体，失败仅提示。 */
    fun refreshMetadata(appId: String) {
        viewModelScope.launch {
            val app = apps.value.firstOrNull { it.id == appId } ?: return@launch
            fetcher.fetch(app.url)
                .onSuccess { metadata ->
                    val updated = app.copy(
                        title = metadata.title.ifBlank { app.title },
                        iconUrl = metadata.iconUrl ?: app.iconUrl,
                    )
                    dao.upsert(updated)
                    AppLog.log("home", "刷新「${updated.title}」站点信息成功")
                    _messages.tryEmit("已刷新「${updated.title}」")
                }
                .onFailure { e ->
                    AppLog.log("home", "刷新「${app.title}」站点信息失败：${e.message}")
                    _messages.tryEmit("刷新失败：${e.message ?: "未知错误"}")
                }
        }
    }

    /** 「全部应用」浮动入口显隐（空白处长按菜单/设置页共用）。 */
    fun setAllAppsEntryVisible(value: Boolean) {
        viewModelScope.launch { settingsRepository.setAllAppsEntryVisible(value) }
    }

    /** 「全部应用」浮动入口拖动落点：归一化 0..1 中心坐标。 */
    fun setAllAppsEntryPosition(x: Float, y: Float) {
        viewModelScope.launch { settingsRepository.setAllAppsEntryPosition(x, y) }
    }

    fun delete(appId: String) {
        viewModelScope.launch {
            val app = apps.value.firstOrNull { it.id == appId }
            dao.deleteById(appId)
            if (app != null) AppLog.log("home", "删除应用「${app.title}」")
        }
    }

    /** 删除文件夹：连同全部成员应用一起删除。 */
    fun deleteFolder(folderId: String) {
        viewModelScope.launch {
            val members = apps.value.filter { it.folderId == folderId }
            members.forEach { dao.deleteById(it.id) }
            AppLog.log("home", "删除文件夹（${members.size} 个成员）")
        }
    }

    private suspend fun persistCellOrder(cells: List<HomeCell>, pageCapacity: Int) {
        val updates = buildList {
            cells.forEachIndexed { index, cell ->
                val page = index / pageCapacity.coerceAtLeast(1)
                val cellIndex = index % pageCapacity.coerceAtLeast(1)
                val members = if (cell.isFolder) cell.folderMembers else listOf(cell.app)
                members.forEach { add(it.copy(homePage = page, homeCellIndex = cellIndex)) }
            }
        }
        dao.upsertAll(updates)
    }

    suspend fun appCount(): Int = withContext(kotlinx.coroutines.Dispatchers.IO) {
        apps.value.size
    }
}
