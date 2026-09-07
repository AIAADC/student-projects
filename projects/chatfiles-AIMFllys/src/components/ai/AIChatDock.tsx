import { useEffect, useRef, useState } from 'react'
import { Bot, Loader2, Send, Sparkles, Trash2, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentCitation as Citation, AgentContextSummary, AgentStreamEvent } from '../../types'
import {
  type AIConfig,
  type ChatTurn,
  type DockSize,
  clearHistory,
  isConfigured,
  loadDockSize,
  loadHistory,
  saveDockSize,
  saveHistory,
} from '../../utils/aiConfig'
import { AgentStreamError, streamAgent } from '../../utils/aiAgentStream'
import { agentRequestConfig } from '../../utils/aiIndex'
import { clearAgentSummary, loadAgentSummary, saveAgentSummary } from '../../utils/aiSummaryStore'
import { AgentCitation } from './AgentCitation'
import { AgentProgress, type AgentProgressEntry } from './AgentProgress'

type RunMeta = { mode?: 'agent' | 'fallback'; strategy: 'recent' | 'summary'; evidenceCount: number }

const errorLabels: Record<string, string> = {
  agent_timeout: '检索超过 90 秒，已安全停止',
  cancelled: '本次检索已取消',
  database_unavailable: '本地资料库暂时不可用',
  upstream_failed: '模型接口暂时无法完成请求',
  agent_unavailable: '智能体服务暂时不可用',
  step_limit: '已达到 8 步检索上限，请缩小问题范围',
}

function historyForConversation(convId: string) {
  return loadHistory(convId).filter((turn) => turn.role === 'user' || turn.role === 'assistant')
}

function toolLabel(name: string) {
  const labels: Record<string, string> = {
    list_conversations: '查找会话', search_messages: '检索消息', get_message_context: '核对消息上下文',
    search_artifacts: '查找文件', read_document: '读取文档', get_timeline_slice: '读取时间轴',
    get_link_preview: '读取链接介绍',
  }
  return labels[name] ?? name
}

export function AIChatDock({
  convId,
  convName,
  config,
  anchorMessageUid,
  timeZone,
  onCitation,
  onClose,
  onGotoSettings,
}: {
  convId: string
  convName: string
  config: AIConfig
  anchorMessageUid?: string
  timeZone: string
  onCitation: (citation: Citation) => void
  onClose: () => void
  onGotoSettings: () => void
}) {
  const [turns, setTurns] = useState<ChatTurn[]>(() => historyForConversation(convId))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [size, setSize] = useState<DockSize>(loadDockSize)
  const [progress, setProgress] = useState<AgentProgressEntry[]>([])
  const [evidence, setEvidence] = useState<Citation[]>([])
  const [summary, setSummary] = useState<AgentContextSummary | undefined>(() => loadAgentSummary(convId))
  const [meta, setMeta] = useState<RunMeta>({ strategy: config.contextStrategy, evidenceCount: 0 })
  const abortRef = useRef<AbortController | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => saveHistory(convId, turns), [convId, turns])
  useEffect(() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight }), [turns, progress])
  useEffect(() => saveDockSize(size), [size])
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [input])

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    const { clientX, clientY } = event
    const initial = size
    const move = (next: PointerEvent) => setSize({
      w: Math.max(320, Math.min(window.innerWidth - 48, initial.w + clientX - next.clientX)),
      h: Math.max(360, Math.min(window.innerHeight - 90, initial.h + clientY - next.clientY)),
    })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const clearContext = () => {
    abortRef.current?.abort()
    setBusy(false)
    setTurns([])
    setProgress([])
    setEvidence([])
    setMeta({ strategy: config.contextStrategy, evidenceCount: 0 })
    clearHistory(convId)
    clearAgentSummary(convId)
    setSummary(undefined)
    setError('')
  }

  const updateProgress = (event: Extract<AgentStreamEvent, { type: 'step' | 'tool' }>) => {
    setProgress((current) => {
      if (event.type === 'step') {
        const entry: AgentProgressEntry = { key: `step-${event.step}`, label: event.label, status: 'running' }
        return [...current, entry].slice(-20)
      }
      const next = current.slice()
      const running = next.findLastIndex((item) => item.key.startsWith(`tool-${event.step}-${event.name}`) && item.status === 'running')
      if (running >= 0 && event.status !== 'running') next[running] = { ...next[running], status: event.status }
      else next.push({ key: `tool-${event.step}-${event.name}-${next.length}`, label: toolLabel(event.name), status: event.status })
      return next.slice(-20)
    })
  }

  const handleEvent = (event: AgentStreamEvent) => {
    if (event.type === 'step' || event.type === 'tool') updateProgress(event)
    else if (event.type === 'citation') {
      setEvidence((current) => current.some((item) => item.citation === event.citation) ? current : [...current, event])
    } else if (event.type === 'delta') {
      setTurns((current) => {
        const next = current.slice()
        const last = next.at(-1)
        if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + event.content }
        return next
      })
    } else if (event.type === 'done') {
      setMeta({ mode: event.mode, strategy: event.strategy, evidenceCount: event.evidenceCount })
      if (event.summary) {
        saveAgentSummary(convId, event.summary)
        setSummary(event.summary)
      } else if (config.contextStrategy === 'summary' && event.strategy === 'recent') {
        clearAgentSummary(convId)
        setSummary(undefined)
      }
    }
  }

  const send = async () => {
    const question = input.trim()
    if (!question || busy) return
    if (!isConfigured(config)) {
      setError('尚未配置模型接口，请先到「AI」板块填写 Base URL 与模型。')
      return
    }
    const prior = turns.filter((turn) => turn.role === 'user' || turn.role === 'assistant')
    setTurns([...prior, { role: 'user', content: question }, { role: 'assistant', content: '' }])
    setInput('')
    setBusy(true)
    setError('')
    setProgress([])
    setEvidence([])
    setMeta({ strategy: config.contextStrategy, evidenceCount: 0 })
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await streamAgent({
        question,
        conversationId: convId,
        conversationName: convName,
        ...(anchorMessageUid ? { anchorMessageUid } : {}),
        history: prior.map((turn) => ({ role: turn.role as 'user' | 'assistant', content: turn.content })),
        ...(summary ? { summary } : {}),
        config: agentRequestConfig(config),
      }, handleEvent, controller.signal)
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') {
        const code = reason instanceof AgentStreamError ? reason.code : 'agent_unavailable'
        setError(errorLabels[code] ?? '智能体未能完成本次检索')
      }
    } finally {
      setBusy(false)
    }
  }

  const ready = isConfigured(config)
  return (
    <div className="ai-dock" role="dialog" aria-label="AI 解析" style={{ width: size.w, height: size.h }}>
      <div className="ai-dock-resize" onPointerDown={startResize} title="拖动调整大小" />
      <header className="ai-dock-head">
        <span className="ai-dock-title"><Sparkles size={15} /> 研究智能体 · {convName}</span>
        <div className="ai-dock-acts">
          <button className="ai-dock-x" type="button" onClick={clearContext} aria-label="清除 AI 上下文" title="只清除 AI 对话与摘要"><Trash2 size={15} /></button>
          <button className="ai-dock-x" type="button" onClick={() => { abortRef.current?.abort(); onClose() }} aria-label="关闭"><X size={16} /></button>
        </div>
      </header>

      <div className="ai-dock-ctx">
        <span>{meta.strategy === 'summary' ? '结构化摘要' : '最近窗口'} · 原文硬上限 70%</span>
        <span>{meta.mode === 'fallback' ? '关键词降级' : meta.mode === 'agent' ? '多步工具' : '等待提问'} · {meta.evidenceCount} 项证据</span>
      </div>
      <AgentProgress entries={progress} />

      <div className="ai-dock-body" ref={bodyRef}>
        {!turns.length && (
          <div className="ai-dock-hint">
            <Bot size={28} />
            <p>{ready ? '它会按需检索消息、核对上下文，并在需要时读取文档。' : '先到「AI」板块配置接口，再回来研究。'}</p>
            {!ready && <button type="button" className="ai-dock-cfg" onClick={onGotoSettings}>前往配置 →</button>}
          </div>
        )}
        {turns.map((turn, index) => (
          <div key={index} className={`ai-turn ${turn.role}`}>
            <span className="ai-turn-who">{turn.role === 'user' ? '我' : 'AI'}</span>
            {turn.role === 'assistant' ? (
              <div className="ai-turn-text markdown-body">
                {turn.content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.content}</ReactMarkdown>
                  : busy && index === turns.length - 1 ? <Loader2 className="spin" size={13} /> : null}
              </div>
            ) : <div className="ai-turn-text">{turn.content}</div>}
          </div>
        ))}
        {evidence.length > 0 && <div className="agent-citations">{evidence.map((item) => <AgentCitation citation={item} key={item.citation} onOpen={onCitation} timeZone={timeZone} />)}</div>}
      </div>

      {error && <div className="ai-dock-err">{error}</div>}
      <div className="ai-dock-foot">
        <textarea
          ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }}
          placeholder={ready ? '描述你要找的内容…' : '配置后可用'} rows={1} disabled={!ready || busy}
        />
        <button className="ai-send" type="button" onClick={() => void send()} disabled={!ready || busy || !input.trim()}>
          {busy ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
        </button>
      </div>
    </div>
  )
}
