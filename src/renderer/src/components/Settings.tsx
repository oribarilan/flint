import { useState, useCallback, useMemo } from "react";
import { Sun, Cpu, Bell, Contrast, PanelTop } from "lucide-react";
import { SegmentedControl } from "./SegmentedControl";
import { ModelSelect } from "./ModelSelect";
import { formatMenubarText } from "../../../main/lib/menubar-format";
import type { FlintConfig, MenubarTimeStyle } from "../../../main/types";
import styles from "./Settings.module.css";

type SettingsTab = "general" | "menubar" | "ai" | "notifications" | "appearance";

interface SettingsProps {
  config: FlintConfig;
  onUpdate: (partial: Partial<FlintConfig>) => void;
}

const TABS: { id: SettingsTab; label: string; Icon: typeof Sun }[] = [
  { id: "general", label: "General", Icon: Sun },
  { id: "menubar", label: "Menubar", Icon: PanelTop },
  { id: "ai", label: "AI & Models", Icon: Cpu },
  { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "appearance", label: "Appearance", Icon: Contrast },
];

export function Settings({ config, onUpdate }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  // Live preview: sample meeting 32 min from "now"
  const previewText = useMemo(() => {
    if (!config.menubarEnabled) return "";
    const sampleMeeting = {
      id: "preview",
      title: "Sprint Planning",
      startTime: new Date(Date.now() + 32 * 60_000).toISOString(),
      endTime: new Date(Date.now() + 62 * 60_000).toISOString(),
      attendees: [],
      organizer: "you",
    };
    return formatMenubarText(
      { meeting: sampleMeeting, isActive: false },
      config.menubarTime,
      config.menubarTitle,
      Date.now(),
    );
  }, [config.menubarEnabled, config.menubarTime, config.menubarTitle]);

  const handleAlertChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const value = Math.max(1, Math.min(60, Number(e.target.value) || 1));
      onUpdate({ alertMinutes: value });
    },
    [onUpdate],
  );

  return (
    <div className={styles.layout} data-testid="settings-view">
      {/* Sidebar */}
      <nav className={styles.sidebar}>
        <h2 className={styles.sidebarTitle}>Settings</h2>
        <div className={styles.nav} role="tablist" aria-label="Settings categories">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.navItem} ${activeTab === tab.id ? styles.navItemActive : ""}`}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`settings-panel-${tab.id}`}
              id={`settings-tab-${tab.id}`}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
              }}
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
        {activeTab === "general" && (
          <div role="tabpanel" id="settings-panel-general" aria-labelledby="settings-tab-general">
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
                  className={`${styles.toggle} ${config.launchAtLogin ? styles.toggleOn : ""}`}
                  type="button"
                  role="switch"
                  aria-checked={config.launchAtLogin}
                  aria-label="Launch at login"
                  onClick={() => {
                    onUpdate({ launchAtLogin: !config.launchAtLogin });
                  }}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Menubar */}
        {activeTab === "menubar" && (
          <div
            role="tabpanel"
            id="settings-panel-menubar"
            aria-labelledby="settings-tab-menubar"
          >
            <h3 className={styles.contentHeader}>Menubar</h3>

            <div className={styles.card}>
              <div className={styles.row}>
                <div>
                  <div className={styles.label}>Show tray icon</div>
                  <div className={styles.description}>Display Flint in the menu bar</div>
                </div>
                <button
                  className={`${styles.toggle} ${config.showTrayIcon ? styles.toggleOn : ""}`}
                  type="button"
                  role="switch"
                  aria-checked={config.showTrayIcon}
                  aria-label="Show tray icon"
                  onClick={() => {
                    onUpdate({ showTrayIcon: !config.showTrayIcon });
                  }}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Event display</div>
              {/* Live preview */}
              <div className={styles.menubarPreview} aria-label="Menubar preview">
                <div className={styles.previewBar}>
                  {/* Flint tray section */}
                  <svg
                    className={styles.previewIcon}
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 1.5L4 5.5L5.5 7L8 4.5L10.5 7L12 5.5L8 1.5Z" />
                    <path d="M8 7.5L4 11.5L5.5 13L8 10.5L10.5 13L12 11.5L8 7.5Z" />
                  </svg>
                  {previewText && (
                    <span className={styles.previewText}>{previewText}</span>
                  )}

                  {/* System tray items (decorative context) */}
                  <span className={styles.previewSpacer} />
                  <svg
                    className={styles.previewSysIcon}
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 3C5.2 3 2.8 4.5 1.5 6.8L3 8c1-1.6 2.8-2.7 5-2.7s4 1.1 5 2.7l1.5-1.2C13.2 4.5 10.8 3 8 3z" opacity=".35" />
                    <path d="M8 6.3c-1.7 0-3.2.8-4.2 2L5.3 9.5c.7-.8 1.6-1.2 2.7-1.2s2 .4 2.7 1.2l1.5-1.2c-1-1.2-2.5-2-4.2-2z" opacity=".6" />
                    <circle cx="8" cy="11.5" r="1.5" />
                  </svg>
                  <svg
                    className={styles.previewSysIcon}
                    viewBox="0 0 20 12"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <rect x="0.5" y="0.5" width="17" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1" opacity=".5" />
                    <rect x="18.5" y="3.5" width="1.5" height="5" rx="0.75" opacity=".35" />
                    <rect x="2" y="2" width="11" height="8" rx="1" />
                  </svg>
                  <span className={styles.previewClock}>10:01</span>
                </div>
              </div>

              <div className={styles.row}>
                <div>
                  <div className={styles.label}>Show events</div>
                  <div className={styles.description}>
                    Display upcoming meeting info in the menu bar
                  </div>
                </div>
                <button
                  className={`${styles.toggle} ${config.menubarEnabled ? styles.toggleOn : ""}`}
                  type="button"
                  role="switch"
                  aria-checked={config.menubarEnabled}
                  aria-label="Show events in menubar"
                  onClick={() => {
                    onUpdate({ menubarEnabled: !config.menubarEnabled });
                  }}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>

              {config.menubarEnabled && (
                <>
                  <div className={styles.row}>
                    <div>
                      <div className={styles.label}>Time</div>
                      <div className={styles.description}>
                        How to show when the next meeting starts
                      </div>
                    </div>
                    <SegmentedControl<MenubarTimeStyle>
                      options={[
                        { label: "Off", value: "off" },
                        { label: "Start time", value: "next-time" },
                        { label: "Countdown", value: "countdown" },
                      ]}
                      value={config.menubarTime}
                      onChange={(val) => {
                        onUpdate({ menubarTime: val });
                      }}
                      ariaLabel="Menubar time style"
                    />
                  </div>
                  <div className={styles.row}>
                    <div>
                      <div className={styles.label}>Meeting title</div>
                      <div className={styles.description}>
                        Show the name of the next meeting
                      </div>
                    </div>
                    <button
                      className={`${styles.toggle} ${config.menubarTitle ? styles.toggleOn : ""}`}
                      type="button"
                      role="switch"
                      aria-checked={config.menubarTitle}
                      aria-label="Show meeting title in menubar"
                      onClick={() => {
                        onUpdate({ menubarTitle: !config.menubarTitle });
                      }}
                    >
                      <span className={styles.toggleKnob} />
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.cardTitle}>Spotlight</div>
              <div className={styles.row}>
                <div>
                  <div className={styles.label}>Meeting spotlight</div>
                  <div className={styles.description}>
                    Full-screen prompt before meetings start
                  </div>
                </div>
                <button
                  className={`${styles.toggle} ${config.spotlightEnabled ? styles.toggleOn : ""}`}
                  type="button"
                  role="switch"
                  aria-checked={config.spotlightEnabled}
                  aria-label="Meeting spotlight"
                  onClick={() => {
                    onUpdate({ spotlightEnabled: !config.spotlightEnabled });
                  }}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
              {config.spotlightEnabled && (
                <div className={styles.row}>
                  <div>
                    <div className={styles.label}>Show before meeting</div>
                    <div className={styles.description}>
                      How early to show the spotlight prompt
                    </div>
                  </div>
                  <div>
                    <input
                      className={styles.numberInput}
                      type="number"
                      min={1}
                      max={30}
                      value={config.spotlightMinutes}
                      onChange={(e) => {
                        const value = Math.max(1, Math.min(30, Number(e.target.value) || 1));
                        onUpdate({ spotlightMinutes: value });
                      }}
                      aria-label="Minutes before meeting for spotlight"
                    />
                    <span className={styles.unit}>min</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI & Models */}
        {activeTab === "ai" && (
          <div role="tabpanel" id="settings-panel-ai" aria-labelledby="settings-tab-ai">
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
                    onUpdate({ model: id });
                    window.flint?.setModel(id);
                  }}
                  ariaLabel="Chat model"
                />
              </div>
            </div>
          </div>
        )}

        {/* Notifications */}
        {activeTab === "notifications" && (
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
                  onClick={() => {
                    window.flint?.testNotification();
                  }}
                >
                  Send test
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Appearance */}
        {activeTab === "appearance" && (
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
                <SegmentedControl<FlintConfig["theme"]>
                  options={[
                    { label: "Dark", value: "dark" },
                    { label: "Light", value: "light" },
                    { label: "System", value: "system" },
                  ]}
                  value={config.theme}
                  onChange={(val) => {
                    document.documentElement.dataset.theme = val;
                    onUpdate({ theme: val });
                  }}
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
                <SegmentedControl<FlintConfig["fontSize"]>
                  options={[
                    { label: "XS", value: "extra-small" },
                    { label: "S", value: "small" },
                    { label: "M", value: "medium" },
                    { label: "L", value: "large" },
                  ]}
                  value={config.fontSize}
                  onChange={(val) => {
                    document.documentElement.dataset.fontSize = val;
                    onUpdate({ fontSize: val });
                  }}
                  ariaLabel="Font size"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
