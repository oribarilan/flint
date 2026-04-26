import { useState, useCallback } from 'react'
import { Sun, Cpu, Bell, Contrast } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { ModelSelect } from './ModelSelect'
import type { FlintConfig } from '../../../main/types'
import type { FontSize, PollFrequency } from '../../../main/types'
import styles from './Settings.module.css'

type SettingsTab = 'general' | 'ai' | 'notifications' | 'appearance'

interface SettingsProps {
  config: FlintConfig
  onUpdate: (partial: Partial<FlintConfig>) => void
}

const TABS: { id: SettingsTab; label: string; Icon: typeof Sun }[] = [
  { id: 'general', label: 'General', Icon: Sun },
  { id: 'ai', label: 'AI & Models', Icon: Cpu },
  { id: 'notifications', label: 'Notifications', Icon: Bell },
  { id: 'appearance', label: 'Appearance', Icon: Contrast },
]

const POLL_FREQUENCY_OPTIONS: { label: string; value: PollFrequency }[] = [
  { label: 'Relaxed', value: 'relaxed' },
  { label: 'Normal', value: 'normal' },
  { label: 'Aggressive', value: 'aggressive' },
]

const FONT_SIZE_OPTIONS: { label: string; value: FontSize }[] = [
  { label: 'XS', value: 'extra-small' },
  { label: 'S', value: 'small' },
  { label: 'M', value: 'medium' },
  { label: 'L', value: 'large' },
]

export function Settings({ config, onUpdate }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')

  const handleAlertChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const value = Math.max(1, Math.min(60, Number(e.target.value) || 1))
      onUpdate({ alertMinutes: value })
    },
    [onUpdate],
  )

  const handleFontSizeChange = useCallback(
    (value: FontSize): void => {
      document.documentElement.dataset.fontSize = value
      onUpdate({ fontSize: value })
    },
    [onUpdate],
  )

  return (
    <div className={styles.layout} data-testid="settings-view">
      {/* Sidebar */}
      <nav className={styles.sidebar}>
        <h2 className={styles.sidebarTitle}>Settings</h2>
        <div className={styles.nav} role="tablist" aria-label="Settings categories">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.navItem} ${activeTab === tab.id ? styles.navItemActive : ''}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`settings-panel-${tab.id}`}
              id={`settings-tab-${tab.id}`}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.Icon size={16} aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className={styles.content}>
        {/* General */}
        {activeTab === 'general' && (
          <div
            role="tabpanel"
            id="settings-panel-general"
            aria-labelledby="settings-tab-general"
          >
            <h3 className={styles.contentHeader}>General</h3>

            <div className={styles.card}>
              <div className={styles.row}>
                <div>
                  <div className={styles.label}>Overlay hotkey</div>
                  <div className={styles.description}>Keyboard shortcut to show/hide Flint</div>
                </div>
                <span className={styles.mono}>{config.hotkey}</span>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.row}>
                <div>
                  <div className={styles.label}>Launch at login</div>
                  <div className={styles.description}>Start Flint when you log in</div>
                </div>
                <button
                  className={`${styles.toggle} ${config.launchAtLogin ? styles.toggleOn : ''}`}
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
                <div>
                  <div className={styles.label}>Show tray icon</div>
                  <div className={styles.description}>Display Flint in the menu bar</div>
                </div>
                <button
                  className={`${styles.toggle} ${config.showTrayIcon ? styles.toggleOn : ''}`}
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
        )}

        {/* AI & Models */}
        {activeTab === 'ai' && (
          <div
            role="tabpanel"
            id="settings-panel-ai"
            aria-labelledby="settings-tab-ai"
          >
            <h3 className={styles.contentHeader}>AI &amp; Models</h3>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Chat</div>
              <div className={styles.row}>
                <div>
                  <div className={styles.label}>Model</div>
                  <div className={styles.description}>Model used for chat conversations</div>
                </div>
                <ModelSelect
                  value={config.model}
                  onChange={(id) => {
                    onUpdate({ model: id })
                    window.flint?.setModel(id)
                  }}
                  ariaLabel="Chat model"
                />
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Background Agent</div>
              <div className={styles.row}>
                <div>
                  <div className={styles.label}>Background polling</div>
                  <div className={styles.description}>
                    Periodically check for new attention items
                  </div>
                </div>
                <button
                  className={`${styles.toggle} ${config.pollEnabled ? styles.toggleOn : ''}`}
                  type="button"
                  role="switch"
                  aria-checked={config.pollEnabled}
                  aria-label="Background polling"
                  onClick={() => onUpdate({ pollEnabled: !config.pollEnabled })}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
              <div
                className={styles.row}
                style={{ opacity: config.pollEnabled ? 1 : 0.5 }}
              >
                <div>
                  <div className={styles.label}>Poll frequency</div>
                </div>
                <SegmentedControl
                  options={POLL_FREQUENCY_OPTIONS.map((o) => ({
                    ...o,
                    disabled: !config.pollEnabled,
                  }))}
                  value={config.pollFrequency}
                  onChange={(v) => onUpdate({ pollFrequency: v })}
                  ariaLabel="Poll frequency"
                />
              </div>
              <div className={styles.row}>
                <div>
                  <div className={styles.label}>Poll model</div>
                  <div className={styles.description}>Lighter model for background checks</div>
                </div>
                <ModelSelect
                  value={config.pollModel}
                  onChange={(id) => onUpdate({ pollModel: id })}
                  ariaLabel="Poll model"
                />
              </div>
            </div>
          </div>
        )}

        {/* Notifications */}
        {activeTab === 'notifications' && (
          <div
            role="tabpanel"
            id="settings-panel-notifications"
            aria-labelledby="settings-tab-notifications"
          >
            <h3 className={styles.contentHeader}>Notifications</h3>

            <div className={styles.card}>
              <div className={styles.row}>
                <div>
                  <div className={styles.label}>Alert before meeting</div>
                  <div className={styles.description}>How far in advance to notify you</div>
                </div>
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

            <div className={styles.card}>
              <div className={styles.row}>
                <div>
                  <div className={styles.label}>Test notification</div>
                  <div className={styles.description}>
                    Send a test notification to verify they work
                  </div>
                </div>
                <button
                  className={styles.ghostButton}
                  type="button"
                  onClick={() => window.flint?.testNotification()}
                >
                  Send test
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Appearance */}
        {activeTab === 'appearance' && (
          <div
            role="tabpanel"
            id="settings-panel-appearance"
            aria-labelledby="settings-tab-appearance"
          >
            <h3 className={styles.contentHeader}>Appearance</h3>

            <div className={styles.card}>
              <div className={styles.row}>
                <div>
                  <div className={styles.label}>Theme</div>
                  <div className={styles.description}>Choose your color scheme</div>
                </div>
                <SegmentedControl
                  options={[
                    { label: 'Dark', value: 'dark' },
                    { label: 'Light', value: 'light', disabled: true, disabledLabel: 'Soon' },
                  ]}
                  value="dark"
                  onChange={() => {}}
                  ariaLabel="Theme"
                />
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.row}>
                <div>
                  <div className={styles.label}>Font size</div>
                  <div className={styles.description}>Adjust text size across the interface</div>
                </div>
                <SegmentedControl
                  options={FONT_SIZE_OPTIONS}
                  value={config.fontSize}
                  onChange={handleFontSizeChange}
                  ariaLabel="Font size"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
