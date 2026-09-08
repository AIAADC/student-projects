export { readJsonFile as readJson } from '../../pipeline/common/jsonFile.js'

export function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export function qualityLabel(value: 'high' | 'medium' | 'low') {
  if (value === 'high') return '高'
  if (value === 'medium') return '中'
  return '低'
}

export function auditStatusLabel(value: 'proved' | 'partial' | 'needs_input' | 'not_proved') {
  if (value === 'proved') return '已证明'
  if (value === 'partial') return '部分完成'
  if (value === 'needs_input') return '需要外部输入'
  return '未证明'
}

export function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<T, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1
    return acc
  }, {} as Record<T, number>)
}
