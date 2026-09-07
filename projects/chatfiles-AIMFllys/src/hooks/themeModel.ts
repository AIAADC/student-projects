export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export function parseThemePreference(value: string | null | undefined): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system'
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

export function serializeThemePreference(preference: ThemePreference) {
  return preference
}

export function nextThemePreference(preference: ThemePreference): ThemePreference {
  if (preference === 'system') return 'light'
  if (preference === 'light') return 'dark'
  return 'system'
}
