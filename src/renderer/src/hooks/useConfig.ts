import { useState, useEffect, useCallback } from 'react'

export interface FlintConfig {
  hotkey: string
  alertMinutes: number
  launchAtLogin: boolean
  showTrayIcon: boolean
}

const DEFAULT_CONFIG: FlintConfig = {
  hotkey: 'Option+Space',
  alertMinutes: 5,
  launchAtLogin: true,
  showTrayIcon: true,
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
