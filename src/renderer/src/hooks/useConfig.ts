import { useState, useEffect, useCallback } from 'react'

export interface FlintConfig {
  hotkey: string
  alertMinutes: number
  launchAtLogin: boolean
  showTrayIcon: boolean
  model: string
  pollEnabled: boolean
  pollFrequency: 'relaxed' | 'normal' | 'aggressive'
  pollModel: string
}

const DEFAULT_CONFIG: FlintConfig = {
  hotkey: 'Option+Space',
  alertMinutes: 5,
  launchAtLogin: true,
  showTrayIcon: true,
  model: 'gpt-4.1',
  pollEnabled: true,
  pollFrequency: 'normal',
  pollModel: 'gpt-4.1-mini',
}

export function useConfig() {
  const [config, setConfig] = useState<FlintConfig>(DEFAULT_CONFIG)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    window.flint
      ?.getConfig()
      .then((raw) => {
        setConfig(raw as FlintConfig)
        setIsLoaded(true)
      })
      .catch(() => {
        setIsLoaded(true)
      })
  }, [])

  const updateConfig = useCallback((partial: Partial<FlintConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }))
    window.flint?.setConfig(partial as Record<string, unknown>)
  }, [])

  return { config, isLoaded, updateConfig }
}
