import path from 'node:path'

export type WechatDatabaseSource = 'current' | 'legacy' | 'missing'

export type WechatDatabaseResolution = {
  source: WechatDatabaseSource
  selectedPath: string | null
  currentPath: string
  legacyPath: string
  currentAvailable: boolean
  legacyAvailable: boolean
}

export function resolveWechatDatabase(
  projectRoot: string,
  isAvailable: (candidate: string) => boolean,
): WechatDatabaseResolution {
  const currentPath = path.resolve(projectRoot, 'data', 'wechat.current', 'wechat.db')
  const legacyPath = path.resolve(projectRoot, 'data', 'wechat.db')
  const currentAvailable = isAvailable(currentPath)
  const legacyAvailable = isAvailable(legacyPath)
  const source = currentAvailable ? 'current' : legacyAvailable ? 'legacy' : 'missing'

  return {
    source,
    selectedPath: source === 'current' ? currentPath : source === 'legacy' ? legacyPath : null,
    currentPath,
    legacyPath,
    currentAvailable,
    legacyAvailable,
  }
}
