package com.webshell.core.designsystem.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.theme.AppSpacing

/**
 * iOS inset-grouped row with an optional 30dp colored glyph tile.
 * - 单行 ≥56dp、双行 ≥72dp；
 * - Dynamic Type may expand title/subtitle; touch targets never shrink with the text;
 * - trailing 槽放开关/箭头/文字。
 */
@Composable
fun AppListRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    leadingIcon: ImageVector? = null,
    onClick: (() -> Unit)? = null,
    leadingIconTint: Color? = null,
    leadingIconBackground: Color? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = if (subtitle == null) 56.dp else 72.dp)
            .then(onClick?.let { Modifier.clickable(onClick = it) } ?: Modifier)
            .padding(horizontal = AppSpacing.lg, vertical = if (subtitle == null) 4.dp else 8.dp),
    ) {
        if (leadingIcon != null) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier
                    .size(30.dp)
                    .clip(RoundedCornerShape(7.dp))
                    .then(leadingIconBackground?.let { Modifier.background(it) } ?: Modifier),
            ) {
                Icon(
                    leadingIcon,
                    contentDescription = null,
                    tint = leadingIconTint ?: if (leadingIconBackground != null) {
                        Color.White
                    } else {
                        MaterialTheme.colorScheme.onSurfaceVariant
                    },
                    modifier = Modifier.size(21.dp),
                )
            }
            Spacer(Modifier.width(AppSpacing.md))
        }
        Column(Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (subtitle != null) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (trailing != null) {
            Spacer(Modifier.width(AppSpacing.md))
            // An unconstrained trailing value must not measure away the row's title at 320dp.
            Box(Modifier.widthIn(max = 112.dp), contentAlignment = Alignment.CenterEnd) {
                trailing()
            }
        }
    }
}

/** Inset hairline aligned with the text (16dp inset + 30dp tile + 12dp gap). */
@Composable
fun AppListDivider(hasLeadingIcon: Boolean = true) {
    HorizontalDivider(
        modifier = Modifier.padding(start = if (hasLeadingIcon) 58.dp else AppSpacing.lg),
        thickness = 0.5.dp,
        color = MaterialTheme.colorScheme.outline.copy(alpha = 0.55f),
    )
}
