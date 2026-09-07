package com.webshell.app

import android.app.Instrumentation
import android.graphics.Point
import android.os.SystemClock
import android.view.MotionEvent
import androidx.room.Room
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.webshell.core.data.WebAppEntity
import com.webshell.core.data.WebShellDatabase
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.BeforeClass
import org.junit.FixMethodOrder
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.MethodSorters

/**
 * 主页手势的端侧仪表化测试：真实 MotionEvent 注入（Instrumentation.sendPointerSync）
 * + UIAutomator 读屏 + Room 落库断言。覆盖用户验收路径：
 * 长按菜单、右缘悬停开新屏、首屏左缘开新屏、空白处长按菜单、编辑模式即按即拖、
 * 「全部应用」抽屉。数据通过测试侧直连应用数据库播种（进程内第二连接，
 * 仅用于初始播种与结果断言；UI 响应靠每个测试重建 Activity 触发重新查询）。
 */
@RunWith(AndroidJUnit4::class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
class HomeGestureInstrumentedTest {

    private lateinit var instrumentation: Instrumentation
    private lateinit var device: UiDevice
    private var scenario: ActivityScenario<MainActivity>? = null

    @Before
    fun setUp() {
        instrumentation = InstrumentationRegistry.getInstrumentation()
        device = UiDevice.getInstance(instrumentation)
        seedApps()
    }

    @After
    fun tearDown() {
        // Exit the infinite jiggle before ActivityScenario waits for an idle main queue.
        device.pressBack()
        scenario?.close()
        scenario = null
    }

    @Test
    fun a00_inPageReorderDrag() {
        launchHome()
        val alpha = centerOf("Alpha")
        val gamma = centerOf("Gamma")
        // 长按 Alpha 拖到 Gamma 的槽位（自由摆放：占用交换，slot 0 ↔ slot 2）。
        // 末端不停留立即松手，避免触发文件夹悬停热点。
        longPressDrag(from = alpha, to = gamma)
        val moved = readApp("alpha")
        assertEquals(
            "页内拖拽重排：alpha.homeCellIndex 应为 2，实际 ${moved?.homeCellIndex}",
            2,
            moved?.homeCellIndex,
        )
        val swapped = readApp("gamma")
        assertEquals("被占用槽位应交换：gamma.homeCellIndex 应为 0", 0, swapped?.homeCellIndex)
    }

    @Test
    fun a01_longPressIconShowsContextMenu() {
        launchHome()
        val alpha = centerOf("Alpha")
        longPress(alpha)
        assertNotNull("长按图标应弹出情境菜单（含「打开」）", find("打开", 3000))
        device.pressBack()
    }

    @Test
    fun a02_dragToRightEdgeCreatesNewPage() {
        launchHome()
        val delta = centerOf("Delta")
        // 长按后拖到右边缘并悬停 > 900ms（NEW_PAGE_HOVER），松手落子新屏。
        longPressDrag(
            from = delta,
            to = Point(device.displayWidth - 4, delta.y),
            holdAtEndMs = 2200,
            beforeRelease = { shot("a02_before_release") },
        )
        val moved = readApp("delta")
        assertEquals(
            "拖到右缘悬停应开新屏并落子：delta.homePage 应为 1，实际 ${moved?.homePage}",
            1,
            moved?.homePage,
        )
    }

    @Test
    fun a03_dragToLeftEdgeOnFirstPagePrependsNewPage() {
        launchHome()
        val alpha = centerOf("Alpha")
        longPressDrag(
            from = alpha,
            to = Point(4, alpha.y),
            holdAtEndMs = 2200,
        )
        val dragged = readApp("alpha")
        val shifted = readApp("beta")
        assertEquals("左侧开新屏后被拖图标落在新首屏（homePage=0）", 0, dragged?.homePage)
        assertEquals(
            "左侧开新屏后其余应用整体后移一页：beta.homePage 应为 1，实际 ${shifted?.homePage}",
            1,
            shifted?.homePage,
        )
    }

    @Test
    fun a04_blankAreaLongPressShowsHomeMenu() {
        launchHome()
        longPress(blankPoint())
        assertNotNull("空白处长按应弹出主页菜单（含「编辑模式」）", find("编辑模式", 3000))
        device.pressBack()
    }

    @Test
    fun a05_editModeImmediateDragWithoutMenu() {
        launchHome()
        enterEditModeViaBlankMenu()
        val alpha = centerOf("Alpha")
        // 即按即拖：不等长按超时，直接快速下移一行（4 列网格 → 目标槽位 4）。
        val rowPitch = (98 * instrumentation.targetContext.resources.displayMetrics.density).toInt()
        immediateDrag(from = alpha, to = Point(alpha.x, alpha.y + rowPitch))
        val moved = readApp("alpha")
        assertNull("编辑模式拖拽全程不应弹出长按菜单", find("重命名", 500))
        assertEquals("homePage 应保持 0", 0, moved?.homePage)
        assertTrue(
            "编辑模式即按即拖：alpha 应离开原槽位 0，实际 ${moved?.homeCellIndex}",
            moved != null && moved.homeCellIndex != 0,
        )
    }

    @Test
    fun a06_allAppsDrawerOpensFromFloatingEntry() {
        launchHome()
        val entry = find("全部应用", 5000)
        assertNotNull("主屏应存在「全部应用」浮动入口", entry)
        entry!!.click()
        assertTrue(
            "点按入口应打开全部应用抽屉（含首字母分区头 A-Z）",
            device.wait(Until.hasObject(By.text("A")), 3000),
        )
        assertNotNull("抽屉内应列出全部应用", find("Beta", 2000))
        device.pressBack()
    }

    // ---------- 测试辅助 ----------

    private fun launchHome() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
        // 等首页网格首帧（播种的 Alpha 一定在第 0 页）
        assertTrue("首页未在 8s 内就绪", device.wait(Until.hasObject(By.text("Alpha")), 8000))
        SystemClock.sleep(600)
    }

    private fun find(text: String, timeoutMs: Long) =
        device.wait(Until.findObject(By.text(text)), timeoutMs)

    private fun centerOf(label: String): Point {
        val obj = device.wait(Until.findObject(By.text(label)), 5000)
        assertNotNull("找不到图标「$label」", obj)
        val bounds = obj!!.visibleBounds
        return Point(bounds.centerX(), bounds.centerY())
    }

    private fun blankPoint() = Point(
        (device.displayWidth * 0.6).toInt(),
        (device.displayHeight * 0.5).toInt(),
    )

    private fun enterEditModeViaBlankMenu() {
        if (device.wait(Until.hasObject(By.text("完成")), 800)) return
        longPress(blankPoint())
        val item = find("编辑模式", 3000)
        assertNotNull("空白长按菜单缺少「编辑模式」项", item)
        item!!.click()
        assertNotNull("点按「编辑模式」后应进入编辑模式（出现「完成」）", find("完成", 3000))
        SystemClock.sleep(300)
    }

    private fun inject(action: Int, x: Float, y: Float, downTime: Long) {
        val event = MotionEvent.obtain(
            downTime,
            SystemClock.uptimeMillis(),
            action,
            x,
            y,
            0,
        )
        instrumentation.sendPointerSync(event)
        event.recycle()
    }

    private fun longPress(p: Point, holdMs: Long = 650) {
        val downTime = SystemClock.uptimeMillis()
        inject(MotionEvent.ACTION_DOWN, p.x.toFloat(), p.y.toFloat(), downTime)
        SystemClock.sleep(holdMs)
        inject(MotionEvent.ACTION_UP, p.x.toFloat(), p.y.toFloat(), downTime)
        SystemClock.sleep(400)
    }

    /** 长按确认后分步拖到目标点，末端悬停 [holdAtEndMs] 再松手。 */
    private fun longPressDrag(
        from: Point,
        to: Point,
        longPressMs: Long = 650,
        moveSteps: Int = 12,
        holdAtEndMs: Long = 0,
        beforeRelease: (() -> Unit)? = null,
    ) {
        val downTime = SystemClock.uptimeMillis()
        inject(MotionEvent.ACTION_DOWN, from.x.toFloat(), from.y.toFloat(), downTime)
        SystemClock.sleep(longPressMs)
        for (i in 1..moveSteps) {
            val x = from.x + (to.x - from.x) * i / moveSteps
            val y = from.y + (to.y - from.y) * i / moveSteps
            inject(MotionEvent.ACTION_MOVE, x.toFloat(), y.toFloat(), downTime)
            SystemClock.sleep(40)
        }
        if (holdAtEndMs > 0) SystemClock.sleep(holdAtEndMs)
        beforeRelease?.invoke()
        inject(MotionEvent.ACTION_UP, to.x.toFloat(), to.y.toFloat(), downTime)
        SystemClock.sleep(500)
    }

    /** 端测取证：截图落盘到应用缓存目录（run-as 可读）。 */
    private fun shot(name: String) {
        val dir = instrumentation.targetContext.cacheDir
        dir.mkdirs()
        val file = java.io.File(dir, "$name.png")
        val ok = device.takeScreenshot(file)
        android.util.Log.i("HomeGestureTest", "shot $name ok=$ok path=${file.absolutePath}")
    }

    /** 编辑模式拖拽：不等长按超时，按下即快速移动。 */
    private fun immediateDrag(from: Point, to: Point, moveSteps: Int = 8) {
        val downTime = SystemClock.uptimeMillis()
        inject(MotionEvent.ACTION_DOWN, from.x.toFloat(), from.y.toFloat(), downTime)
        for (i in 1..moveSteps) {
            val x = from.x + (to.x - from.x) * i / moveSteps
            val y = from.y + (to.y - from.y) * i / moveSteps
            inject(MotionEvent.ACTION_MOVE, x.toFloat(), y.toFloat(), downTime)
            SystemClock.sleep(40)
        }
        inject(MotionEvent.ACTION_UP, to.x.toFloat(), to.y.toFloat(), downTime)
        SystemClock.sleep(500)
    }

    private fun readApp(id: String): WebAppEntity? {
        val db = Room.databaseBuilder(
            instrumentation.targetContext,
            WebShellDatabase::class.java,
            WebShellDatabase.NAME,
        ).addMigrations(WebShellDatabase.MIGRATION_2_3).build()
        try {
            return runBlocking { db.webAppDao().getById(id) }
        } finally {
            db.close()
        }
    }

    companion object {

        /**
         * 播种 4 个应用到首屏前 4 格（进程启动后、首个 Activity 启动前执行，
         * 保证主页首次查询即读到；图标留空走首字母兜底，不依赖网络）。
         */
        @JvmStatic
        fun seedApps() {
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            val db = Room.databaseBuilder(
                context,
                WebShellDatabase::class.java,
                WebShellDatabase.NAME,
            ).addMigrations(WebShellDatabase.MIGRATION_2_3).build()
            try {
                val apps = listOf("alpha" to "Alpha", "beta" to "Beta", "gamma" to "Gamma", "delta" to "Delta")
                    .mapIndexed { index, (id, title) ->
                        WebAppEntity(
                            id = id,
                            title = title,
                            url = "https://example.com/$id",
                            iconUrl = null,
                            desktopMode = false,
                            darkMode = false,
                            keepAlive = false,
                            isFavorite = false,
                            homePage = 0,
                            homeCellIndex = index,
                            folderId = null,
                            createdAt = index.toLong() + 1,
                        )
                    }
                runBlocking {
                    db.webAppDao().upsertAll(apps)
                    com.webshell.core.data.SettingsRepository(context).setAllAppsEntryVisible(true)
                }
            } finally {
                db.close()
            }
        }
    }
}
