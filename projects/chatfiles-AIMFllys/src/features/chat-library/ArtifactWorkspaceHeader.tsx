import type { Ref } from 'react'
import {
  ArrowLeft,
  Bot,
  FileText,
  FolderOpen,
  Link2,
  MessageSquareText,
  Pin,
  PinOff,
  Search,
  Shapes,
  Wrench,
} from 'lucide-react'
import type {
  ChatArtifactCounts,
  ChatArtifactTab,
  WechatConversation,
} from '../../types'
import {
  firstCodePoint,
  nextArtifactTab,
  type ChatLibrarySelection,
} from './artifactModel'
import { selectionTitle } from './artifactWorkspaceModel'

const tabs: Array<{ id: ChatArtifactTab; label: string; icon: typeof Shapes }> = [
  { id: 'all', label: '全部', icon: Shapes },
  { id: 'work', label: '作品', icon: FolderOpen },
  { id: 'document', label: '文档', icon: FileText },
  { id: 'skill', label: 'Skills 工具', icon: Wrench },
  { id: 'link', label: '链接', icon: Link2 },
  { id: 'chatText', label: '聊天文字', icon: MessageSquareText },
]

type ArtifactWorkspaceHeaderProps = {
  selection: ChatLibrarySelection
  conversation?: WechatConversation
  pinned: boolean
  onBack: () => void
  onTogglePin: () => void
  onAnalyze: () => void
  titleRef: Ref<HTMLHeadingElement>
  counts: ChatArtifactCounts
  tab: ChatArtifactTab
  query: string
  onKeyboardTabChange: (tab: ChatArtifactTab) => void
  onTabChange: (tab: ChatArtifactTab) => void
  onQueryChange: (query: string) => void
}

export function ArtifactWorkspaceHeader({
  selection,
  conversation,
  pinned,
  onBack,
  onTogglePin,
  onAnalyze,
  titleRef,
  counts,
  tab,
  query,
  onKeyboardTabChange,
  onTabChange,
  onQueryChange,
}: ArtifactWorkspaceHeaderProps) {
  const title = selectionTitle(selection, conversation)

  return (
    <header className="artifact-workspace-header">
      <div className="workspace-title-row">
        <button className="mobile-back" onClick={onBack} title="返回会话列表" type="button"><ArrowLeft size={19} /></button>
        <span className={`workspace-avatar ${conversation?.is_group ? 'is-group' : ''}`}>
          {firstCodePoint(title, '库')}
        </span>
        <div className="workspace-title">
          <small>{selection.kind === 'conversation' ? (conversation?.is_group ? '群聊素材' : '私聊素材') : '跨会话资料库'}</small>
          <div className="workspace-title-line">
            <h1 ref={titleRef} tabIndex={-1}>{title}</h1>
            <div className="workspace-title-counts" aria-label="记录数量">
              <span><strong>{counts.all.toLocaleString()}</strong> 项产出</span>
              <span><strong>{counts.chatText.toLocaleString()}</strong> 条文字</span>
            </div>
          </div>
        </div>
        <div className="workspace-actions">
          {selection.kind === 'conversation' && (
            <>
              <button aria-label={pinned ? '取消置顶' : '置顶会话'} aria-pressed={pinned} onClick={onTogglePin} title={pinned ? '取消置顶' : '置顶会话'} type="button">
                {pinned ? <PinOff size={18} /> : <Pin size={18} />}
              </button>
              <button aria-label="AI 分析会话" onClick={onAnalyze} title="AI 分析" type="button"><Bot size={19} /></button>
            </>
          )}
        </div>
      </div>

      <div className="artifact-controls">
        <div className="artifact-tabs" role="tablist" aria-label="素材分类">
          {tabs.map((item) => {
            const Icon = item.icon
            return (
              <button
                aria-controls="artifact-tab-panel"
                aria-selected={tab === item.id}
                className={tab === item.id ? 'is-active' : ''}
                id={`artifact-tab-${item.id}`}
                key={item.id}
                onKeyDown={(event) => {
                  const next = nextArtifactTab(tab, event.key)
                  if (next === tab && !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  if (next !== tab) onKeyboardTabChange(next)
                  requestAnimationFrame(() => document.getElementById(`artifact-tab-${next}`)?.focus())
                }}
                onClick={() => {
                  if (tab !== item.id) onTabChange(item.id)
                }}
                role="tab"
                tabIndex={tab === item.id ? 0 : -1}
                type="button"
              >
                <Icon size={16} /><span>{item.label}</span><strong>{counts[item.id].toLocaleString()}</strong>
              </button>
            )
          })}
        </div>
        <label className="artifact-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="检索当前素材"
            maxLength={200}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="检索当前素材"
            value={query}
          />
        </label>
      </div>
    </header>
  )
}
