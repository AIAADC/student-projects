package com.webshell.feature.browser

import android.Manifest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BrowserPermissionsTest {
    @Test fun webkitNamesMapToOnlyKnownRuntimePermissions() {
        assertEquals(Manifest.permission.CAMERA, permissionForWebResource("android.webkit.resource.VIDEO_CAPTURE"))
        assertEquals(Manifest.permission.RECORD_AUDIO, permissionForWebResource("android.webkit.resource.AUDIO_CAPTURE"))
        assertNull(permissionForWebResource("android.webkit.resource.PROTECTED_MEDIA_ID"))
        assertNull(permissionForWebResource("future.unknown.resource"))
    }
}
