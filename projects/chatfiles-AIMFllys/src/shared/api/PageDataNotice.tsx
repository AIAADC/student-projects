import { AlertTriangle, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PageDataState } from './pageData'

export function PageDataNotice({
  states,
  blocking = true,
  children,
}: {
  states: readonly PageDataState<unknown>[]
  blocking?: boolean
  children: ReactNode
}) {
  const loading = states.some((state) => state.status === 'loading')
  const unavailable = states.filter((state) => state.status === 'unavailable')
  const stale = states.some((state) => state.status === 'stale')

  if (blocking && loading) {
    return (
      <section aria-live="polite" className="page-data-state">
        <Loader2 className="spin" size={20} />
        <span>正在读取数据产品…</span>
      </section>
    )
  }
  if (blocking && states.length > 0 && unavailable.length === states.length) {
    return (
      <section className="page-data-state is-unavailable" role="alert">
        <AlertTriangle size={22} />
        <strong>数据产品暂不可用</strong>
        <span>这不是空数据；请运行数据诊断或检查当前 release。</span>
      </section>
    )
  }
  const degraded = unavailable.length > 0 || stale
  return (
    <>
      {degraded && (
        <div className="page-data-notice" role="status">
          <AlertTriangle size={15} />
          {stale ? '部分数据已过期，当前显示最后可用结果。' : '部分数据产品不可用，当前功能已降级。'}
        </div>
      )}
      {children}
    </>
  )
}
