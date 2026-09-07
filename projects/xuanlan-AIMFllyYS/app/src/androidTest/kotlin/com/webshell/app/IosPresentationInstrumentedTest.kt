package com.webshell.app

import android.os.SystemClock
import android.graphics.Bitmap
import androidx.room.Room
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.StaleObjectException
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.webshell.core.data.HomeSettings
import com.webshell.core.data.SCROLL_MODE_PAGER
import com.webshell.core.data.SCROLL_MODE_VERTICAL
import com.webshell.core.data.SettingsRepository
import com.webshell.core.data.THEME_MODE_DARK
import com.webshell.core.data.THEME_MODE_LIGHT
import com.webshell.core.data.THEME_MODE_PHOTO
import com.webshell.core.data.WebAppEntity
import com.webshell.core.data.WebShellDatabase
import java.io.File
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/** Real-device rendering/navigation checks. Fixtures and preferences are restored after each test. */
@RunWith(AndroidJUnit4::class)
class IosPresentationInstrumentedTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val device = UiDevice.getInstance(instrumentation)
    private val settings = SettingsRepository(context)
    private lateinit var database: WebShellDatabase
    private var originalApps: List<WebAppEntity> = emptyList()
    private var originalSettings: HomeSettings? = null
    private var scenario: ActivityScenario<MainActivity>? = null

    @Before
    fun setUp(): Unit = runBlocking {
        database = Room.databaseBuilder(context, WebShellDatabase::class.java, WebShellDatabase.NAME)
            .addMigrations(WebShellDatabase.MIGRATION_2_3).build()
        originalApps = database.webAppDao().observeAll().first()
        originalSettings = settings.settings.first()
        originalApps.forEach { database.webAppDao().deleteById(it.id) }
        val titles = listOf("邮件", "日历", "相册", "地图", "音乐", "阅读", "笔记", "天气",
            "视频", "翻译", "播客", "提醒", "时钟", "相机", "健康", "文件", "图书", "新闻",
            "钱包", "旅行", "Alpha", "Beta", "Gamma", "Delta")
        val apps = titles.mapIndexed { index, title ->
            WebAppEntity(
                id = "ios-qa-$index", title = title,
                url = "https://appassets.androidplatform.net/assets/fixtures/spa/index.html#$index",
                iconUrl = null, desktopMode = false, darkMode = false, keepAlive = false,
                isFavorite = false, homePage = index / 20, homeCellIndex = index % 20,
                folderId = if (index in 6..8) "ios-qa-folder" else null,
                createdAt = index.toLong(),
            ).let { if (index in 6..8) it.copy(homeCellIndex = 6) else it }
        }
        database.webAppDao().upsertAll(apps)
        settings.setThemeMode(THEME_MODE_LIGHT)
        settings.setGridColumns(4)
        settings.setGridRows(5)
        settings.setShowLabels(true)
        settings.setShowPageIndicator(true)
        settings.setAutoArrangeHome(false)
        settings.setHomeScrollMode(SCROLL_MODE_PAGER)
        settings.setAllAppsEntryVisible(false)
        settings.setIconSizeDp(60)
        settings.setKeepAliveServiceEnabled(false)
    }

    @After
    fun tearDown(): Unit = runBlocking {
        // A deliberately animated edit screen is never visually idle; dismiss it explicitly.
        device.pressBack()
        scenario?.close()
        if (::database.isInitialized) {
            database.webAppDao().observeAll().first().forEach { database.webAppDao().deleteById(it.id) }
            database.webAppDao().upsertAll(originalApps)
            database.close()
        }
        originalSettings?.let {
            settings.setThemeMode(it.themeMode)
            settings.setPhotoWallpaperPath(it.photoWallpaperPath)
            settings.setGridColumns(it.gridColumns)
            settings.setGridRows(it.gridRows)
            settings.setShowLabels(it.showLabels)
            settings.setShowPageIndicator(it.showPageIndicator)
            settings.setAutoArrangeHome(it.autoArrangeHome)
            settings.setHomeScrollMode(it.homeScrollMode)
            settings.setAllAppsEntryVisible(it.allAppsEntryVisible)
            settings.setIconSizeDp(it.iconSizeDp)
            settings.setKeepAliveServiceEnabled(it.keepAliveServiceEnabled)
        }
    }

    @Test
    fun homeFolderAndSecondPage() {
        launchHome()
        shot("home-light")
        text("文件夹").click()
        assertNotNull(text("解散文件夹"))
        shot("folder")
        device.pressBack()
        assertTrue(device.wait(Until.gone(By.text("解散文件夹")), 3_000))
        SystemClock.sleep(350)
        val y = device.displayHeight / 2
        device.swipe(device.displayWidth * 9 / 10, y, device.displayWidth / 10, y, 25)
        shot("home-after-swipe")
        assertNotNull(text("Alpha"))
        assertNotNull(text("Delta"))
        shot("home-page-two")
    }

    @Test
    fun contextMenuEditAndLibrary() {
        launchHome()
        text("邮件").longClick()
        text("打开")
        shot("context-menu")
        device.pressBack()
        text("搜索").click()
        val search = device.wait(Until.findObject(By.clazz("android.widget.EditText")), 5_000)
        assertNotNull(search)
        search!!.click()
        search.text = "邮件"
        shot("app-library")
        text("取消").click()
        assertTrue(device.wait(Until.gone(By.text("App 资源库")), 3_000))
        SystemClock.sleep(350)
        // An intentionally empty fixture slot, measured from its real row/column neighbours.
        // A screen fraction can land on the Search capsule at compact widths / large fonts.
        val emptyX = text("地图").visibleBounds.centerX()
        val emptyY = text("音乐").visibleBounds.centerY()
        device.swipe(emptyX, emptyY, emptyX, emptyY, 150)
        text("编辑模式").click()
        text("完成")
        shot("home-edit")
    }

    @Test
    fun settingsHierarchyAndDarkTheme() {
        launchHome()
        description("我的").click()
        text("外观与主题")
        shot("settings-light")
        text("外观与主题").click()
        text("纯黑")
        shot("appearance")
        device.pressBack()
        text("主页布局").click()
        shot("layout-settings")
        device.pressBack()
        runBlocking { settings.setThemeMode(THEME_MODE_DARK) }
        shot("settings-dark")
        description("主页").click()
        text("邮件")
        shot("home-dark")
    }

    @Test
    fun addAndBrowserControlsRemainReachable() {
        launchHome()
        // Dock's semantic tab is the last Add node; the grid Add is on the second page.
        description("添加").click()
        assertTrue(device.wait(Until.hasObject(By.clazz("android.widget.EditText")), 5_000))
        shot("add")
        description("浏览").click()
        shot("browser-empty")
        enterAddress("https://appassets.androidplatform.net/assets/fixtures/spa/index.html")
        shot("browser-after-go")
        assertTrue("Local WebView fixture must load", device.wait(Until.hasObject(By.text("夹具 · 第 1 页")), 10_000))
        description("标签页").click()
        text("新标签页").click()
        description("标签页").click()
        assertTrue("Tab switcher must retain both tabs", device.wait(Until.hasObject(By.textContains("2")), 3_000))
        shot("browser-tabs")
        device.pressBack()
        description("菜单").click()
        text("关闭全部标签").click()
        // The destructive action opens the shared confirmation dialog; selecting the menu item
        // alone must not close tabs without an explicit confirmation.
        text("关闭全部").click()
        text("暂无标签页")
        SystemClock.sleep(350)
        device.pressBack()
        assertNotNull("Back from browser empty state must reach Home", text("邮件"))
    }

    @Test
    fun photoWallpaperCanBeClearedWithoutStaleTheme() {
        val photo = File(context.cacheDir, "ios-qa-wallpaper.png")
        val bitmap = Bitmap.createBitmap(64, 128, Bitmap.Config.ARGB_8888)
        try {
            bitmap.eraseColor(android.graphics.Color.rgb(52, 100, 85))
            photo.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        } finally {
            bitmap.recycle()
        }
        runBlocking {
            settings.setPhotoWallpaperPath(photo.absolutePath)
            settings.setThemeMode(THEME_MODE_PHOTO)
        }
        launchHome()
        shot("home-photo")
        runBlocking {
            settings.setPhotoWallpaperPath(null)
            settings.setThemeMode(THEME_MODE_LIGHT)
        }
        text("邮件")
        shot("home-photo-cleared")
    }

    @Test
    fun verticalModeRetainsScrollableGrid() {
        runBlocking { settings.setHomeScrollMode(SCROLL_MODE_VERTICAL) }
        launchHome()
        val y0 = device.displayHeight * 7 / 10
        val y1 = device.displayHeight * 3 / 10
        device.swipe(device.displayWidth / 2, y0, device.displayWidth / 2, y1, 30)
        assertNotNull(text("Alpha"))
        assertNotNull(text("Delta"))
        shot("home-vertical")
    }

    private fun launchHome() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
        text("邮件")
        device.waitForIdle(1_000)
    }

    private fun text(value: String) = device.wait(Until.findObject(By.text(value)), 6_000)
        ?: throw AssertionError("Missing text: $value")

    private fun description(value: String) = device.wait(Until.findObject(By.desc(value)), 5_000)
        ?: throw AssertionError("Missing content description: $value")

    private fun enterAddress(url: String) {
        repeat(5) {
            val field = device.wait(Until.findObject(By.clazz("android.widget.EditText")), 2_000)
                ?: return@repeat
            try {
                field.click()
                field.text = url
                device.pressEnter()
                return
            } catch (_: StaleObjectException) {
                SystemClock.sleep(120)
            }
        }
        throw AssertionError("Address field must be reachable")
    }

    private fun shot(name: String) {
        SystemClock.sleep(600)
        val directory = File(context.getExternalFilesDir(null), "ios-qa").apply { mkdirs() }
        val screenshot = File(directory, "$name.png")
        assertTrue("Screenshot $name", device.takeScreenshot(screenshot))
        // Gradle removes the tested APK after a run, including app-scoped external files.
        // Preserve only these synthetic-fixture screenshots in a dedicated shared QA folder.
        device.executeShellCommand("mkdir -p /sdcard/Download/webshell-ios-qa")
        device.executeShellCommand("cp ${screenshot.absolutePath} /sdcard/Download/webshell-ios-qa/$name.png")
    }
}
