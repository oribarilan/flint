import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_CONFIG } from '../../../main/types'
import type { FlintConfig } from '../../../main/types'

export type { FlintConfig }

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
