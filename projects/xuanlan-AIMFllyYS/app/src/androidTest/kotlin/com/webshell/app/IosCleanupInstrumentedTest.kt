package com.webshell.app

import android.content.Intent
import android.graphics.BitmapFactory
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.room.Room
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.BySelector
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import com.webshell.app.catalog.CatalogRegistry
import com.webshell.core.data.HomeSettings
import com.webshell.core.data.SCROLL_MODE_PAGER
import com.webshell.core.data.SettingsRepository
import com.webshell.core.data.THEME_MODE_LIGHT
import com.webshell.core.data.WebAppEntity
import com.webshell.core.data.WebShellDatabase
import com.webshell.core.model.AppFontFamily
import java.io.File
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** Catalog sweep is read-only. Production-interaction tests back up and restore their own fixtures. */
@RunWith(AndroidJUnit4::class)
class IosCleanupInstrumentedTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context = instrumentation.targetContext
    private val args = InstrumentationRegistry.getArguments()
    private val device = UiDevice.getInstance(instrumentation)
    private var harness: ActivityScenario<CatalogHarnessActivity>? = null
    private var application: ActivityScenario<MainActivity>? = null
    private var database: WebShellDatabase? = null
    private var originalApps: List<WebAppEntity>? = null
    private var originalSettings: HomeSettings? = null
    private val settings = SettingsRepository(context)

    @After
    fun cleanUp() {
        // Remove intentional progress/jiggle scenes before lifecycle helpers wait on the main queue.
        harness?.onActivity { it.showEntry(null) }
        harness?.close()
        application?.close()
        harness = null
        application = null
        runBlocking {
            val db = database
            originalApps?.let { snapshot ->
                requireNotNull(db).webAppDao().observeAll().first().forEach { db.webAppDao().deleteById(it.id) }
                db.webAppDao().upsertAll(snapshot)
            }
            originalSettings?.let {
                settings.setAppTypography(it.appFontFamily, it.appFontScalePercent)
                settings.setThemeMode(it.themeMode)
                settings.setGridColumns(it.gridColumns)
                settings.setGridRows(it.gridRows)
                settings.setShowLabels(it.showLabels)
                settings.setAutoArrangeHome(it.autoArrangeHome)
                settings.setHomeScrollMode(it.homeScrollMode)
                settings.setAllAppsEntryVisible(it.allAppsEntryVisible)
                settings.setKeepAliveServiceEnabled(it.keepAliveServiceEnabled)
            }
        }
        database?.close()
    }

    @Test
    fun catalogEveryRegistryEntryRendersAndIsCaptured() {
        val entries = CatalogRegistry.entries().sortedBy { it.id }
        assertTrue("Production registry must not be empty", entries.isNotEmpty())
        assertEquals(entries.size, entries.map { it.id }.distinct().size)
        val intent = Intent(context, CatalogHarnessActivity::class.java)
            .putExtra(CatalogHarnessActivity.EXTRA_ENTRY_ID, entries.first().id)
            .putExtra(CatalogHarnessActivity.EXTRA_FONT_FAMILY, args.getString("catalogFontFamily", AppFontFamily.MISANS))
            .putExtra(CatalogHarnessActivity.EXTRA_FONT_PERCENT, args.getString("catalogFontPercent", "100").toInt())
            .putExtra(CatalogHarnessActivity.EXTRA_SYSTEM_FONT_SCALE, args.getString("catalogSystemFontScale", "0").toFloat())
            .putExtra(CatalogHarnessActivity.EXTRA_THEME, args.getString("catalogTheme", "light"))
        harness = ActivityScenario.launch(intent)
        val captured = mutableListOf<String>()
        entries.forEach { entry ->
            harness!!.onActivity { it.showEntry(entry.id) }
            val preview = waitFor(By.desc("catalog-preview:${entry.id}"))
            assertTrue("Scene ${entry.id} has no visible body", preview.visibleBounds.height() > 24)
            assertTrue("Scene ${entry.id} is outside viewport", preview.visibleBounds.width() > device.displayWidth / 2)
            shot("catalog", entry.id)
            captureOverlayIfPresent(entry.id)
            captured += entry.id
        }
        assertEquals("Every registered scene must be captured", entries.map { it.id }, captured)
        val index = File(evidenceDirectory("catalog"), "index.tsv")
        index.writeText(buildString {
            append("id\tapi\twidth_px\theight_px\tfont\tapp_percent\tsystem_scale\ttheme\n")
            captured.forEach { id ->
                append("$id\t${android.os.Build.VERSION.SDK_INT}\t${device.displayWidth}\t${device.displayHeight}\t")
                append("${args.getString("catalogFontFamily", AppFontFamily.MISANS)}\t${args.getString("catalogFontPercent", "100")}\t")
                append("${args.getString("catalogSystemFontScale", "system")}\t${args.getString("catalogTheme", "light")}\n")
            }
        })
        preserveEvidence(index, "catalog")
    }

    @Test
    fun fontSelectionRequiresApplyAndPersistsAcrossActivityRecreation() {
        prepareProductionFixture()
        launchHome()
        waitFor(By.desc("我的")).click()
        scrollTo(By.text("外观与主题")).click()
        scrollTo(By.text("字体与字号")).click()
        scrollTo(By.text("Noto Sans SC")).click()
        val increaseLabel = context.getString(
            com.webshell.core.designsystem.R.string.designsystem_increase,
            context.getString(com.webshell.feature.me.R.string.me_font_size),
        )
        repeat(2) { scrollTo(By.descContains(increaseLabel)).click() }
        assertEquals("Draft must not change the global font", AppFontFamily.MISANS, readSettings().appFontFamily)
        assertEquals("Draft must not change global size", 100, readSettings().appFontScalePercent)
        shot("pages", "font-preview-before-apply")
        scrollTo(By.text("应用字体设置")).click()
        waitUntil("Font apply did not persist") {
            readSettings().let { it.appFontFamily == AppFontFamily.NOTO_SANS_SC && it.appFontScalePercent == 110 }
        }
        scrollTo(By.text("Noto Sans SC · 110%"))
        shot("pages", "font-applied")
        application!!.recreate()
        waitFor(By.desc("我的"))
        assertEquals(AppFontFamily.NOTO_SANS_SC, readSettings().appFontFamily)
        assertEquals(110, readSettings().appFontScalePercent)
        scrollTo(By.text("字体与字号")).click()
        scrollTo(By.text("110%"))
        shot("pages", "font-restored")
    }

    @Test
    fun addEditorHasNoLegacySliderAndNewShortcutsUseDefaultWebZoom() {
        prepareProductionFixture()
        launchHome()
        waitFor(By.desc("添加")).click()
        val input = waitFor(By.clazz("android.widget.EditText"))
        input.text = "https://127.0.0.1:1/ios-cleanup-fixture"
        scrollTo(By.text("继续")).click()
        // Port 1 on loopback deterministically refuses metadata fetching; no public network fixture.
        topAction("添加", 15_000)
        application!!.onActivity {
            WindowCompat.getInsetsController(it.window, it.window.decorView).hide(WindowInsetsCompat.Type.ime())
        }
        scrollTo(By.text("网站信息"))
        shot("pages", "add-manual-editor-top")
        var reachedSave = false
        repeat(12) {
            assertFalse("Removed web-size slider is present", device.hasObject(By.clazz("android.widget.SeekBar")))
            assertFalse("Removed web-size section is present", device.hasObject(By.text("文字大小")))
            val save = device.findObject(By.text("添加到主屏幕").clazz("android.widget.Button"))
                ?: device.findObjects(By.text("添加到主屏幕")).lastOrNull()
            if (save != null && save.isClickable) reachedSave = true
            if (!reachedSave) swipeUp() else return@repeat
        }
        shot("pages", "add-manual-editor-bottom")
        // The top bar's Add action is fixed and remains available even if the bottom copy wraps.
        topAction("添加").click()
        waitFor(By.text(LEGACY_TITLE))
        val created = runBlocking { requireNotNull(database).webAppDao().observeAll().first() }.single { it.id != LEGACY_ID }
        assertEquals(100, created.textZoomPercent)
        assertEquals(125, readLegacy().textZoomPercent)
    }

    @Test
    fun legacyWebsiteZoomSurvivesRenameAndInterfaceTypographyChanges() {
        prepareProductionFixture()
        launchHome()
        waitFor(By.text(LEGACY_TITLE)).longClick()
        waitFor(By.text("重命名")).click()
        val renamed = "Legacy 125 renamed"
        waitFor(By.clazz("android.widget.EditText")).text = renamed
        waitFor(By.text("确定")).click()
        waitUntil("Rename was not saved") { readLegacy().title == renamed }
        assertEquals(125, readLegacy().textZoomPercent)
        runBlocking { settings.setAppTypography(AppFontFamily.SYSTEM, 130) }
        waitFor(By.text(renamed)).click()
        waitFor(By.text("夹具 · 第 1 页"), 12_000)
        var actualWebZoom: Int? = null
        application!!.onActivity { actualWebZoom = findWebView(it.window.decorView)?.settings?.textZoom }
        assertEquals("App typography must not replace a saved website zoom", 125, actualWebZoom)
        assertEquals(125, readLegacy().textZoomPercent)
        shot("pages", "legacy-web-zoom-125")
    }

    private fun prepareProductionFixture() = runBlocking {
        database = Room.databaseBuilder(context, WebShellDatabase::class.java, WebShellDatabase.NAME)
            .addMigrations(WebShellDatabase.MIGRATION_2_3).build()
        val dao = requireNotNull(database).webAppDao()
        originalApps = dao.observeAll().first()
        originalSettings = readSettings()
        originalApps!!.forEach { dao.deleteById(it.id) }
        dao.upsert(WebAppEntity(
            id = LEGACY_ID, title = LEGACY_TITLE, url = "https://appassets.androidplatform.net/assets/fixtures/spa/index.html",
            iconUrl = null, desktopMode = false, darkMode = false, keepAlive = false, isFavorite = false,
            homePage = 0, homeCellIndex = 0, folderId = null, createdAt = 0L, textZoomPercent = 125,
        ))
        settings.setAppTypography(AppFontFamily.MISANS, 100)
        settings.setThemeMode(THEME_MODE_LIGHT)
        settings.setGridColumns(4)
        settings.setGridRows(5)
        settings.setShowLabels(true)
        settings.setAutoArrangeHome(false)
        settings.setHomeScrollMode(SCROLL_MODE_PAGER)
        settings.setAllAppsEntryVisible(false)
        settings.setKeepAliveServiceEnabled(false)
    }

    private fun launchHome() {
        application = ActivityScenario.launch(MainActivity::class.java)
        waitFor(By.text(LEGACY_TITLE))
    }

    private fun readSettings() = runBlocking { settings.settings.first() }
    private fun readLegacy() = runBlocking { requireNotNull(database).webAppDao().getById(LEGACY_ID)!! }
    private fun waitFor(selector: BySelector, timeout: Long = 7_000): UiObject2 =
        device.wait(Until.findObject(selector), timeout) ?: throw AssertionError("Missing node: $selector")

    private fun findVisible(selector: BySelector): UiObject2? =
        device.findObjects(selector).firstOrNull { node ->
            val bounds = node.visibleBounds
            bounds.width() > 0 && bounds.height() > 0 &&
                bounds.left < device.displayWidth && bounds.right > 0 &&
                bounds.top < device.displayHeight && bounds.bottom > 0
        }

    private fun scrollTo(selector: BySelector): UiObject2 {
        // Let an AnimatedContent destination finish before selecting a scroll container. The
        // outgoing screen can otherwise remain in accessibility long enough to steal a gesture.
        SystemClock.sleep(350)
        for (towardEnd in listOf(true, false)) {
            repeat(12) {
                // Compose exposes the complete verticalScroll subtree to UiAutomator even when
                // a node is below the viewport. Returning that node makes click() land on the
                // Dock or another covered surface, which is especially easy to hit on the font
                // settings page. Only return after the target has visible screen bounds.
                findVisible(selector)?.let { return it }
                scrollWithinVisibleContent(towardEnd)
            }
        }
        val hierarchy = File(evidenceDirectory("pages"), "unreachable-node.xml")
        device.dumpWindowHierarchy(hierarchy)
        preserveEvidence(hierarchy, "pages")
        shot("pages", "unreachable-node")
        throw AssertionError("Unreachable scrolling node: $selector")
    }

    private fun swipeUp() = scrollWithinVisibleContent(towardEnd = true)

    private fun scrollWithinVisibleContent(towardEnd: Boolean) {
        val scroll = device.findObjects(By.scrollable(true)).firstOrNull {
            it.className != "android.widget.EditText" && it.visibleBounds.height() > device.displayHeight / 5
        }
        val bounds = scroll?.visibleBounds
        val x = bounds?.centerX() ?: (device.displayWidth / 2)
        val top = bounds?.let { it.top + it.height() / 4 } ?: (device.displayHeight / 3)
        val bottom = bounds?.let { it.bottom - it.height() / 4 } ?: (device.displayHeight * 3 / 4)
        device.swipe(x, if (towardEnd) bottom else top, x, if (towardEnd) top else bottom, 24)
        SystemClock.sleep(250)
    }

    private fun topAction(label: String, timeout: Long = 7_000): UiObject2 {
        val deadline = SystemClock.uptimeMillis() + timeout
        while (SystemClock.uptimeMillis() < deadline) {
            device.findObjects(By.text(label)).firstOrNull {
                it.visibleBounds.bottom > 0 && it.visibleBounds.centerY() < device.displayHeight / 3
            }?.let { return it }
            SystemClock.sleep(100)
        }
        throw AssertionError("Missing fixed top action: $label")
    }

    private fun waitUntil(message: String, condition: () -> Boolean) {
        val until = SystemClock.uptimeMillis() + 8_000
        while (SystemClock.uptimeMillis() < until) {
            if (condition()) return
            SystemClock.sleep(100)
        }
        assertTrue(message, condition())
    }

    private fun evidenceDirectory(group: String): File =
        File(requireNotNull(context.getExternalFilesDir(null)), "ios15/$group").apply { mkdirs() }

    private fun captureOverlayIfPresent(id: String) {
        val trigger = when (id) {
            "home.folder", "home.menu", "home.blank-menu", "home.rename", "home.icon-editor", "home.delete" ->
                context.getString(com.webshell.feature.home.R.string.home_catalog_show)
            "design.confirm-dialog" -> context.getString(com.webshell.core.designsystem.R.string.catalog_open_dialog)
            "design.context-menu" -> context.getString(com.webshell.core.designsystem.R.string.catalog_open_menu)
            "design.sheet" -> context.getString(com.webshell.core.designsystem.R.string.catalog_open_sheet)
            "browser.security" -> context.getString(com.webshell.feature.browser.R.string.browser_ssl_title)
            else -> return
        }
        scrollTo(By.text(trigger)).click()
        when (id) {
            "home.folder" -> waitFor(By.text(context.getString(com.webshell.feature.home.R.string.home_folder_dissolve)))
            "home.menu" -> waitFor(By.text(context.getString(com.webshell.feature.home.R.string.home_open)))
            "home.blank-menu" -> waitFor(By.text(context.getString(com.webshell.feature.home.R.string.home_edit_mode)))
            "home.rename", "home.icon-editor", "home.delete" ->
                waitFor(By.text(context.getString(com.webshell.feature.home.R.string.home_cancel)))
            "design.confirm-dialog" ->
                waitFor(By.text(context.getString(com.webshell.core.designsystem.R.string.catalog_cancel)))
            "design.context-menu" ->
                waitFor(By.text(context.getString(com.webshell.core.designsystem.R.string.catalog_delete)))
            "design.sheet" ->
                waitFor(By.text(context.getString(com.webshell.core.designsystem.R.string.catalog_confirm)))
        }
        shot("catalog", "$id.open")
        device.pressBack()
    }

    private fun shot(group: String, name: String) {
        require(group.matches(Regex("[a-z]+")) && name.matches(Regex("[a-z0-9.-]+")))
        SystemClock.sleep(350)
        val file = File(evidenceDirectory(group), "$name.png")
        assertTrue("Screenshot failed: $name", device.takeScreenshot(file))
        val size = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, size)
        assertEquals(device.displayWidth, size.outWidth)
        assertEquals(device.displayHeight, size.outHeight)
        preserveEvidence(file, group)
    }

    private fun preserveEvidence(file: File, group: String) {
        val target = "/sdcard/Download/webshell-ios15/$group"
        // UiAutomation passes simple argv; shell quoting/&& are not interpreted. Both paths
        // are generated from the package directory and tightly validated test IDs (no spaces).
        val destination = "$target/${file.name}"
        require(file.absolutePath.matches(Regex("[a-zA-Z0-9_./-]+")))
        require(destination.matches(Regex("[a-zA-Z0-9_./-]+")))
        device.executeShellCommand("mkdir -p $target")
        device.executeShellCommand("cp ${file.absolutePath} $destination")
        val size = device.executeShellCommand("stat -c %s $destination").trim().toLongOrNull()
        assertEquals("Evidence copy size differs: ${file.name}", file.length(), size ?: -1L)
    }

    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (index in 0 until view.childCount) findWebView(view.getChildAt(index))?.let { return it }
        return null
    }

    private companion object {
        const val LEGACY_ID = "ios15-legacy-zoom"
        const val LEGACY_TITLE = "Legacy 125"
    }
}
