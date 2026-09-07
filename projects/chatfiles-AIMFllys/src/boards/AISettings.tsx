import { useState } from 'react'
import { CheckCircle2, DatabaseZap, KeyRound, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import {
  type AIConfig,
  type EmbeddingConfig,
  MAX_CONTEXT_WINDOW,
  MIN_CONTEXT_WINDOW,
  normalizeAIConfig,
  saveAIConfig,
  streamChat,
} from '../utils/aiConfig'
import { rebuildSearchIndex } from '../utils/aiIndex'

type Probe = { kind: 'idle' | 'ok' | 'err' | 'busy'; note?: string }
type IndexState = Probe & { count?: number }

export default function AISettings({
  config,
  onChange,
}: {
  config: AIConfig
  onChange: (next: AIConfig) => void
}) {
  const [draft, setDraft] = useState<AIConfig>(config)
  const [saved, setSaved] = useState(false)
  const [probe, setProbe] = useState<Probe>({ kind: 'idle' })
  const [indexState, setIndexState] = useState<IndexState>({ kind: 'idle' })

  const set = <K extends keyof AIConfig>(key: K, value: AIConfig[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setSaved(false)
  }

  const setEmbedding = <K extends keyof EmbeddingConfig>(key: K, value: EmbeddingConfig[K]) => {
    setDraft((current) => ({ ...current, embedding: { ...current.embedding, [key]: value } }))
    setSaved(false)
  }

  const save = () => {
    const clean = normalizeAIConfig(draft)
    setDraft(clean)
    saveAIConfig(clean)
    onChange(clean)
    setSaved(true)
    return clean
  }

  const test = async () => {
    const clean = save()
    setProbe({ kind: 'busy' })
    try {
      let reply = ''
      await streamChat(clean, [{ role: 'user', content: '回复两个字：在线' }], (c) => (reply += c))
      setProbe({ kind: 'ok', note: reply.trim().slice(0, 40) || '连接成功' })
    } catch (e) {
      setProbe({ kind: 'err', note: String((e as Error).message).slice(0, 160) })
    }
  }

  const rebuildIndex = async () => {
    const clean = save()
    setIndexState({ kind: 'busy', note: '正在读取源记录并生成派生索引…' })
    try {
      const result = await rebuildSearchIndex(clean)
      const mode = result.mode === 'hybrid' ? '混合检索' : '关键词检索'
      setIndexState({ kind: 'ok', note: `${mode}索引已更新`, count: result.chunkCount })
    } catch {
      setIndexState({ kind: 'err', note: '重建失败；现有索引保持不变，请核对数据库与向量配置。' })
    }
  }

  return (
    <section className="ai-settings">
      <div className="ai-settings-head">
        <Sparkles size={20} />
        <div>
          <h2>AI 接入</h2>
          <p>配置任意 OpenAI 兼容接口。密钥仅存于本机浏览器，转发时一次性透传，绝不写入仓库或日志。</p>
        </div>
      </div>

      <div className="ai-field">
        <label htmlFor="ai-chat-base-url">接口地址 Base URL</label>
        <input
          id="ai-chat-base-url"
          value={draft.baseURL}
          onChange={(e) => set('baseURL', e.target.value)}
          placeholder="https://api.openai.com/v1"
          spellCheck={false}
        />
        <small>会向 <code>{(draft.baseURL || '…').replace(/\/+$/, '')}/chat/completions</code> 发起请求。</small>
      </div>

      <div className="ai-field">
        <label htmlFor="ai-chat-api-key"><KeyRound size={13} /> API Key</label>
        <input id="ai-chat-api-key" type="password" value={draft.apiKey} onChange={(e) => set('apiKey', e.target.value)} placeholder="sk-…" spellCheck={false} />
      </div>

      <div className="ai-field-row">
        <div className="ai-field">
          <label htmlFor="ai-chat-model">模型 ID</label>
          <input id="ai-chat-model" value={draft.model} onChange={(e) => set('model', e.target.value)} placeholder="gpt-4o-mini" spellCheck={false} />
        </div>
        <div className="ai-field">
          <label htmlFor="ai-chat-temperature">温度 {draft.temperature.toFixed(2)}</label>
          <input
            id="ai-chat-temperature"
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={draft.temperature}
            onChange={(e) => set('temperature', Number(e.target.value))}
          />
        </div>
      </div>

      <section className="ai-config-card" aria-labelledby="context-settings-title">
        <div className="ai-config-card-head">
          <div><h3 id="context-settings-title">上下文规划</h3><small>统一为系统提示、工具结果和输出预留至少 30%。</small></div>
          <span className="ai-status-badge">原文上限 70%</span>
        </div>
        <div className="ai-field">
          <label htmlFor="ai-context-window">模型上下文窗口 · tokens</label>
          <input
            id="ai-context-window"
            max={MAX_CONTEXT_WINDOW}
            min={MIN_CONTEXT_WINDOW}
            onChange={(event) => set('contextWindow', Number(event.target.value))}
            step={1_000}
            type="number"
            value={draft.contextWindow}
          />
          <small>按模型真实窗口填写；原始证据最多使用 {(draft.contextWindow * 0.7).toLocaleString()} tokens，并始终按完整消息裁剪。</small>
        </div>
        <fieldset className="ai-strategy">
          <legend>长上下文策略</legend>
          <label data-selected={draft.contextStrategy === 'recent'}>
            <input checked={draft.contextStrategy === 'recent'} name="context-strategy" onChange={() => set('contextStrategy', 'recent')} type="radio" />
            <span><strong>最近窗口</strong><small>优先保留问题、页面锚点、检索证据与最近原文。</small></span>
          </label>
          <label data-selected={draft.contextStrategy === 'summary'}>
            <input checked={draft.contextStrategy === 'summary'} name="context-strategy" onChange={() => set('contextStrategy', 'summary')} type="radio" />
            <span><strong>结构化摘要</strong><small>使用带消息 UID 的版本化无损摘要，并动态补入原始证据。</small></span>
          </label>
        </fieldset>
      </section>

      <section className="ai-config-card" aria-labelledby="retrieval-settings-title">
        <div className="ai-config-card-head">
          <div><h3 id="retrieval-settings-title">混合检索</h3><small>精确匹配、FTS 关键词与可选语义向量融合排序。</small></div>
          <label className="ai-toggle"><input checked={draft.embedding.enabled} onChange={(event) => setEmbedding('enabled', event.target.checked)} type="checkbox" /> 启用向量检索</label>
        </div>
        <p className="ai-retrieval-status">关键词检索始终可用 · {draft.embedding.enabled ? '向量配置将在建索引时验证' : '当前 keyword-only'}</p>
        {draft.embedding.enabled && (
          <div className="ai-embedding-grid">
            <div className="ai-field ai-span-two">
              <label htmlFor="ai-embedding-base-url">Embedding Base URL</label>
              <input id="ai-embedding-base-url" onChange={(event) => setEmbedding('baseURL', event.target.value)} spellCheck={false} value={draft.embedding.baseURL} />
            </div>
            <div className="ai-field">
              <label htmlFor="ai-embedding-model">Embedding 模型</label>
              <input id="ai-embedding-model" onChange={(event) => setEmbedding('model', event.target.value)} spellCheck={false} value={draft.embedding.model} />
            </div>
            <div className="ai-field">
              <label htmlFor="ai-embedding-api-key"><KeyRound size={13} /> Embedding API Key</label>
              <input id="ai-embedding-api-key" onChange={(event) => setEmbedding('apiKey', event.target.value)} placeholder="留空则复用对话 Key" spellCheck={false} type="password" value={draft.embedding.apiKey} />
            </div>
            <div className="ai-field">
              <label htmlFor="ai-embedding-dimensions">向量维度</label>
              <input id="ai-embedding-dimensions" max={8192} min={1} onChange={(event) => setEmbedding('dimensions', Number(event.target.value))} type="number" value={draft.embedding.dimensions} />
            </div>
            <div className="ai-field">
              <label htmlFor="ai-embedding-batch">批大小</label>
              <input id="ai-embedding-batch" max={256} min={1} onChange={(event) => setEmbedding('batchSize', Number(event.target.value))} type="number" value={draft.embedding.batchSize} />
            </div>
          </div>
        )}
        <div className="ai-index-maintenance">
          <button className="ai-index-rebuild" disabled={indexState.kind === 'busy'} onClick={() => void rebuildIndex()} type="button">
            {indexState.kind === 'busy' ? <Loader2 className="spin" size={15} /> : <DatabaseZap size={15} />}
            重建检索索引
          </button>
          <span aria-live="polite" className="ai-index-status" data-state={indexState.kind}>
            {indexState.note ?? '索引是可重建派生数据，不会修改原始聊天记录。'}
            {indexState.count === undefined ? '' : ` · ${indexState.count.toLocaleString()} 个片段`}
          </span>
        </div>
      </section>

      <div className="ai-actions">
        <button className="ai-save" type="button" onClick={save}>
          {saved ? <CheckCircle2 size={16} /> : null} {saved ? '已保存' : '保存配置'}
        </button>
        <button className="ai-test" type="button" onClick={test} disabled={probe.kind === 'busy'}>
          {probe.kind === 'busy' ? <Loader2 className="spin" size={15} /> : null} 测试连接
        </button>
        {probe.kind === 'ok' && <span className="ai-probe ok"><CheckCircle2 size={14} /> {probe.note}</span>}
        {probe.kind === 'err' && <span className="ai-probe err">{probe.note}</span>}
      </div>

      <p className="ai-privacy">
        <ShieldCheck size={14} /> 隐私：对话与 Embedding 密钥只保存在浏览器 localStorage，并仅随当前请求透传；服务端不落盘、不记录。向量索引只保存数值和模型指纹。
      </p>
    </section>
  )
}
