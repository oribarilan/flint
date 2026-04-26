import { nativeTheme } from 'electron'
import type { ThemePreference } from './types'

/** Resolve a theme preference to a concrete 'dark' | 'light' value. */
export function resolveTheme(preference: ThemePreference): 'dark' | 'light' {
  if (preference === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  }
  return preference
}
