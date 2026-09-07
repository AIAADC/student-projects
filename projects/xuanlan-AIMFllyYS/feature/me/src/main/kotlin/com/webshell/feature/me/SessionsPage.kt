package com.webshell.feature.me

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.webshell.core.designsystem.components.AppListDivider
import com.webshell.core.webengine.KeepAliveRegistry

/** 全部后台会话的统一管理页；行样式与设置首页的会话区块共享。 */
@Composable
internal fun SessionsPage(
    sessions: List<KeepAliveRegistry.Entry>,
    onStopSession: (String) -> Unit,
    onBack: () -> Unit,
) {
    DetailPage(title = stringResource(R.string.me_sessions), onBack = onBack) {
        SessionsContent(sessions = sessions, onStopSession = onStopSession)
    }
}

@Composable
internal fun SessionsContent(
    sessions: List<KeepAliveRegistry.Entry>,
    onStopSession: (String) -> Unit,
) {
    if (sessions.isEmpty()) {
        SessionEmptyRow()
    } else sessions.forEachIndexed { index, session ->
        SessionRow(session = session, onStop = { onStopSession(session.sessionId) })
        if (index < sessions.lastIndex) AppListDivider()
    }
}
