import * as readline from 'readline';
import chalk from 'chalk';
import { ChatMessage, ModelInfo, ToolCall } from '../types';
import { MODELS, DEFAULT_MODEL_ID, getSelectableModels, getModelById, isConfiguredModelId } from './models';
import { chatCompleteMessage, streamChat } from './provider';
import { webSearch } from './search';
import { executeTool, getSystemPrompt, isToolCommand } from './tools';
import { Spinner, printSuccess, printError, printInfo, printWarning, printDivider, StreamRenderer } from './renderer';
import { interactiveSelect } from '../utils/selector';
import { parseAiEnv, resolveEnvPath, writeAiSettings, maskApiKey, updateActiveModelId } from './config';
import { formatSlashMenu, parseSlashCommand, resolveModelCommand, formatModelInfo } from './commands';
import { createInterruptController, createPendingInputController, formatInterruptedMessage, DEFAULT_EXIT_CONFIRM_WINDOW_MS } from './interrupts';
import { isGlobalInterruptKey } from './keybindings';
import { getNextMode, preparePlanModeSession, resolveModeCommandAction, resolvePlanApprovalOutcome } from './modes';
import { AiSessionState, createSessionState, formatCurrentPlan, loadCurrentPlanFromWorkspace, recordCurrentPlan, setCurrentModel, setMode } from './session';
import { ActiveRuntimeSkill, discoverRuntimeSkills, formatSkillContextMessage, formatSkillList, loadRuntimeSkillContent, resolveSkillSelection, RuntimeSkill, trimMessagesPreservingSkillContext, upsertSkillContextMessage } from './skills';
import { createSubagentQueue, enqueueSubagent, cancelSubagent, formatSubagentList, resolveAgentCommand, runSubagentScheduler, setSubagentParentPermission, buildSubagentTimelineInput } from './agent/subagents';
import { SubagentQueue, SubagentTask } from './agent/types';
import { AgentTurnEvent, RunAgentTurnResult, runAgentTurn } from './agent/loop';
import { resolveAgentDefinition } from './agent/definitions';
import { createAiSubagentHandler } from './agent/runner';
import { renderAgentProgressEvent, renderPermissionBox, renderPlanApprovalPanel, renderStatusHeader, renderSubagentTimelineEntry, renderThinkingState, renderTimelineEntry } from './ui/layout';
import { SessionPermissionMemory } from './permissions/engine';
import { applyPermissionPromptChoice, formatPermissionDecision, formatPermissionPromptOptions, parsePermissionPromptChoice } from './permissions/prompts';
import { buildProviderToolSpecs } from './tools/registry';
import { promptWithSlashTypeahead } from './typeahead';

const AI_SESSION_EXIT = '__HI_AI_SESSION_EXIT__';

export interface StartChatOptions {
  modelId?: string;
  autoAccept?: boolean;
}

export async function startChat(options?: string | StartChatOptions): Promise<void> {
  const startOptions = typeof options === 'string' ? { modelId: options } : (options || {});
  const session = createSessionState({ modelId: startOptions.modelId || DEFAULT_MODEL_ID, autoAccept: startOptions.autoAccept });
  loadCurrentPlanFromWorkspace(session, process.cwd());
  session.subagents = createSubagentQueue({ parentPermissionMode: session.permissionMode });
  let currentModel = getModelById(session.currentModelId) || MODELS[0];
  const runtimeSkills = discoverRuntimeSkills();
  const activeSkills = (): ActiveRuntimeSkill[] => runtimeSkills
    .filter((skill) => session.activeSkillIds.includes(skill.id))
    .map((skill) => loadRuntimeSkillContent(skill));
  const buildSessionPrompt = (): string => getSystemPrompt({
    mode: session.mode,
    permissionMode: session.permissionMode,
    modelId: session.currentModelId,
    activeSkillNames: activeSkills().map((skill) => skill.name),
  });
  const syncSkillContext = (): void => upsertSkillContextMessage(messages, formatSkillContextMessage(activeSkills()));
  const messages: ChatMessage[] = [{ role: 'system', content: buildSessionPrompt() }];
  const permissionSession: SessionPermissionMemory = {};

  const pendingInput = createPendingInputController();
  const inputHistory: string[] = [];
  const ask = (): Promise<string> => pendingInput.wait((resolve) => {
    const promptAbort = new AbortController();
    activePromptAbort = promptAbort;
    promptWithSlashTypeahead({
      prompt: chalk.cyan('\n  ❯ '),
      mode: session.mode,
      signal: promptAbort.signal,
      history: inputHistory,
      onOverlayChange: (active) => {
        session.inSubmenu = active;
      },
    }).then((value) => {
      if (activePromptAbort === promptAbort) activePromptAbort = null;
      resolve(value);
    });
  });
  const askPrompt = async (prompt: string): Promise<string> => {
    // A short-lived readline interface handles modal line questions (settings, permission choices).
    // No persistent interface stays attached to stdin, so the raw-mode prompt above never fights a
    // hidden readline line-editor on Up/Down (which previously made the whole prompt reflow).
    const answer = await pendingInput.wait((resolve) => {
      const lineReader = readline.createInterface({ input: process.stdin, output: process.stdout });
      lineReader.question(prompt, (value) => {
        lineReader.close();
        resolve(value);
      });
    });
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    if (shouldExit) throw new Error(AI_SESSION_EXIT);
    return answer;
  };
  const interruptController = createInterruptController({ confirmWindowMs: DEFAULT_EXIT_CONFIRM_WINDOW_MS });
  let foregroundBusy = false;
  let shouldExit = false;
  let activeCancel: (() => void) | null = null;
  let activePromptAbort: AbortController | null = null;
  let subagentCancel: (() => void) | null = null;
  let subagentWorkerActive = false;
  let queuedInput: string | null = null;
  const hasActiveWork = (): boolean => foregroundBusy || Boolean(subagentCancel);
  const cycleMode = () => {
    setMode(session, getNextMode(session));
    setSubagentParentPermission(session.subagents!, session.permissionMode);
    messages[0] = { role: 'system', content: buildSessionPrompt() };
    syncSkillContext();
    printSuccess(`已切换到 ${session.mode} 模式`);
  };
  const handleInterrupt = (source: 'Ctrl+C' | 'Esc') => {
    const result = interruptController.handle({ running: hasActiveWork(), inSubmenu: session.inSubmenu });
    if (result.action === 'back') {
      session.inSubmenu = false;
      return;
    }
    if (result.action === 'cancel-running') {
      if (foregroundBusy) {
        activeCancel?.();
        activeCancel = null;
        foregroundBusy = false;
      } else if (subagentCancel) {
        subagentCancel();
        subagentCancel = null;
      } else {
        foregroundBusy = false;
      }
      printWarning(formatInterruptedMessage());
      return;
    }
    if (result.action === 'exit') {
      shouldExit = true;
      activePromptAbort?.abort();
      activePromptAbort = null;
      pendingInput.resolveOnExit();
      return;
    }
    printWarning(`再次按 ${source} 退出 AI 会话`);
  };
  const onSigint = () => {
    handleInterrupt('Ctrl+C');
  };
  const onKeypress = (_str: string | undefined, key: readline.Key) => {
    if ((key?.name === 'tab' && key.shift) || (key?.name === 'm' && key.meta)) {
      cycleMode();
      return;
    }
    if (!isGlobalInterruptKey(_str, key || {})) return;
    handleInterrupt(key?.ctrl && key.name === 'c' ? 'Ctrl+C' : 'Esc');
  };
  const wasRaw = process.stdin.isRaw;
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.on('SIGINT', onSigint);
  process.stdin.on('keypress', onKeypress);
  const runSearch = async (query: string, searchMessages: ChatMessage[], model: ModelInfo): Promise<void> => {
    const searchAbort = new AbortController();
    foregroundBusy = true;
    activeCancel = () => searchAbort.abort();
    try {
      await doSearch(query, searchMessages, model, searchAbort.signal, (cancel) => {
        activeCancel = cancel;
      });
    } finally {
      activeCancel = null;
      foregroundBusy = false;
    }
  };
  const hooks: RuntimeHooks = {
    askLine: askPrompt,
    runSearch,
    runtimeSkills,
    syncSkillContext,
    subagents: session.subagents,
    permissionSession,
    isSubagentWorkerActive: () => subagentWorkerActive,
    setSubagentWorkerActive: (active) => {
      subagentWorkerActive = active;
    },
    setSubagentActiveWork: (cancel) => {
      subagentCancel = cancel;
    },
  };

  console.log(renderStatusHeader({
    project: process.cwd().split(/[\\/]/).pop() || 'workspace',
    mode: session.mode,
    permissionMode: session.permissionMode,
    model: currentModel.name,
    activeSkills: session.activeSkillIds.length,
    runningSubagents: session.subagents.items.filter((item) => item.status === 'running').length,
  }));
  printInfo('输入问题开始对话，输入 /help 查看命令');
  printDivider();

  try {
  while (!shouldExit) {
    const rawInput = queuedInput ?? await ask();
    queuedInput = null;
    const input = rawInput.trim();
    if (!input) continue;
    if (inputHistory[inputHistory.length - 1] !== input) inputHistory.push(input);

    // === Slash Commands ===
    if (input.startsWith('/')) {
      const handled = await handleCommand(input, currentModel, messages, session, hooks);
      if (handled === 'exit') break;
      if (handled instanceof Object && 'model' in handled) {
        currentModel = handled.model;
        setCurrentModel(session, currentModel.id);
        messages[0] = { role: 'system', content: buildSessionPrompt() };
        syncSkillContext();
      }
      if (handled instanceof Object && 'nextInput' in handled) {
        queuedInput = handled.nextInput;
      }
      continue;
    }

    // === Direct Tool Commands ===
    if (isToolCommand(input)) {
      console.log(renderTimelineEntry({ kind: 'tool', status: 'running', label: input.split(/\s+/)[0], detail: input }));
      foregroundBusy = true;
      let result = '';
      try {
        result = await executeTool(input);
      } finally {
        foregroundBusy = false;
      }
      console.log(renderTimelineEntry({ kind: 'tool', status: result.startsWith('Error:') ? 'failed' : 'completed', label: input.split(/\s+/)[0], detail: input }));
      console.log(chalk.gray('\n  ┌── 工具结果 ──'));
      result.split('\n').forEach(l => console.log(chalk.gray('  │ ') + chalk.white(l)));
      console.log(chalk.gray('  └' + '─'.repeat(40)));
      continue;
    }

    // === Web Search (prefix: search / 搜索) ===
    if (/^(search|搜索)\s+/i.test(input)) {
      const query = input.replace(/^(search|搜索)\s+/i, '');
      await runSearch(query, messages, currentModel);
      continue;
    }

    // === AI Chat ===
    messages.push({ role: 'user', content: input });
    foregroundBusy = true;
    try {
      if (session.mode === 'agent' || session.mode === 'plan') {
        await streamAgentResponse(messages, currentModel, session, askPrompt, permissionSession, hooks);
      } else {
        await streamAIResponse(messages, currentModel, session.mode, (cancel) => {
          activeCancel = cancel;
        });
      }
    } finally {
      activeCancel = null;
      foregroundBusy = false;
    }
  }

  } finally {
  process.removeListener('SIGINT', onSigint);
  process.stdin.removeListener('keypress', onKeypress);
  if (!wasRaw) process.stdin.setRawMode?.(false);
  }
}

// === Slash Command Handler ===

type CommandResult =
  | { model: ModelInfo }
  | { nextInput: string };

interface RuntimeHooks {
  askLine: (prompt: string) => Promise<string>;
  runSearch: (query: string, messages: ChatMessage[], model: ModelInfo) => Promise<void>;
  runtimeSkills: RuntimeSkill[];
  syncSkillContext: () => void;
  subagents: SubagentQueue;
  permissionSession: SessionPermissionMemory;
  isSubagentWorkerActive: () => boolean;
  setSubagentWorkerActive: (active: boolean) => void;
  setSubagentActiveWork: (cancel: (() => void) | null) => void;
}

async function handleCommand(
  input: string,
  currentModel: ModelInfo,
  messages: ChatMessage[],
  session: AiSessionState,
  hooks: RuntimeHooks
): Promise<'exit' | 'continue' | CommandResult> {
  const parsed = parseSlashCommand(input);
  if (!parsed) return 'continue';
  const cmd = parsed.command;
  const args = parsed.args;
  if (cmd === '/') {
    printSlashMenu(session.mode);
    return 'continue';
  }
  if (cmd === '/agent' && args.trim()) {
    await handleAgentCommand(args, currentModel, session, hooks);
    return 'continue';
  }
  if (cmd === '/plan' && args.trim().toLowerCase() === 'open') {
    loadCurrentPlanFromWorkspace(session, process.cwd());
    console.log('');
    console.log(chalk.bold.cyan('  Current Plan File'));
    printDivider();
    formatCurrentPlan(session).split('\n').forEach((line) => {
      console.log(chalk.white('  ' + line));
    });
    console.log('');
    return 'continue';
  }
  if (cmd === '/plan' && !args.trim() && session.mode === 'plan') {
    console.log('');
    console.log(chalk.bold.cyan('  Current Plan'));
    printDivider();
    formatCurrentPlan(session).split('\n').forEach((line) => {
      console.log(chalk.white('  ' + line));
    });
    console.log('');
    return 'continue';
  }
  const modeCommand = resolveModeCommandAction(cmd, args);
  if (modeCommand) {
    setMode(session, modeCommand.mode);
    if (modeCommand.mode === 'plan') {
      preparePlanModeSession(session, process.cwd());
    }
    setSubagentParentPermission(hooks.subagents, session.permissionMode);
    messages[0] = { role: 'system', content: getSystemPrompt({
      mode: session.mode,
      permissionMode: session.permissionMode,
      modelId: session.currentModelId,
    }) };
    printSuccess(`已切换到 ${session.mode} 模式`);
    return modeCommand.nextInput ? { nextInput: modeCommand.nextInput } : 'continue';
  }

  switch (cmd) {
    case '/exit':
    case '/quit':
    case '/q':
      console.log(chalk.green('\n  👋 再见！\n'));
      return 'exit';

    case '/help':
    case '/h':
      printHelp();
      printSlashMenu(session.mode);
      return 'continue';

    case '/model':
    case '/m':
      {
        const modelCommand = resolveModelCommand(args);
        if (modelCommand.kind === 'info') {
          printModelInfo(currentModel);
          return 'continue';
        }
        if (modelCommand.kind === 'select') {
          const selected = getModelById(modelCommand.modelId);
          if (!selected || !isConfiguredModelId(modelCommand.modelId)) {
            printWarning('未知模型: ' + modelCommand.modelId);
            return 'continue';
          }
          persistActiveModel(selected.id);
          printSuccess(`已切换到 ${selected.name}`);
          return { model: selected };
        }
      }
      return await switchModel(currentModel, session);

    case '/setting':
    case '/settings':
      try {
        await configureAiSettings(hooks.askLine);
      } catch (error: any) {
        if (error?.message === AI_SESSION_EXIT) return 'exit';
        throw error;
      }
      return 'continue';

    case '/skills':
      printRuntimeSkills(hooks.runtimeSkills, session.activeSkillIds);
      return 'continue';

    case '/skill':
      handleSkillCommand(args, hooks.runtimeSkills, session, hooks.syncSkillContext);
      return 'continue';

    case '/clear':
    case '/c':
      messages.length = 1; // keep system prompt
      hooks.syncSkillContext();
      printSuccess('对话已清空');
      return 'continue';

    case '/search':
    case '/s':
      if (!args) {
        printWarning('用法: /search <查询内容>');
      } else {
        await hooks.runSearch(args, messages, currentModel);
      }
      return 'continue';

    case '/info':
      printModelInfo(currentModel);
      return 'continue';

    default:
      printWarning('未知命令: ' + cmd + '，输入 /help 查看帮助');
      return 'continue';
  }
}

function printRuntimeSkills(skills: RuntimeSkill[], activeSkillIds: string[]): void {
  console.log('');
  console.log(chalk.bold.cyan('  Skills'));
  printDivider();
  console.log(formatSkillList(skills, activeSkillIds));
  console.log('');
}

function printSlashMenu(mode: AiSessionState['mode']): void {
  console.log('');
  console.log(chalk.bold.cyan('  Slash commands'));
  printDivider();
  formatSlashMenu(mode).split('\n').forEach((line) => {
    console.log(chalk.white('  ' + line));
  });
  console.log('');
}

function handleSkillCommand(
  args: string,
  skills: RuntimeSkill[],
  session: AiSessionState,
  syncSkillContext: () => void
): void {
  if (!args.trim()) {
    printRuntimeSkills(skills, session.activeSkillIds);
    printInfo('用法: /skill <id|name>，/skill clear');
    return;
  }

  const selection = resolveSkillSelection(args, skills);
  if (selection.kind === 'clear') {
    session.activeSkillIds = [];
    syncSkillContext();
    printSuccess('运行时 skills 已清空');
    return;
  }
  if (selection.kind === 'missing') {
    printWarning('未找到 skill: ' + selection.query);
    return;
  }

  if (!session.activeSkillIds.includes(selection.skill.id)) {
    session.activeSkillIds.push(selection.skill.id);
  }
  syncSkillContext();
  printSuccess(`已启用 skill: ${selection.skill.name}`);
}

async function handleAgentCommand(
  args: string,
  currentModel: ModelInfo,
  session: AiSessionState,
  hooks: RuntimeHooks
): Promise<void> {
  const command = resolveAgentCommand(args);
  setSubagentParentPermission(hooks.subagents, session.permissionMode);

  if (command.kind === 'list') {
    console.log('');
    console.log(chalk.bold.cyan('  Subagents'));
    printDivider();
    console.log(formatSubagentList(hooks.subagents));
    return;
  }

  if (command.kind === 'cancel') {
    if (!command.id) {
      printWarning('用法: /agent cancel <id>');
      return;
    }
    try {
      const cancelled = cancelSubagent(hooks.subagents, command.id);
      console.log(renderSubagentTimelineEntry(buildSubagentTimelineInput(cancelled)));
    } catch (error: any) {
      printWarning(error.message);
    }
    return;
  }

  if (command.kind === 'spawn') {
    if (!command.prompt) {
      printWarning('用法: /agent spawn <任务>');
      return;
    }
    const agentDefinition = resolveAgentDefinition(process.cwd(), 'general-purpose');
    const task = enqueueSubagent(hooks.subagents, {
      prompt: command.prompt,
      mode: session.mode === 'plan' ? 'plan' : 'agent',
      permissionMode: session.permissionMode,
      allowedTools: agentDefinition.tools,
      disallowedTools: agentDefinition.disallowedTools,
      skillIds: [...new Set([...session.activeSkillIds, ...(agentDefinition.skills || [])])],
      modelId: currentModel.id,
      currentPlan: session.currentPlan,
      currentPlanPath: session.currentPlanPath,
      agentType: agentDefinition.agentType,
      agentSystemPrompt: agentDefinition.systemPrompt,
    });
    console.log(formatPermissionDecision({
      decision: task.permissionMode === 'ask' ? 'ask' : 'allow',
      reason: `subagent runs in ${task.permissionMode} permission mode`,
    }, 'subagent'));
    console.log(renderSubagentTimelineEntry(buildSubagentTimelineInput(task)));
    runSubagentQueueInBackground(hooks);
    return;
  }

  if (command.kind === 'unknown') {
    printWarning('未知 agent 命令: ' + command.value);
    return;
  }

  setMode(session, 'agent');
  setSubagentParentPermission(hooks.subagents, session.permissionMode);
  printSuccess(`已切换到 ${session.mode} 模式`);
}

function runSubagentQueueInBackground(hooks: RuntimeHooks): void {
  if (hooks.isSubagentWorkerActive()) return;
  hooks.setSubagentWorkerActive(true);

  const handler = createAiSubagentHandler({
    workspaceRoot: process.cwd(),
    session: hooks.permissionSession,
  });
  const wrappedHandler = async (task: SubagentTask, context?: { signal?: AbortSignal }) => {
    console.log(renderSubagentTimelineEntry(buildSubagentTimelineInput({ ...task, status: 'running' })));
    hooks.setSubagentActiveWork(() => {
      hooks.subagents.items
        .filter((item) => item.status === 'running')
        .forEach((item) => {
          try {
            cancelSubagent(hooks.subagents, item.id);
          } catch {
            // The task may have completed between keypress and cancellation.
          }
        });
    });
    return handler(task, context);
  };

  const loop = async (): Promise<void> => {
    try {
      while (hooks.subagents.items.some((item) => item.status === 'queued')) {
        const completedTasks = await runSubagentScheduler(hooks.subagents, wrappedHandler);
        completedTasks.forEach((completed) => {
          console.log(renderSubagentTimelineEntry(buildSubagentTimelineInput(completed)));
        });
      }
    } finally {
      hooks.setSubagentActiveWork(null);
      hooks.setSubagentWorkerActive(false);
    }
  };

  void loop();
}

async function configureAiSettings(askLine: (prompt: string) => Promise<string>): Promise<void> {
  const current = parseAiEnv(process.env);
  console.log('');
  console.log(chalk.bold.cyan('  AI 设置'));
  printDivider();
  const baseUrl = (await askLine(chalk.cyan(`  URL [${current.baseUrl || 'https://api.example.com/v1'}]: `))).trim() || current.baseUrl;
  const apiKeyHint = current.apiKey ? maskApiKey(current.apiKey) : '空';
  const apiKey = (await askLine(chalk.cyan(`  API Key [${apiKeyHint}]: `))).trim() || current.apiKey;
  const modelInput = (await askLine(chalk.cyan(`  Model ID（英文逗号分隔） [${current.modelIds.join(',') || 'model-id'}]: `))).trim();
  const modelIds = (modelInput || current.modelIds.join(','))
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!baseUrl || !apiKey || modelIds.length === 0) {
    printWarning('URL、API Key 和 Model ID 都不能为空');
    return;
  }

  const activeModelId = modelIds.includes(current.activeModelId) ? current.activeModelId : modelIds[0];
  writeAiSettings(resolveEnvPath(), { baseUrl, apiKey, modelIds, activeModelId });
  process.env.AI_BASE_URL = baseUrl;
  process.env.AI_API_KEY = apiKey;
  process.env.AI_MODELS = modelIds.join(',');
  process.env.AI_MODEL = activeModelId;
  printSuccess(`AI 设置已保存，当前模型 ${activeModelId}`);
  console.log(chalk.gray(`  URL: ${baseUrl}`));
  console.log(chalk.gray(`  API Key: ${maskApiKey(apiKey)}`));
  console.log(chalk.gray(`  Models: ${modelIds.join(', ')}`));
}

function persistActiveModel(modelId: string): void {
  const settings = parseAiEnv(process.env);
  process.env.AI_MODEL = modelId;
  if (settings.modelIds.length === 0) return;
  if (!settings.modelIds.includes(modelId)) return;
  const next = updateActiveModelId(resolveEnvPath(), settings, modelId);
  process.env.AI_MODEL = next.activeModelId;
}

function printHelp(): void {
  console.log('');
  console.log(chalk.bold.cyan('  📖 命令列表'));
  printDivider();
  const cmds = [
    ['/model, /m', '切换 AI 模型'],
    ['/skills', '列出运行时 skills'],
    ['/skill <id|name>', '启用 skill，clear 清空'],
    ['/agent spawn <task>', '启动本地 subagent'],
    ['/agent list|cancel <id>', '查看或取消 subagent'],
    ['/search, /s <query>', '网络搜索'],
    ['/clear, /c', '清空对话历史'],
    ['/info', '当前模型信息'],
    ['/help, /h', '显示此帮助'],
    ['/exit, /q', '退出对话'],
  ];
  cmds.forEach(([cmd, desc]) => {
    console.log(chalk.cyan('  ' + cmd!.padEnd(24)) + chalk.white(desc!));
  });
  console.log('');
  console.log(chalk.bold.cyan('  🔧 工具命令 (直接输入)'));
  printDivider();
  const tools = [
    ['ls <path>', '列出目录'],
    ['read <file>', '读取文件'],
    ['grep <pattern> <file>', '搜索文件内容'],
    ['search <query>', '网络搜索'],
  ];
  tools.forEach(([cmd, desc]) => {
    console.log(chalk.cyan('  ' + cmd!.padEnd(24)) + chalk.white(desc!));
  });
  console.log('');
}

async function switchModel(current: ModelInfo, session?: AiSessionState): Promise<'continue' | CommandResult> {
  console.log('');
  console.log(chalk.bold.cyan('  🔄 选择模型'));
  printDivider();

  const availableModels = getSelectableModels();
  const options = availableModels.map(m => ({
    label: `${m.name}${m.id === current.id ? chalk.green(' (当前)') : ''}`,
    value: m.id,
    description: `${m.description}${m.supportsSearch ? ' 🔍' : ''}`,
  }));

  let selected: ModelInfo | null = null;

  if (session) session.inSubmenu = true;
  try {
    await interactiveSelect({
      title: '  选择模型:',
      options,
      onSelect: (value) => {
        selected = getModelById(value) || null;
      },
      onCancel: () => { /* do nothing */ },
    });
  } finally {
    if (session) session.inSubmenu = false;
  }

  if (selected) {
    persistActiveModel((selected as ModelInfo).id);
    printSuccess(`已切换到 ${(selected as ModelInfo).name}`);
    return { model: selected };
  }
  return 'continue';
}

function printModelInfo(model: ModelInfo): void {
  console.log('');
  console.log(chalk.bold.cyan('  📊 当前模型'));
  printDivider();
  formatModelInfo(model).split('\n').forEach((line) => {
    const [label, ...rest] = line.split(': ');
    if (!rest.length) {
      console.log(chalk.white('  ' + line));
      return;
    }
    console.log(chalk.white('  ' + label + ': ') + chalk.bold(rest.join(': ')));
  });
  console.log('');
}

async function doSearch(
  query: string,
  messages: ChatMessage[],
  model: ModelInfo,
  signal?: AbortSignal,
  onCancelReady?: (cancel: () => void) => void
): Promise<void> {
  const spinner = new Spinner('搜索中');
  spinner.start();
  try {
    const results = await webSearch(query, 5, signal);
    if (signal?.aborted) return;
    spinner.stop();
    console.log(chalk.bold.blue('\n  🔍 搜索结果: ') + chalk.white(query));
    printDivider();
    if (!results.length) {
      printWarning('未找到相关结果');
      return;
    }
    results.forEach((r, i) => {
      const date = r.publish_date ? chalk.gray(` (${r.publish_date})`) : '';
      console.log(chalk.cyan(`  [${i + 1}] `) + chalk.bold.white(r.title) + date);
      if (r.media) console.log(chalk.gray('      来源: ' + r.media));
      const snippet = r.content.slice(0, 150) + (r.content.length > 150 ? '...' : '');
      console.log(chalk.white('      ' + snippet));
      console.log('');
    });
    printDivider();

    // Inject search results into conversation so AI can see them
    const aiContent = results.map((r, i) =>
      `[${i + 1}] ${r.title}${r.publish_date ? ` (${r.publish_date})` : ''}\n${r.content}\n来源: ${r.link}`
    ).join('\n\n');

    messages.push({
      role: 'user',
      content: `我搜索了「${query}」，以下是搜索结果：\n\n${aiContent}\n\n请根据以上搜索结果进行总结分析。`
    });

    // Auto-trigger AI to summarize
    if (signal?.aborted) return;
    await streamAIResponse(messages, model, 'chat', onCancelReady);
  } catch (e: any) {
    spinner.stop();
    if (signal?.aborted || e.message === 'Search cancelled') return;
    printError('搜索失败: ' + e.message);
  }
}

/** Shared streaming AI response handler */
async function streamAIResponse(
  messages: ChatMessage[],
  model: ModelInfo,
  mode: AiSessionState['mode'],
  onCancelReady?: (cancel: () => void) => void
): Promise<string | null> {
  const spinner = new Spinner('AI 思考中');
  spinner.start();

  try {
    const response = await new Promise<string>((resolve, reject) => {
      let reasoningStarted = false;
      const renderer = new StreamRenderer();

      const handle = streamChat(messages, model, {
        onToken: (token) => {
          if (spinner.isRunning()) spinner.stop();
          renderer.push(token);
        },
        onReasoning: (token) => {
          if (!reasoningStarted) {
            spinner.stop();
            console.log(renderThinkingState({
              label: 'AI',
              status: 'reasoning',
              model: model.name,
              mode,
              detail: 'streaming model reasoning',
            }));
            reasoningStarted = true;
          }
          process.stdout.write(chalk.gray(token));
        },
        onDone: (full) => {
          spinner.stop();
          if (reasoningStarted) {
            console.log('');
            printDivider();
          }
          renderer.finish();
          printDivider();
          resolve(full);
        },
        onError: (err) => {
          spinner.stop();
          reject(err);
        },
      });
      onCancelReady?.(handle.abort);
    });

    messages.push({ role: 'assistant', content: response });

    trimMessagesPreservingSkillContext(messages, 20);
    return response;
  } catch (e: any) {
    spinner.stop();
    printError('API 错误: ' + e.message);
    messages.pop(); // remove failed user message
    return null;
  }
}

function parseTaskToolArguments(toolCall: ToolCall): { description: string; prompt: string; subagentType: string } {
  try {
    const parsed = JSON.parse(toolCall.function.arguments || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { description: '', prompt: '', subagentType: 'general-purpose' };
    }
    const args = parsed as Record<string, unknown>;
    return {
      description: typeof args.description === 'string' ? args.description.trim() : '',
      prompt: typeof args.prompt === 'string' ? args.prompt.trim() : '',
      subagentType: typeof args.subagent_type === 'string' && args.subagent_type.trim()
        ? args.subagent_type.trim()
        : 'general-purpose',
    };
  } catch {
    return { description: '', prompt: '', subagentType: 'general-purpose' };
  }
}

function handleAgentTaskToolCall(
  toolCall: ToolCall,
  model: ModelInfo,
  session: AiSessionState,
  hooks: RuntimeHooks
): ChatMessage {
  const args = parseTaskToolArguments(toolCall);
  if (!args.prompt) {
    return {
      role: 'tool',
      tool_call_id: toolCall.id,
      content: 'Error: task prompt is required.',
    };
  }

  const agentDefinition = resolveAgentDefinition(process.cwd(), args.subagentType);
  const permissionMode = agentDefinition.permissionMode || session.permissionMode;
  const task = enqueueSubagent(hooks.subagents, {
    prompt: args.prompt,
    mode: permissionMode === 'plan' ? 'plan' : 'agent',
    permissionMode,
    allowedTools: agentDefinition.tools,
    disallowedTools: agentDefinition.disallowedTools,
    skillIds: [...new Set([...session.activeSkillIds, ...(agentDefinition.skills || [])])],
    modelId: agentDefinition.model && agentDefinition.model !== 'inherit' ? agentDefinition.model : model.id,
    currentPlan: session.currentPlan,
    currentPlanPath: session.currentPlanPath,
    agentType: agentDefinition.agentType,
    agentSystemPrompt: agentDefinition.systemPrompt,
  });
  console.log(renderSubagentTimelineEntry(buildSubagentTimelineInput(task)));
  runSubagentQueueInBackground(hooks);

  return {
    role: 'tool',
    tool_call_id: toolCall.id,
    content: `Subagent ${task.id} queued: ${args.description || args.prompt}\nsubagent_type=${agentDefinition.agentType}`,
  };
}

type PlanApprovalResult = Extract<RunAgentTurnResult, { status: 'plan_approval_required' }>;

async function handlePlanApprovalResult(input: {
  result: PlanApprovalResult;
  messages: ChatMessage[];
  session: AiSessionState;
  askLine: (prompt: string) => Promise<string>;
  hooks: RuntimeHooks;
}): Promise<void> {
  const { result, messages, session, askLine, hooks } = input;
  const plan = result.plan.trim();
  if (plan) recordCurrentPlan(session, plan, { workspaceRoot: process.cwd() });
  console.log(renderPlanApprovalPanel({
    plan: session.currentPlan || formatCurrentPlan(session),
    planFilePath: session.currentPlanPath,
    permissions: result.permissions,
  }));
  const answer = (await askLine(chalk.cyan('  Approve plan and enter agent mode? [y/N]: '))).trim().toLowerCase();
  const approved = answer === 'y' || answer === 'yes';
  const outcome = resolvePlanApprovalOutcome(approved, session);
  if (approved) {
    messages.push({
      role: 'tool',
      tool_call_id: result.pendingToolCall.id,
      content: 'Plan approved by user. Switch to agent mode and implement the approved plan.',
    });
    setMode(session, outcome.mode);
    session.permissionMode = outcome.permissionMode;
    setSubagentParentPermission(hooks.subagents, session.permissionMode);
    messages[0] = { role: 'system', content: getSystemPrompt({
      mode: session.mode,
      permissionMode: session.permissionMode,
      modelId: session.currentModelId,
    }) };
    hooks.syncSkillContext();
    printSuccess('Plan approved. Switched to agent mode.');
    return;
  }
  messages.push({
    role: 'tool',
    tool_call_id: result.pendingToolCall.id,
    content: 'Plan was not approved by the user. Stay in plan mode and revise the plan.',
  });
  setMode(session, outcome.mode);
  session.permissionMode = outcome.permissionMode;
  printWarning('Plan not approved. Staying in plan mode.');
}

async function streamAgentResponse(
  messages: ChatMessage[],
  model: ModelInfo,
  session: AiSessionState,
  askLine: (prompt: string) => Promise<string>,
  permissionSession: SessionPermissionMemory,
  hooks: RuntimeHooks
): Promise<void> {
  const spinner = new Spinner('Agent 思考中');
  console.log(renderThinkingState({
    label: 'Agent',
    status: 'thinking',
    model: model.name,
    mode: session.mode,
    detail: 'planning tool calls and permission boundaries',
  }));
  spinner.start();
  const userMessage = messages[messages.length - 1];
  const renderedToolCallIds = new Set<string>();
  const renderAgentEvent = (event: AgentTurnEvent): void => {
    if (event.type === 'turn_start' && event.round === 1) return;
    if (event.type === 'assistant_message' && event.toolCallCount === 0) return;
    if (spinner.isRunning()) spinner.stop();
    if (event.type === 'tool_result') renderedToolCallIds.add(event.toolCallId);
    console.log(renderAgentProgressEvent({
      event,
      model: model.name,
      mode: session.mode,
    }));
  };

  try {
    let result = await runAgentTurn({
      messages,
      workspaceRoot: process.cwd(),
      mode: session.mode,
      permissionMode: session.permissionMode,
      session: permissionSession,
      handleAgentTool: (toolCall) => handleAgentTaskToolCall(toolCall, model, session, hooks),
      onEvent: (event) => renderAgentEvent(event),
      complete: (nextMessages) => chatCompleteMessage(nextMessages, model, buildProviderToolSpecs(session.mode)),
    });

    spinner.stop();

    if (result.status === 'plan_approval_required') {
      await handlePlanApprovalResult({ result, messages, session, askLine, hooks });
      return;
    }

    while (result.status === 'permission_required') {
      // Keep the assistant message that requested the tool in the transcript so the upcoming
      // tool result pairs with it (OpenAI requires every tool_call id to have a tool response).
      console.log(renderPermissionBox({
        tool: result.pendingToolCall.function.name,
        action: 'ask',
        reason: result.permission.reason,
      }));
      console.log(chalk.gray(formatPermissionPromptOptions()));

      let choice = parsePermissionPromptChoice('');
      while (choice.kind === 'invalid') {
        const answer = await askLine(chalk.cyan('  Choose 1/2/3/4/5: '));
        choice = parsePermissionPromptChoice(answer);
        if (choice.kind === 'invalid') printWarning('请输入 1、2、3、4 或 5。');
      }
      if (choice.kind === 'deny_feedback') {
        const feedback = await askLine(chalk.cyan('  Feedback for the agent: '));
        choice = { ...choice, feedback };
      }

      const next = await applyPermissionPromptChoice({
        choice,
        pending: result,
        messages,
        workspaceRoot: process.cwd(),
        mode: session.mode,
        permissionMode: session.permissionMode,
        session: permissionSession,
        handleAgentTool: (toolCall) => handleAgentTaskToolCall(toolCall, model, session, hooks),
        complete: (nextMessages) => chatCompleteMessage(nextMessages, model, buildProviderToolSpecs(session.mode)),
      });

      if (next.status === 'denied') {
        console.log(renderTimelineEntry({
          kind: 'tool',
          status: 'failed',
          label: result.pendingToolCall.function.name,
          detail: next.toolMessage.content,
        }));
        printWarning('Tool denied by user.');
        return;
      }
      if (next.status === 'cancelled') {
        console.log(renderTimelineEntry({
          kind: 'tool',
          status: 'cancelled',
          label: result.pendingToolCall.function.name,
          detail: next.reason,
        }));
        printWarning('Tool permission request cancelled.');
        return;
      }
      result = next;
    }

    if (result.status === 'plan_approval_required') {
      await handlePlanApprovalResult({ result, messages, session, askLine, hooks });
      return;
    }

    if (session.mode === 'plan' && result.finalMessage.content) {
      recordCurrentPlan(session, result.finalMessage.content, { workspaceRoot: process.cwd() });
    }

    result.toolResults.filter((toolResult) => !renderedToolCallIds.has(toolResult.toolCall.id)).forEach((toolResult) => {
      console.log(renderTimelineEntry({
        kind: 'tool',
        status: toolResult.message.content.startsWith('Error:') ? 'failed' : 'completed',
        label: toolResult.toolCall.function.name,
        detail: toolResult.message.content,
      }));
    });

    if (result.finalMessage.content) {
      const renderer = new StreamRenderer();
      renderer.push(result.finalMessage.content);
      renderer.finish();
      printDivider();
    }

    trimMessagesPreservingSkillContext(messages, 20);
  } catch (e: any) {
    spinner.stop();
    printError('Agent 错误: ' + e.message);
    const index = messages.lastIndexOf(userMessage);
    if (index >= 0) messages.splice(index, messages.length - index);
  }
}

export { MODELS, DEFAULT_MODEL_ID } from './models';
