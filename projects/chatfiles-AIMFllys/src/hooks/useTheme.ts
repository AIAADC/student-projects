import { useEffect, useLayoutEffect, useState } from 'react'
import {
  parseThemePreference,
  resolveTheme,
  serializeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from './themeModel'

const THEME_STORAGE_KEY = 'chatfiles.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function prefersDark() {
  return window.matchMedia(DARK_QUERY).matches
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => (
    parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY))
  ))
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(preference, prefersDark()))

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const sync = () => setResolved(resolveTheme(preference, media.matches))
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [preference])

  useLayoutEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, serializeThemePreference(preference))
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
  }, [preference, resolved])

  return { preference, resolved, setPreference }
}
