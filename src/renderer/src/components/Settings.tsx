import { useRef, useCallback, useEffect } from 'react'
import type { FlintConfig } from '../hooks/useConfig'
import styles from './Settings.module.css'

interface SettingsProps {
  config: FlintConfig
  onUpdate: (partial: Partial<FlintConfig>) => void
  onClose: () => void
}

export function Settings({ config, onUpdate, onClose }: SettingsProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose]
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleAlertChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = Math.max(1, Math.min(60, Number(e.target.value) || 1))
    onUpdate({ alertMinutes: value })
  }

  return (
    <div
      className={styles.backdrop}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className={styles.panel} ref={panelRef}>
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close settings"
            type="button"
          >
            ✕
          </button>
        </div>

        {/* Keyboard Shortcut */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Shortcut</div>
          <div className={styles.row}>
            <span className={styles.label}>Overlay hotkey</span>
            <span className={styles.value}>{config.hotkey}</span>
          </div>
        </div>

        {/* Notifications */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Notifications</div>
          <div className={styles.row}>
            <span className={styles.label}>Alert before meeting</span>
            <div>
              <input
                className={styles.numberInput}
                type="number"
                min={1}
                max={60}
                value={config.alertMinutes}
                onChange={handleAlertChange}
                aria-label="Minutes before meeting alert"
              />
              <span className={styles.unit}>min</span>
            </div>
          </div>
        </div>

        {/* System */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>System</div>
          <div className={styles.row}>
            <span className={styles.label}>Launch at login</span>
            <button
              className={styles.toggle}
              type="button"
              role="switch"
              aria-checked={config.launchAtLogin}
              aria-label="Launch at login"
              onClick={() => onUpdate({ launchAtLogin: !config.launchAtLogin })}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Show tray icon</span>
            <button
              className={styles.toggle}
              type="button"
              role="switch"
              aria-checked={config.showTrayIcon}
              aria-label="Show tray icon"
              onClick={() => onUpdate({ showTrayIcon: !config.showTrayIcon })}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
