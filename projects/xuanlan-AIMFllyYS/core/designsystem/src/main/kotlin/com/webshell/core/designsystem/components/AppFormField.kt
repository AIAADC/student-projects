package com.webshell.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.webshell.core.designsystem.R

/** Shared filled field. BasicTextField keeps selection/cursor behavior without M3's fixed inset. */
@Composable
fun AppFormField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String? = null,
    singleLine: Boolean = true,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    isError: Boolean = false,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    containerColor: Color = MaterialTheme.colorScheme.surfaceContainerHigh,
    textStyle: TextStyle = MaterialTheme.typography.bodyLarge,
    displayText: String? = null,
) {
    FormFieldLabel(label, if (label == null) Modifier else modifier) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = (if (label == null) modifier else Modifier).fillMaxWidth().fieldLabel(label ?: placeholder),
            enabled = enabled,
            readOnly = readOnly,
            singleLine = singleLine,
            textStyle = textStyle.copy(color = MaterialTheme.colorScheme.onSurface),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            decorationBox = { inner ->
                FieldDecoration(value.isEmpty(), placeholder, isError, containerColor, leadingIcon, trailingIcon, displayText, textStyle, inner)
            },
        )
    }
}

/** The address editor uses this overload to retain its cursor/selection across recompositions. */
@Composable
fun AppFormField(
    value: TextFieldValue,
    onValueChange: (TextFieldValue) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String? = null,
    singleLine: Boolean = true,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    isError: Boolean = false,
    leadingIcon: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    containerColor: Color = MaterialTheme.colorScheme.surfaceContainerHigh,
    textStyle: TextStyle = MaterialTheme.typography.bodyLarge,
    displayText: String? = null,
) {
    FormFieldLabel(label, if (label == null) Modifier else modifier) {
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = (if (label == null) modifier else Modifier).fillMaxWidth().fieldLabel(label ?: placeholder),
            enabled = enabled,
            readOnly = readOnly,
            singleLine = singleLine,
            textStyle = textStyle.copy(color = MaterialTheme.colorScheme.onSurface),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            decorationBox = { inner ->
                FieldDecoration(value.text.isEmpty(), placeholder, isError, containerColor, leadingIcon, trailingIcon, displayText, textStyle, inner)
            },
        )
    }
}

@Composable
private fun FormFieldLabel(label: String?, modifier: Modifier, content: @Composable () -> Unit) {
    if (label == null) content() else Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        content()
    }
}

private fun Modifier.fieldLabel(label: String?): Modifier =
    if (label.isNullOrBlank()) this else semantics { contentDescription = label }

@Composable
private fun FieldDecoration(
    empty: Boolean,
    placeholder: String?,
    isError: Boolean,
    containerColor: Color,
    leadingIcon: (@Composable () -> Unit)?,
    trailingIcon: (@Composable () -> Unit)?,
    displayText: String?,
    textStyle: TextStyle,
    inner: @Composable () -> Unit,
) {
    Row(
        modifier = Modifier
            .heightIn(min = 48.dp)
            .clip(MaterialTheme.shapes.medium)
            .background(containerColor)
            .then(if (isError) Modifier.border(1.dp, MaterialTheme.colorScheme.error, MaterialTheme.shapes.medium) else Modifier)
            .padding(start = 14.dp, end = if (trailingIcon == null) 14.dp else 0.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        leadingIcon?.invoke()
        Box(Modifier.weight(1f).padding(vertical = 12.dp).clipToBounds(), contentAlignment = Alignment.CenterStart) {
            if (displayText != null) {
                Text(displayText.ifEmpty { placeholder.orEmpty() }, style = textStyle, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.clearAndSetSemantics {},
                    color = if (displayText.isEmpty()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)
            } else if (empty && placeholder != null) {
                Text(placeholder, style = textStyle, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.clearAndSetSemantics {},
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Box(Modifier.alpha(if (displayText == null) 1f else 0f)) { inner() }
        }
        trailingIcon?.invoke()
    }
}

@Composable
fun AppSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
) {
    AppFormField(
        value = value,
        onValueChange = onValueChange,
        placeholder = placeholder,
        modifier = modifier,
        leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null) },
        trailingIcon = if (value.isNotEmpty()) ({
            IconButton(onClick = { onValueChange("") }) {
                Icon(Icons.Rounded.Close, stringResource(R.string.designsystem_clear))
            }
        }) else null,
    )
}
