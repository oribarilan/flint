import { useRef, useCallback } from 'react'
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

        {/* Background Agent */}
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Background Agent</div>
          <div className={styles.row}>
            <span className={styles.label}>Background polling</span>
            <button
              className={styles.toggle}
              type="button"
              role="switch"
              aria-checked={config.pollEnabled}
              aria-label="Background polling"
              onClick={() => onUpdate({ pollEnabled: !config.pollEnabled })}
            >
              <span className={styles.toggleKnob} />
            </button>
          </div>
          <div className={styles.row} style={{ opacity: config.pollEnabled ? 1 : 0.5 }}>
            <span className={styles.label}>Poll frequency</span>
            <select
              className={styles.select}
              value={config.pollFrequency}
              onChange={(e) =>
                onUpdate({ pollFrequency: e.target.value as FlintConfig['pollFrequency'] })
              }
              disabled={!config.pollEnabled}
              aria-label="Poll frequency"
            >
              <option value="relaxed">Relaxed</option>
              <option value="normal">Normal</option>
              <option value="aggressive">Aggressive</option>
            </select>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>Poll model</span>
            <span className={styles.value}>{config.pollModel}</span>
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
