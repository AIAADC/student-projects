package com.webshell.core.designsystem.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.webshell.core.designsystem.theme.LocalIsDarkTheme

/** System-green switch with a constant-size white thumb, retaining native Compose semantics. */
@Composable
fun AppSwitch(
    checked: Boolean,
    onCheckedChange: ((Boolean) -> Unit)?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val offTrack = if (LocalIsDarkTheme.current) Color(0xFF39393D) else Color(0xFFE9E9EA)
    Switch(
        checked = checked,
        onCheckedChange = onCheckedChange,
        modifier = modifier,
        enabled = enabled,
        // A non-null thumb slot keeps the thumb's dimensions consistent in both states.
        thumbContent = {},
        colors = SwitchDefaults.colors(
            checkedThumbColor = Color.White,
            checkedTrackColor = Color(0xFF34C759),
            checkedBorderColor = Color.Transparent,
            uncheckedThumbColor = Color.White,
            uncheckedTrackColor = offTrack,
            uncheckedBorderColor = Color.Transparent,
            disabledCheckedTrackColor = Color(0xFF34C759).copy(alpha = 0.42f),
            disabledUncheckedTrackColor = offTrack.copy(alpha = 0.6f),
            disabledUncheckedThumbColor = MaterialTheme.colorScheme.surfaceContainerLow,
            disabledUncheckedBorderColor = Color.Transparent,
            disabledCheckedBorderColor = Color.Transparent,
        ),
    )
}
