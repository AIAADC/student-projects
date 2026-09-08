package com.webshell.feature.home

import com.webshell.core.data.WebAppEntity

/** 主页网格的一个单元格：普通应用，或聚合了成员的文件夹。 */
data class HomeCell(
    val key: String,
    val app: WebAppEntity,
    val folderMembers: List<WebAppEntity> = emptyList(),
) {
    val isFolder: Boolean get() = folderMembers.isNotEmpty()
}

object HomePages {

    /**
     * 把数据库里的应用列表推导为分页网格。
     * - folderId == null 的应用按 (homePage, homeCellIndex, createdAt) 排序
     * - homeCellIndex == -1 视为"追加"（排在同页末尾，按创建时间）
     * - folderId 相同的应用聚合为一个文件夹单元格，位置取成员的最小 (page, index)
     */
    fun build(
        apps: List<WebAppEntity>,
        minPages: Int = 1,
        pageCapacity: Int = Int.MAX_VALUE,
    ): List<List<HomeCell>> {
        val ordered = aggregateCells(apps)
        val capacity = pageCapacity.coerceAtLeast(1)
        val pages = if (capacity == Int.MAX_VALUE) {
            ordered.groupBy { it.app.homePage }
                .let { map ->
                    val maxPage = (map.keys.maxOrNull() ?: 0).coerceAtLeast(minPages - 1)
                    (0..maxPage).map { page -> map[page].orEmpty() }
                }
        } else {
            ordered.chunked(capacity).ifEmpty { listOf(emptyList()) }.toMutableList().apply {
                // 最后一屏始终给“添加”入口留一个格子，避免满屏时纵向溢出。
                if (lastOrNull()?.size == capacity) add(emptyList())
                while (size < minPages) add(emptyList())
            }
        }
        return pages
    }

    /**
     * 自由摆放（稀疏）分页：每个 cell 保持自己持久的 (homePage, homeCellIndex)，
     * 空槽以 null 占位 —— 拖到哪儿就停在哪儿，绝不自动压实。
     * - homeCellIndex 无效（-1/越界/槽位冲突）按“追加”处理：最后一页首个空槽，末页已满则开新页；
     * - 页数 = 最大占用页 + 1（自动裁掉尾部空页）；
     * - 末页全满时额外补一页全空页，给“添加”入口留槽位（与密集模式一致）。
     */
    fun buildSparse(
        apps: List<WebAppEntity>,
        pageCapacity: Int,
        minPages: Int = 1,
    ): List<List<HomeCell?>> {
        val capacity = pageCapacity.coerceAtLeast(1)
        val cells = aggregateCells(apps)
        val pages = mutableListOf<MutableList<HomeCell?>>()
        fun ensurePage(page: Int) {
            while (pages.size <= page) {
                pages += MutableList<HomeCell?>(capacity) { null }
            }
        }
        fun placeAppend(cell: HomeCell) {
            var target = pages.size - 1
            var slot = pages[target].indexOfFirst { it == null }
            if (slot < 0) {
                ensurePage(target + 1)
                target += 1
                slot = 0
            }
            pages[target][slot] = cell
        }
        val maxPage = cells.maxOfOrNull { it.app.homePage.coerceAtLeast(0) } ?: 0
        ensurePage(maxOf(maxPage, minPages - 1))
        // 先放有明确槽位的（按 页/槽/创建时间 的顺序，冲突时先来先得，后到追加，保证确定性）
        val (placed, appended) = cells.partition { it.app.homeCellIndex in 0 until capacity }
        placed.forEach { cell ->
            val page = cell.app.homePage.coerceAtLeast(0)
            ensurePage(page)
            val slot = cell.app.homeCellIndex
            if (pages[page][slot] == null) pages[page][slot] = cell else placeAppend(cell)
        }
        appended.forEach { placeAppend(it) }
        if (pages.last().all { it != null }) {
            pages += MutableList<HomeCell?>(capacity) { null }
        }
        return pages
    }

    /**
     * 自由摆放落子：把 [draggedKey] 移动到 (toPage, toSlot)。
     * 目标槽为空 → 直接落子；被占用 → 双方交换槽位（文件夹整体交换）。
     * 返回需要落库的实体列表；空列表 = 无操作（原地松手等）。
     */
    fun resolveSlotMove(
        apps: List<WebAppEntity>,
        draggedKey: String,
        toPage: Int,
        toSlot: Int,
        pageCapacity: Int,
    ): List<WebAppEntity> {
        val capacity = pageCapacity.coerceAtLeast(1)
        if (toPage < 0 || toSlot !in 0 until capacity) return emptyList()
        val sparse = buildSparse(apps, capacity)
        val positions = HashMap<String, Pair<Int, Int>>()
        val cellsByKey = HashMap<String, HomeCell>()
        sparse.forEachIndexed { page, slots ->
            slots.forEachIndexed { slot, cell ->
                if (cell != null) {
                    positions[cell.key] = page to slot
                    cellsByKey[cell.key] = cell
                }
            }
        }
        val from = positions[draggedKey] ?: return emptyList()
        if (from == toPage to toSlot) return emptyList()
        val dragged = cellsByKey.getValue(draggedKey)
        val occupant = cellsByKey.values.firstOrNull {
            it.key != draggedKey && positions[it.key] == toPage to toSlot
        }
        val updates = ArrayList<WebAppEntity>()
        val draggedEntities = if (dragged.isFolder) dragged.folderMembers else listOf(dragged.app)
        draggedEntities.mapTo(updates) { it.copy(homePage = toPage, homeCellIndex = toSlot) }
        if (occupant != null) {
            val occupantEntities = if (occupant.isFolder) occupant.folderMembers else listOf(occupant.app)
            occupantEntities.mapTo(updates) {
                it.copy(homePage = from.first, homeCellIndex = from.second)
            }
        }
        return updates
    }

    /**
     * 首屏左缘开新屏落子：被拖 cell 落到新首屏 (0, toSlot)，其余所有实体页号 +1
     * （文件夹成员随 anchor 一起后移，相对槽位不变）。
     * 返回需要落库的实体列表；空列表 = 无操作。
     */
    fun resolvePrependMove(
        apps: List<WebAppEntity>,
        draggedKey: String,
        toSlot: Int,
        pageCapacity: Int,
    ): List<WebAppEntity> {
        val capacity = pageCapacity.coerceAtLeast(1)
        if (toSlot !in 0 until capacity) return emptyList()
        val dragged = aggregateCells(apps).firstOrNull { it.key == draggedKey } ?: return emptyList()
        val draggedIds = (if (dragged.isFolder) dragged.folderMembers else listOf(dragged.app))
            .mapTo(HashSet()) { it.id }
        return apps.map { entity ->
            if (entity.id in draggedIds) {
                entity.copy(homePage = 0, homeCellIndex = toSlot)
            } else {
                entity.copy(homePage = entity.homePage.coerceAtLeast(0) + 1)
            }
        }
    }

    /**
     * 自由摆放解散文件夹：首个成员占文件夹原槽位，其余成员从该槽位起顺序占空槽。
     * 返回需要落库的实体列表（folderId 已置空）。
     */
    fun resolveDissolve(
        apps: List<WebAppEntity>,
        folderId: String,
        pageCapacity: Int,
    ): List<WebAppEntity> {
        val capacity = pageCapacity.coerceAtLeast(1)
        val members = apps.filter { it.folderId == folderId }.sortedWith(entityOrder())
        if (members.isEmpty()) return emptyList()
        val sparse = buildSparse(apps, capacity)
        val occupied = HashSet<Pair<Int, Int>>()
        var folderSlot = 0
        sparse.forEachIndexed { page, slots ->
            slots.forEachIndexed { slot, cell ->
                if (cell != null) {
                    occupied += page to slot
                    if (cell.key == "folder-$folderId") folderSlot = page * capacity + slot
                }
            }
        }
        // 文件夹自身槽位释放给首个成员
        occupied -= folderSlot / capacity to folderSlot % capacity
        val updates = ArrayList<WebAppEntity>(members.size)
        var cursor = folderSlot
        members.forEach { member ->
            while ((cursor / capacity to cursor % capacity) in occupied) cursor++
            occupied += cursor / capacity to cursor % capacity
            updates += member.copy(
                folderId = null,
                homePage = cursor / capacity,
                homeCellIndex = cursor % capacity,
            )
            cursor++
        }
        return updates
    }

    /** 自由摆放移出文件夹：从文件夹槽位起取第一个空槽。 */
    fun resolveRemoveFromFolder(
        apps: List<WebAppEntity>,
        appId: String,
        pageCapacity: Int,
    ): WebAppEntity? {
        val capacity = pageCapacity.coerceAtLeast(1)
        val app = apps.firstOrNull { it.id == appId } ?: return null
        val folderId = app.folderId ?: return null
        val sparse = buildSparse(apps, capacity)
        val occupied = HashSet<Pair<Int, Int>>()
        var cursor = 0
        sparse.forEachIndexed { page, slots ->
            slots.forEachIndexed { slot, cell ->
                if (cell != null) {
                    occupied += page to slot
                    if (cell.key == "folder-$folderId") cursor = page * capacity + slot
                }
            }
        }
        while ((cursor / capacity to cursor % capacity) in occupied) cursor++
        return app.copy(
            folderId = null,
            homePage = cursor / capacity,
            homeCellIndex = cursor % capacity,
        )
    }

    /**
     * 纵向滚动模式：把分页网格摊平成一条列表 —— 每页补空槽到满容量后首尾相接。
     * 全局下标与持久化坐标的换算固定为 page = index / capacity、slot = index % capacity，
     * 落子仍走 (homePage, homeCellIndex)，数据模型不变。
     */
    fun flatten(pages: List<List<HomeCell?>>, pageCapacity: Int): List<HomeCell?> {
        val capacity = pageCapacity.coerceAtLeast(1)
        val out = ArrayList<HomeCell?>(pages.size * capacity)
        pages.forEach { page ->
            out.addAll(page.take(capacity))
            repeat((capacity - page.size).coerceAtLeast(0)) { out.add(null) }
        }
        return out
    }

    /** 根级应用 + 文件夹聚合为 cell 列表，按 (页, 槽, 创建时间) 排序。 */
    private fun aggregateCells(apps: List<WebAppEntity>): List<HomeCell> {
        val byId = apps.associateBy { it.id }

        val folderGroups = apps.filter { it.folderId != null && byId.containsKey(it.id) }
            .groupBy { it.folderId!! }

        val folderCells = folderGroups.map { (_, members) ->
            val ordered = members.sortedWith(entityOrder())
            val anchor = ordered.minBy { it.homePage * 100_000 + orderKey(it) }
            HomeCell(
                key = "folder-${anchor.folderId}",
                app = anchor,
                folderMembers = ordered,
            )
        }

        val rootCells = apps.filter { it.folderId == null }
            .map { HomeCell(key = it.id, app = it) }

        return (rootCells + folderCells).sortedWith(
            compareBy<HomeCell> { it.app.homePage }
                .thenBy { orderKey(it.app) }
                .thenBy { it.app.createdAt },
        )
    }

    private fun entityOrder(): Comparator<WebAppEntity> =
        compareBy<WebAppEntity> { it.homePage }.thenBy { orderKey(it) }.thenBy { it.createdAt }

    private fun orderKey(entity: WebAppEntity): Int =
        if (entity.homeCellIndex < 0) Int.MAX_VALUE / 2 else entity.homeCellIndex
}
