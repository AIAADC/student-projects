package com.webshell.core.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.MutablePreferences
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import com.webshell.core.model.AppFontFamily
import com.webshell.core.model.AppFontScale

private val Context.settingsStore by preferencesDataStore(name = "webshell_settings")

/** 主页外观与全局行为设置（DataStore Preferences） */
data class HomeSettings(
    val gridColumns: Int = 4,
    val gridRows: Int = 5,
    val iconCornerRadiusPercent: Int = 26,
    val iconSizeDp: Int = 60,
    val showLabels: Boolean = true,
    val showPageIndicator: Boolean = true,
    val keepAliveServiceEnabled: Boolean = true,
    val batteryWhitelistAcknowledged: Boolean = false,
    val themeMode: String = THEME_MODE_SYSTEM,
    val photoWallpaperPath: String? = null,
    val transitionStyle: String = TRANSITION_SLIDE,
    /**
     * 桌面自动整理：开启 = 图标压实排列（传统行为）；
     * 关闭（默认）= 自由摆放，图标拖到哪个网格位就停在哪个网格位（对齐主流安卓桌面）。
     */
    val autoArrangeHome: Boolean = false,
    /** 桌面滑动模式：左右翻页（默认）/ 上下滚动，见 SCROLL_MODE_* */
    val homeScrollMode: String = SCROLL_MODE_PAGER,
    /** 「全部应用」浮动入口是否显示 */
    val allAppsEntryVisible: Boolean = false,
    /**
     * 「全部应用」浮动入口位置：归一化到主屏内容区的 0..1 中心坐标比例，
     * 负值（默认）= 未拖动过，落在右下角默认位。
     */
    val allAppsEntryPosX: Float = -1f,
    val allAppsEntryPosY: Float = -1f,
    val appFontFamily: String = AppFontFamily.MISANS,
    val appFontScalePercent: Int = AppFontScale.DEFAULT,
    val browserAutoCollapse: Boolean = true,
    /** User-selected normalized center; -1 means the safe bottom-right default. */
    val browserOrbX: Float = -1f,
    val browserOrbY: Float = -1f,
)

/** 主题模式取值，见 docs/DESIGN.md */
const val THEME_MODE_SYSTEM = "system"
const val THEME_MODE_LIGHT = "light"
const val THEME_MODE_DARK = "dark"
const val THEME_MODE_PHOTO = "photo"

/** 页面切换动效取值，见 docs/DESIGN.md */
const val TRANSITION_SLIDE = "slide"
const val TRANSITION_FADE = "fade"
const val TRANSITION_SCALE = "scale"
const val TRANSITION_NONE = "none"

/** 桌面滑动模式取值：左右翻页（默认，现状行为）/ 上下滚动单列表 */
const val SCROLL_MODE_PAGER = "pager"
const val SCROLL_MODE_VERTICAL = "vertical"

@Singleton
class SettingsRepository @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private object Keys {
        val GRID_COLUMNS = intPreferencesKey("grid_columns")
        val GRID_ROWS = intPreferencesKey("grid_rows")
        val ICON_CORNER = intPreferencesKey("icon_corner_percent")
        val ICON_SIZE = intPreferencesKey("icon_size_dp")
        val SHOW_LABELS = booleanPreferencesKey("show_labels")
        val PAGE_INDICATOR = booleanPreferencesKey("page_indicator")
        val KEEP_ALIVE_SERVICE = booleanPreferencesKey("keep_alive_service")
        val BATTERY_ACK = booleanPreferencesKey("battery_whitelist_ack")
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val PHOTO_WALLPAPER = stringPreferencesKey("photo_wallpaper_path")
        val TRANSITION_STYLE = stringPreferencesKey("transition_style")
        val AUTO_ARRANGE_HOME = booleanPreferencesKey("auto_arrange_home")
        val HOME_SCROLL_MODE = stringPreferencesKey("home_scroll_mode")
        val ALL_APPS_ENTRY_VISIBLE = booleanPreferencesKey("all_apps_entry_visible")
        val ALL_APPS_ENTRY_X = floatPreferencesKey("all_apps_entry_x")
        val ALL_APPS_ENTRY_Y = floatPreferencesKey("all_apps_entry_y")
        val APP_FONT_FAMILY = stringPreferencesKey("app_font_family")
        val APP_FONT_SCALE = intPreferencesKey("app_font_scale_percent")
        val BROWSER_AUTO_COLLAPSE = booleanPreferencesKey("browser_auto_collapse")
        val BROWSER_ORB_X = floatPreferencesKey("browser_orb_x")
        val BROWSER_ORB_Y = floatPreferencesKey("browser_orb_y")
    }

    val settings: Flow<HomeSettings> = context.settingsStore.data.map { prefs ->
        val (fontFamily, fontScale) = readAppTypography(prefs)
        HomeSettings(
            gridColumns = prefs[Keys.GRID_COLUMNS] ?: 4,
            gridRows = prefs[Keys.GRID_ROWS] ?: 5,
            iconCornerRadiusPercent = prefs[Keys.ICON_CORNER] ?: 26,
            iconSizeDp = prefs[Keys.ICON_SIZE] ?: 60,
            showLabels = prefs[Keys.SHOW_LABELS] ?: true,
            showPageIndicator = prefs[Keys.PAGE_INDICATOR] ?: true,
            keepAliveServiceEnabled = prefs[Keys.KEEP_ALIVE_SERVICE] ?: true,
            batteryWhitelistAcknowledged = prefs[Keys.BATTERY_ACK] ?: false,
            themeMode = prefs[Keys.THEME_MODE] ?: THEME_MODE_SYSTEM,
            photoWallpaperPath = prefs[Keys.PHOTO_WALLPAPER],
            transitionStyle = prefs[Keys.TRANSITION_STYLE] ?: TRANSITION_SLIDE,
            autoArrangeHome = prefs[Keys.AUTO_ARRANGE_HOME] ?: false,
            homeScrollMode = prefs[Keys.HOME_SCROLL_MODE] ?: SCROLL_MODE_PAGER,
            allAppsEntryVisible = prefs[Keys.ALL_APPS_ENTRY_VISIBLE] ?: false,
            allAppsEntryPosX = prefs[Keys.ALL_APPS_ENTRY_X] ?: -1f,
            allAppsEntryPosY = prefs[Keys.ALL_APPS_ENTRY_Y] ?: -1f,
            appFontFamily = fontFamily,
            appFontScalePercent = fontScale,
            browserAutoCollapse = prefs[Keys.BROWSER_AUTO_COLLAPSE] ?: true,
            browserOrbX = normalizedOrbCoordinate(prefs[Keys.BROWSER_ORB_X]),
            browserOrbY = normalizedOrbCoordinate(prefs[Keys.BROWSER_ORB_Y]),
        )
    }

    suspend fun setGridColumns(value: Int) =
        context.settingsStore.edit { it[Keys.GRID_COLUMNS] = value.coerceIn(3, 6) }

    suspend fun setGridRows(value: Int) =
        context.settingsStore.edit { it[Keys.GRID_ROWS] = value.coerceIn(4, 7) }

    suspend fun setIconCornerRadiusPercent(value: Int) =
        context.settingsStore.edit { it[Keys.ICON_CORNER] = value.coerceIn(0, 50) }

    suspend fun setIconSizeDp(value: Int) =
        context.settingsStore.edit { it[Keys.ICON_SIZE] = value.coerceIn(44, 72) }

    suspend fun setShowLabels(value: Boolean) =
        context.settingsStore.edit { it[Keys.SHOW_LABELS] = value }

    suspend fun setShowPageIndicator(value: Boolean) =
        context.settingsStore.edit { it[Keys.PAGE_INDICATOR] = value }

    suspend fun setKeepAliveServiceEnabled(value: Boolean) =
        context.settingsStore.edit { it[Keys.KEEP_ALIVE_SERVICE] = value }

    suspend fun setBatteryWhitelistAcknowledged(value: Boolean) =
        context.settingsStore.edit { it[Keys.BATTERY_ACK] = value }

    suspend fun setThemeMode(value: String) =
        context.settingsStore.edit { it[Keys.THEME_MODE] = value }

    suspend fun setTransitionStyle(value: String) =
        context.settingsStore.edit { it[Keys.TRANSITION_STYLE] = value }

    suspend fun setAutoArrangeHome(value: Boolean) =
        context.settingsStore.edit { it[Keys.AUTO_ARRANGE_HOME] = value }

    // 块体返回 Unit：避免把 DataStore 的 Preferences 类型泄漏到调用方模块的编译类路径
    suspend fun setHomeScrollMode(value: String) {
        context.settingsStore.edit { it[Keys.HOME_SCROLL_MODE] = value }
    }

    suspend fun setAllAppsEntryVisible(value: Boolean) {
        context.settingsStore.edit { it[Keys.ALL_APPS_ENTRY_VISIBLE] = value }
    }

    /** 「全部应用」浮动入口位置：归一化 0..1 中心坐标，越界钳制后落库。 */
    suspend fun setAllAppsEntryPosition(x: Float, y: Float) {
        context.settingsStore.edit {
            it[Keys.ALL_APPS_ENTRY_X] = x.coerceIn(0f, 1f)
            it[Keys.ALL_APPS_ENTRY_Y] = y.coerceIn(0f, 1f)
        }
    }

    suspend fun setPhotoWallpaperPath(value: String?) =
        context.settingsStore.edit {
            if (value == null) it.remove(Keys.PHOTO_WALLPAPER) else it[Keys.PHOTO_WALLPAPER] = value
        }

    /** One atomic edit prevents a temporary mixed font/scale appearance during apply. */
    suspend fun setAppTypography(fontFamily: String, scalePercent: Int) {
        context.settingsStore.edit {
            writeAppTypography(it, fontFamily, scalePercent)
        }
    }

    suspend fun setBrowserAutoCollapse(enabled: Boolean) {
        context.settingsStore.edit { it[Keys.BROWSER_AUTO_COLLAPSE] = enabled }
    }

    suspend fun setBrowserOrbPosition(x: Float, y: Float) {
        context.settingsStore.edit {
            it[Keys.BROWSER_ORB_X] = normalizedOrbCoordinate(x)
            it[Keys.BROWSER_ORB_Y] = normalizedOrbCoordinate(y)
        }
    }

    internal companion object {
        /** Shared by persisted read/write paths and round-trip tests; key spelling stays in one place. */
        fun readAppTypography(prefs: Preferences): Pair<String, Int> =
            AppFontFamily.normalize(prefs[Keys.APP_FONT_FAMILY]) to
                AppFontScale.normalize(prefs[Keys.APP_FONT_SCALE])

        fun writeAppTypography(prefs: MutablePreferences, fontFamily: String, scalePercent: Int) {
            prefs[Keys.APP_FONT_FAMILY] = AppFontFamily.normalize(fontFamily)
            prefs[Keys.APP_FONT_SCALE] = AppFontScale.normalize(scalePercent)
        }
    }
}

internal fun normalizedOrbCoordinate(value: Float?): Float =
    value?.takeIf { it.isFinite() && it >= 0f }?.coerceIn(0f, 1f) ?: -1f
