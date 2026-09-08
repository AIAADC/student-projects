import { ArrowUpRight, FolderArchive, Lightbulb, MessagesSquare } from 'lucide-react'
import type { Overview } from '../types'

function formatBytes(size: number) {
  if (!size) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const level = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  return `${(size / 1024 ** level).toFixed(level ? 1 : 0)} ${units[level]}`
}

function bigNum(n: number) {
  return (n ?? 0).toLocaleString('en-US')
}

export default function OverviewBoard({
  overview,
  onGoto,
}: {
  overview: Overview
  onGoto: (tab: 'chat' | 'files' | 'insights') => void
}) {
  const { chat, files, insights } = overview

  const tiles = [
    { label: '对话', value: bigNum(chat.conversations), sub: '条会话线索', tone: 'gold' },
    { label: '消息', value: bigNum(chat.messages), sub: '逐句留存', tone: 'jade' },
    { label: '文字消息', value: bigNum(chat.textMessages), sub: '可全文检索', tone: 'gold' },
    { label: '联系人', value: bigNum(chat.contacts), sub: '位往来之人', tone: 'rust' },
  ] as const

  const minor = [
    { label: '归档文件', value: bigNum(files.archived) },
    { label: '索引文件', value: bigNum(files.indexed) },
    { label: '归档体量', value: formatBytes(files.bytes) },
    { label: '洞察会话', value: bigNum(insights.conversations) },
    { label: '洞察碎金', value: bigNum(insights.nuggets) },
  ]

  const entries = [
    {
      key: 'chat' as const,
      icon: <MessagesSquare size={20} />,
      eyebrow: 'CHAT',
      title: '聊天',
      body: '逐条重读那些被解密保存下来的对话——群聊的喧闹，私聊的低语，按时间线索还原。',
    },
    {
      key: 'files' as const,
      icon: <FolderArchive size={20} />,
      eyebrow: 'FILES',
      title: '文件',
      body: '文档、图片、语音、表格、数据库——原样归档与全量索引并置，内嵌只读预览。',
    },
    {
      key: 'insights' as const,
      icon: <Lightbulb size={20} />,
      eyebrow: 'INSIGHTS',
      title: '洞察',
      body: 'AI 从万语千言中淘洗出的碎金：技术、哲理、学业、人物，汇成一册私人札记。',
    },
  ]

  return (
    <section className="ov">
      <header className="ov-hero rise" style={{ animationDelay: '40ms' }}>
        <p className="eyebrow">A DECRYPTED PRIVATE ARCHIVE · 第二大脑</p>
        <h1 className="ov-title">午夜书斋</h1>
        <p className="ov-sub">
          一座温暖的深夜档案馆。这里收纳着已解密的微信往来、随手存下的文件，以及
          AI 替你重读后留下的注脚——不是用来示人的仪表盘，而是一个人安静翻阅自己的过往。
        </p>
      </header>

      <div className="ov-tiles rise" style={{ animationDelay: '120ms' }}>
        {tiles.map((t) => (
          <article className={`ov-tile tone-${t.tone}`} key={t.label}>
            <span className="ov-tile-label">{t.label}</span>
            <strong className="ov-tile-num">{t.value}</strong>
            <span className="ov-tile-sub">{t.sub}</span>
          </article>
        ))}
      </div>

      <div className="ov-minor rise" style={{ animationDelay: '200ms' }}>
        {minor.map((m) => (
          <div className="ov-minor-cell" key={m.label}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
          </div>
        ))}
      </div>

      <div className="ov-entries rise" style={{ animationDelay: '280ms' }}>
        {entries.map((e) => (
          <button className="ov-entry" key={e.key} type="button" onClick={() => onGoto(e.key)}>
            <span className="ov-entry-icon">{e.icon}</span>
            <p className="eyebrow">{e.eyebrow}</p>
            <h3>{e.title}</h3>
            <p className="ov-entry-body">{e.body}</p>
            <span className="ov-entry-go">
              进入 <ArrowUpRight size={15} />
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
