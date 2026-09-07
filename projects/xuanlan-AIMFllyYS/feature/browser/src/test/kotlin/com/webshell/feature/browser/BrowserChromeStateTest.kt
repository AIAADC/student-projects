package com.webshell.feature.browser

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BrowserChromeStateTest {
    private val browsing = BrowserChromeState(
        visible = true, activeSessionId = "browser-a", activeUrl = "https://a.example",
    )

    @Test fun enteringPageCollapsesStraightToOrbWithoutScroll() {
        val entered = reduceBrowserChrome(
            BrowserChromeState(visible = true),
            BrowserChromeEvent.Environment(true, "browser-a", "https://a.example", true, false),
        )
        assertEquals(BottomChromeMode.Orb, entered.bottomMode)
        assertTrue(entered.toolbarVisible)
    }

    @Test fun switchingTabsOrNavigatingRecollapses() {
        val revealed = browsing.copy(bottomMode = BottomChromeMode.Expanded)
        val otherTab = reduceBrowserChrome(
            revealed,
            BrowserChromeEvent.Environment(true, "browser-b", "https://b.example", true, false),
        )
        assertEquals(BottomChromeMode.Orb, otherTab.bottomMode)
        val navigated = reduceBrowserChrome(
            revealed,
            BrowserChromeEvent.Environment(true, "browser-a", "https://a.example/next", true, false),
        )
        assertEquals(BottomChromeMode.Orb, navigated.bottomMode)
    }

    @Test fun unchangedEnvironmentKeepsDeliberateReveal() {
        val revealed = reduceBrowserChrome(
            browsing.copy(bottomMode = BottomChromeMode.Orb), BrowserChromeEvent.Reveal,
        )
        assertEquals(BottomChromeMode.Expanded, revealed.bottomMode)
        val repeated = reduceBrowserChrome(
            revealed,
            BrowserChromeEvent.Environment(true, "browser-a", "https://a.example", true, false),
        )
        assertEquals(BottomChromeMode.Expanded, repeated.bottomMode)
    }

    @Test fun blockedInteractionDoesNotPreventEntryCollapse() {
        val blocked = reduceBrowserChrome(
            BrowserChromeState(visible = true, interactionBlocked = true),
            BrowserChromeEvent.Environment(true, "browser-a", "https://a.example", true, true),
        )
        assertEquals(BottomChromeMode.Orb, blocked.bottomMode)
        assertTrue(blocked.interactionBlocked)
    }

    @Test fun disabledAutoCollapseKeepsEntryExpandedButAllowsManualCollapse() {
        val entered = reduceBrowserChrome(
            BrowserChromeState(visible = true),
            BrowserChromeEvent.Environment(true, "browser-a", "https://a.example", false, false),
        )
        assertEquals(BottomChromeMode.Expanded, entered.bottomMode)
        assertEquals(BottomChromeMode.Orb, reduceBrowserChrome(entered, BrowserChromeEvent.Collapse).bottomMode)
    }

    @Test fun enablingAutoCollapseWhileBrowsingCollapses() {
        val manual = browsing.copy(autoCollapse = false, bottomMode = BottomChromeMode.Expanded)
        val enabled = reduceBrowserChrome(
            manual,
            BrowserChromeEvent.Environment(true, "browser-a", "https://a.example", true, false),
        )
        assertEquals(BottomChromeMode.Orb, enabled.bottomMode)
    }

    @Test fun orbCanParkAndBothShapesRevealToolbarWithoutKeyboardState() {
        val collapsed = reduceBrowserChrome(browsing.copy(toolbarVisible = false), BrowserChromeEvent.Collapse)
        val parked = reduceBrowserChrome(collapsed, BrowserChromeEvent.Park)
        assertEquals(BottomChromeMode.Edge, parked.bottomMode)
        listOf(collapsed, parked).forEach {
            val restored = reduceBrowserChrome(it, BrowserChromeEvent.Reveal)
            assertEquals(BottomChromeMode.Expanded, restored.bottomMode)
            assertTrue(restored.toolbarVisible)
            assertFalse(restored.interactionBlocked)
        }
        assertEquals(browsing, reduceBrowserChrome(browsing, BrowserChromeEvent.Park))
    }

    @Test fun hidingTopDoesNotAffectBottomOrRestoreOnUnchangedEnvironment() {
        val hidden = reduceBrowserChrome(browsing, BrowserChromeEvent.HideToolbar)
        assertFalse(hidden.toolbarVisible)
        assertEquals(BottomChromeMode.Expanded, hidden.bottomMode)
        val repeated = reduceBrowserChrome(
            hidden,
            BrowserChromeEvent.Environment(true, "browser-a", "https://a.example", true, false),
        )
        assertFalse(repeated.toolbarVisible)
        assertEquals(BottomChromeMode.Expanded, repeated.bottomMode)
    }

    @Test fun leavingPreservesCollapsedShapeButDropsOverlay() {
        val state = browsing.copy(bottomMode = BottomChromeMode.Edge, toolbarVisible = false, overlay = BrowserOverlay.Menu)
        val hidden = reduceBrowserChrome(
            state,
            BrowserChromeEvent.Environment(false, "browser-a", "https://a.example", true, false),
        )
        assertEquals(BottomChromeMode.Edge, hidden.bottomMode)
        assertEquals(null, hidden.overlay)
        assertFalse(hidden.toolbarVisible)
    }

    @Test fun emptyOrDisablingAutomaticBehaviorRecoversReachableNavigation() {
        val state = browsing.copy(bottomMode = BottomChromeMode.Edge, toolbarVisible = false)
        val empty = reduceBrowserChrome(state, BrowserChromeEvent.Environment(true, null, null, true, false))
        assertEquals(BottomChromeMode.Expanded, empty.bottomMode)
        assertTrue(empty.toolbarVisible)
        val disabled = reduceBrowserChrome(
            state,
            BrowserChromeEvent.Environment(true, "browser-a", "https://a.example", false, false),
        )
        assertEquals(BottomChromeMode.Expanded, disabled.bottomMode)
    }

    @Test fun restoringPresentationDoesNotRestoreStaleSessionOrInteraction() {
        val restored = restoreChromePresentation("Edge", false)
        assertEquals(BottomChromeMode.Edge, restored.bottomMode)
        assertFalse(restored.toolbarVisible)
        assertEquals(null, restored.activeSessionId)
        assertEquals(null, restored.activeUrl)
        assertEquals(null, restored.overlay)
        assertFalse(restored.visible)
        assertFalse(restored.interactionBlocked)
    }

    @Test fun invalidSavedPresentationFallsBackToReachableControls() {
        assertEquals(BrowserChromeState(), restoreChromePresentation("removed-mode", false))
        assertEquals(BrowserChromeState(), restoreChromePresentation(null, null))
    }
}
