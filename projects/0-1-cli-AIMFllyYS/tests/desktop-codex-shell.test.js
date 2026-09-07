const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.join(...file.split('/')), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(...file.split('/')));
}

test('desktop renderer is split into codex shell modules instead of a monolithic App', () => {
  const expected = [
    'desktop/src/renderer/codex-shell/CodexShell.tsx',
    'desktop/src/renderer/codex-shell/SessionRail.tsx',
    'desktop/src/renderer/codex-shell/ConversationView.tsx',
    'desktop/src/renderer/codex-shell/MessageList.tsx',
    'desktop/src/renderer/codex-shell/Composer.tsx',
    'desktop/src/renderer/codex-shell/ActivityStrip.tsx',
    'desktop/src/renderer/codex-shell/useConversationState.ts',
    'desktop/src/renderer/codex-shell/types.ts',
  ];

  expected.forEach((file) => assert.equal(exists(file), true, `${file} missing`));

  const app = read('desktop/src/renderer/App.tsx');
  assert.match(app, /CodexShell/);
  assert.ok(app.split(/\r?\n/).length < 40, 'App.tsx should stay as a thin mount file');
  assert.doesNotMatch(app, /desktopActions|InstallPanel|ClearPanel|SettingsPanel/);

  const shell = read('desktop/src/renderer/codex-shell/CodexShell.tsx');
  assert.ok(shell.split(/\r?\n/).length < 90, 'CodexShell.tsx should stay as a thin composition file');
  assert.doesNotMatch(shell, /InspectorPane|useInspectorState|listInstallTargets|scanClearProcesses|getLatestRelease|sendAiMessage/);
});

test('desktop shell includes multi-session rail, rich conversation area, and codex-like composer hooks', () => {
  const shell = read('desktop/src/renderer/codex-shell/CodexShell.tsx');
  const conversation = read('desktop/src/renderer/codex-shell/ConversationView.tsx');
  const composer = read('desktop/src/renderer/codex-shell/Composer.tsx');
  const styles = read('desktop/src/renderer/styles.css');

  assert.match(shell, /SessionRail/);
  assert.match(shell, /ConversationView/);
  assert.doesNotMatch(shell, /InspectorPane|useInspectorState/);
  assert.match(conversation, /MessageList/);
  assert.match(conversation, /ActivityStrip/);
  assert.match(composer, /textarea/);
  assert.match(composer, /onSend/);
  assert.match(styles, /\.codexShell/);
  assert.match(styles, /\.sessionRail/);
  assert.match(styles, /\.messageList/);
  assert.match(styles, /\.composerTextarea/);
  assert.match(styles, /grid-template-columns:\s*280px minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(styles, /\.inspectorPane|\.outputPanel|grid-template-columns:\s*248px minmax\(520px,\s*1fr\) 356px/);
  assert.doesNotMatch(styles, /background-size:\s*28px 28px/);
});

test('desktop renderer omits automation and native action inspector from the primary shell', () => {
  const shell = read('desktop/src/renderer/codex-shell/CodexShell.tsx');
  const conversationState = read('desktop/src/renderer/codex-shell/useConversationState.ts');
  const styles = read('desktop/src/renderer/styles.css');

  assert.doesNotMatch(shell, /InspectorPane|useInspectorState/);
  // The old three-region inspector / output panel must stay out of the primary
  // shell. The new clickable "0-1 CLI" command panel is intentionally allowed
  // (it now lives in the rail + a dedicated CommandPanel modal), so .commandCard
  // is no longer forbidden.
  assert.doesNotMatch(styles, /\.inspectorPane\b|\.outputPanel\b|\.releaseAsset\b/);
  assert.doesNotMatch(shell + conversationState + styles, /automation|plugins|release controls|downloadable assets|Desktop release|Settings/i);
});

test('desktop message list renders a bounded recent window for smoother long chats', () => {
  const messageList = read('desktop/src/renderer/codex-shell/MessageList.tsx');

  assert.match(messageList, /VISIBLE_MESSAGE_LIMIT\s*=\s*80/);
  assert.match(messageList, /props\.messages\.slice\(-VISIBLE_MESSAGE_LIMIT\)/);
  assert.match(messageList, /React\.memo/);
});

test('desktop exposes embedded ai message ipc without raw renderer shell access', () => {
  const main = read('desktop/src/main/main.ts');
  const preload = read('desktop/src/preload/index.ts');
  const aiSession = read('desktop/src/main/ai-session.ts');

  assert.match(main, /ai:message/);
  assert.match(preload, /sendAiMessage/);
  assert.match(aiSession, /sendDesktopAiMessage/);
  assert.match(aiSession, /runAgentTurn|chatCompleteMessage/);
  assert.match(aiSession, /buildSystemPrompt/);
  assert.match(aiSession, /systemPrompt/);
  assert.doesNotMatch(preload, /sendAiMessage[\s\S]*validateDesktopCommand/);
  assert.doesNotMatch(aiSession, /shell:\s*true/);
});

test('desktop ai session owns conversation history and maps agent events to activity', () => {
  const aiSession = read('desktop/src/main/ai-session.ts');
  const conversationState = read('desktop/src/renderer/codex-shell/useConversationState.ts');

  assert.match(aiSession, /desktopAiSessions\s*=\s*new Map/);
  assert.match(aiSession, /getDesktopAiSession/);
  assert.match(aiSession, /appendDesktopUserMessage/);
  assert.match(aiSession, /onEvent:\s*\(event\)/);
  assert.match(aiSession, /activityFromAgentEvents/);
  assert.match(aiSession, /session\.messages/);
  assert.match(aiSession, /session\.activity/);
  assert.doesNotMatch(aiSession, /const turnMessages:[\s\S]*safeMessages\(request\.messages, request\.text\)/);
  assert.doesNotMatch(conversationState, /messages:\s*\[\.\.\.messages/);
});

// ---------------------------------------------------------------------------
// New-design coverage (Claude-style redesign): command panel, live agent
// timeline, file diff view, streaming markdown, real sessions, palette tokens.
// ---------------------------------------------------------------------------

test('desktop left rail exposes a clickable 0-1 CLI command panel built from the action catalog', () => {
  const rail = read('desktop/src/renderer/codex-shell/SessionRail.tsx');
  const styles = read('desktop/src/renderer/styles.css');

  // Command cards are generated from the shared action catalog, not hand-coded.
  assert.match(rail, /from '\.\.\/action-catalog'/);
  assert.match(rail, /desktopActions\.map/);
  assert.match(rail, /commandCard/);
  assert.match(rail, /CommandPanel/);
  // Mono `hi --xxx` command label + sans title + description per card.
  assert.match(rail, /commandCardCmd/);
  assert.match(rail, /commandCardTitle/);
  assert.match(rail, /commandCardDesc/);
  // Hover shadow + accent border + running status styling.
  assert.match(styles, /\.commandCard:hover[\s\S]*box-shadow/);
  assert.match(styles, /\.commandCard:hover[\s\S]*var\(--accent\)/);
});

test('desktop command panel reuses the inspector IPC logic with explicit confirmation gating', () => {
  const panel = read('desktop/src/renderer/codex-shell/CommandPanel.tsx');

  // Reuses the existing inspector state hook rather than rewriting IPC wiring.
  assert.match(panel, /useInspectorState/);
  // Native panels (install/skills/clear) reuse the inspector handlers.
  assert.match(panel, /onRunInstall/);
  assert.match(panel, /onRunSkillInstall/);
  assert.match(panel, /onKillClear/);
  // SAFETY: an explicit confirm step gates destructive native actions.
  assert.match(panel, /ConfirmButton/);
  assert.match(panel, /confirming/);
  // SAFETY: no raw shell / readline driven from the renderer panel.
  assert.doesNotMatch(panel, /shell:\s*true|readline|child_process/);
});

test('desktop conversation renders a live agent orchestration timeline instead of static chips', () => {
  const timeline = read('desktop/src/renderer/codex-shell/AgentTimeline.tsx');
  const conversationState = read('desktop/src/renderer/codex-shell/useConversationState.ts');
  const styles = read('desktop/src/renderer/styles.css');

  // One row per tool_start -> tool_result, with a status icon + collapsible body.
  assert.match(timeline, /ToolActivityRow/);
  assert.match(timeline, /StatusIcon/);
  assert.match(timeline, /SubagentTimeline/);
  // Reserved subagent colors are used for concurrent delegation lanes.
  assert.match(timeline, /SUBAGENT_COLORS/);
  // The renderer subscribes to the live agent-event stream.
  assert.match(conversationState, /onAiEvent/);
  assert.match(conversationState, /tool_start/);
  assert.match(conversationState, /tool_result/);
  assert.match(conversationState, /permission_required/);
  assert.match(conversationState, /plan_approval_required/);
  assert.match(styles, /\.agentTimeline/);
  assert.match(styles, /\.activityRow/);
  assert.match(styles, /\.subagentLane/);
});

test('desktop renders write/edit tool results as a Claude-style file diff card', () => {
  const diff = read('desktop/src/renderer/codex-shell/FileChange.tsx');
  const styles = read('desktop/src/renderer/styles.css');

  // File path header, operation badge, +added/-removed counts.
  assert.match(diff, /fileChangePath/);
  assert.match(diff, /fileChangeBadge/);
  assert.match(diff, /fileChangeCounts/);
  // Per-line diff grid: marker + right-aligned line number + code.
  assert.match(diff, /diffGrid/);
  assert.match(diff, /diffMarker/);
  assert.match(diff, /diffLineNo/);
  assert.match(diff, /diffCode/);
  // Full-row tints from the diff palette.
  assert.match(styles, /\.diffAdded\s*\{[\s\S]*var\(--diff-added-bg\)/);
  assert.match(styles, /\.diffRemoved\s*\{[\s\S]*var\(--diff-removed-bg\)/);
  // Mono + horizontal scroll, no wrap.
  assert.match(styles, /\.diffGrid[\s\S]*overflow-x:\s*auto/);
  assert.match(styles, /\.diffRow[\s\S]*white-space:\s*pre/);
});

test('desktop conversation streams assistant messages through a real markdown renderer', () => {
  const messageList = read('desktop/src/renderer/codex-shell/MessageList.tsx');
  const styles = read('desktop/src/renderer/styles.css');

  // Real markdown renderer with GFM + syntax highlighting, not a hand-rolled splitter.
  assert.match(messageList, /react-markdown/);
  assert.match(messageList, /remark-gfm/);
  assert.match(messageList, /rehype-highlight/);
  assert.doesNotMatch(messageList, /renderMarkdown|renderInline/);
  // Blinking caret + shimmering streaming label.
  assert.match(messageList, /streaming/);
  assert.match(messageList, /streamCaret/);
  assert.match(styles, /\.streamCaret/);
  assert.match(styles, /\.streamingLabel/);
});

test('desktop sessions are backed by real sendAiMessage state without seed mocks', () => {
  const conversationState = read('desktop/src/renderer/codex-shell/useConversationState.ts');

  // SAFETY/contract: real ai bridge call is present.
  assert.match(conversationState, /sendAiMessage\(/);
  // Fake seed mocks from the old design are gone.
  assert.doesNotMatch(conversationState, /START_SESSIONS|START_MESSAGES|START_ACTIVITY/);
});

test('desktop styles define the Claude design palette as CSS custom properties', () => {
  const styles = read('desktop/src/renderer/styles.css');

  // Brand + accent + mode + semantic + surface + diff tokens, exact hexes.
  assert.match(styles, /--brand:\s*#d77757/);
  assert.match(styles, /--brand-shimmer:\s*#eb9f7f/);
  assert.match(styles, /--accent:\s*#b1b9f9/);
  assert.match(styles, /--mode-plan:\s*#48968c/);
  assert.match(styles, /--mode-auto:\s*#af87ff/);
  assert.match(styles, /--success:\s*#4eba65/);
  assert.match(styles, /--error:\s*#ff6b80/);
  assert.match(styles, /--bg-app:\s*#1a1a1a/);
  assert.match(styles, /--bg-rail:\s*#1e1e1e/);
  assert.match(styles, /--bg-input:\s*#202020/);
  assert.match(styles, /--diff-added-bg:\s*#225c2b/);
  assert.match(styles, /--diff-removed-bg:\s*#7a2936/);
  // The old cyan accent and white-brand surfaces are removed.
  assert.doesNotMatch(styles, /#7dd3fc/i);
  assert.doesNotMatch(styles, /#f4f4f5|#e7edf5/i);
});
