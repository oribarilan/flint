import { useState, useEffect, useRef } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import type { FlintConfig, KitManifestInfo, CommandInfo } from "../../lib/commands";
import { getKitManifests } from "../../lib/commands";
import styles from "./settings.module.css";
import kitStyles from "./KitsSettings.module.css";

interface KitsSettingsProps {
  config: FlintConfig;
  onUpdate: (config: FlintConfig) => Promise<void>;
}

export default function KitsSettings({ config, onUpdate }: KitsSettingsProps) {
  const [kits, setKits] = useState<KitManifestInfo[]>([]);
  const [expandedKit, setExpandedKit] = useState<string | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);
  const initialConfigRef = useRef<string>("");

  useEffect(() => {
    getKitManifests()
      .then((manifests) => {
        setKits(manifests);
        initialConfigRef.current = JSON.stringify(config.kits);
      })
      .catch((err: unknown) => {
        console.error("Failed to load kit manifests:", err);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const markDirty = (newConfig: FlintConfig) => {
    if (JSON.stringify(newConfig.kits) !== initialConfigRef.current) {
      setNeedsRestart(true);
    }
  };

  const isKitEnabled = (kitId: string): boolean => {
    return config.kits[kitId]?.enabled ?? true;
  };

  const isCommandEnabled = (kitId: string, commandId: string): boolean => {
    return config.kits[kitId]?.commands?.[commandId]?.enabled ?? true;
  };

  const getCommandPrefix = (kitId: string, commandId: string, defaultPrefix: string): string => {
    return config.kits[kitId]?.commands?.[commandId]?.prefix ?? defaultPrefix;
  };

  const getCommandHotkey = (kitId: string, commandId: string): string => {
    return config.kits[kitId]?.commands?.[commandId]?.hotkey ?? "";
  };

  const updateKitConfig = (kitId: string, patch: Record<string, unknown>) => {
    const next = {
      ...config,
      kits: { ...config.kits, [kitId]: { ...config.kits[kitId], ...patch } },
    };
    markDirty(next);
    void onUpdate(next);
  };

  const handleKitToggle = (kitId: string) => {
    updateKitConfig(kitId, { enabled: !isKitEnabled(kitId) });
  };

  const handleCommandToggle = (kitId: string, commandId: string) => {
    const cmds = (config.kits[kitId]?.commands as Record<string, Record<string, unknown>>) ?? {};
    updateKitConfig(kitId, {
      commands: {
        ...cmds,
        [commandId]: { ...cmds[commandId], enabled: !isCommandEnabled(kitId, commandId) },
      },
    });
  };

  const handlePrefixChange = (kitId: string, commandId: string, prefix: string) => {
    const cmds = (config.kits[kitId]?.commands as Record<string, Record<string, unknown>>) ?? {};
    updateKitConfig(kitId, {
      commands: {
        ...cmds,
        [commandId]: { ...cmds[commandId], prefix: prefix || undefined },
      },
    });
  };

  const handleHotkeyChange = (kitId: string, commandId: string, hotkey: string) => {
    const cmds = (config.kits[kitId]?.commands as Record<string, Record<string, unknown>>) ?? {};
    updateKitConfig(kitId, {
      commands: {
        ...cmds,
        [commandId]: { ...cmds[commandId], hotkey: hotkey || undefined },
      },
    });
  };

  const handleRestart = () => {
    relaunch().catch((err: unknown) => {
      console.error("Failed to restart:", err);
    });
  };

  return (
    <div className={styles.page}>
      <h2 className={styles.pageTitle}>Kits</h2>

      {needsRestart && (
        <div className={kitStyles.restartBanner}>
          <span>Restart required to apply changes</span>
          <button className={styles.button} onClick={handleRestart}>
            Restart
          </button>
        </div>
      )}

      {kits.length === 0 && (
        <p className={styles.emptyList}>
          Kits extend Flint with new commands and integrations. Built-in kits will appear here after first launch.
        </p>
      )}

      {kits.map((kit) => {
        const expanded = expandedKit === kit.id;
        return (
          <div key={kit.id} className={kitStyles.kitSection}>
            <div className={kitStyles.kitHeader}>
              <button
                className={kitStyles.kitTitle}
                onClick={() => {
                  setExpandedKit(expanded ? null : kit.id);
                }}
              >
                <span className={kitStyles.chevron}>{expanded ? "▾" : "▸"}</span>
                {kit.name}
              </button>
              <button
                className={isKitEnabled(kit.id) ? styles.toggleOn : styles.toggle}
                onClick={() => {
                  handleKitToggle(kit.id);
                }}
                aria-label={`Toggle ${kit.name}`}
              />
            </div>

            {expanded && (
              <table className={kitStyles.commandTable}>
                <thead>
                  <tr>
                    <th className={kitStyles.thCommand}>Command</th>
                    <th className={kitStyles.thPrefix}>Prefix</th>
                    <th className={kitStyles.thHotkey}>Hotkey</th>
                    <th className={kitStyles.thToggle}>On</th>
                  </tr>
                </thead>
                <tbody>
                  {kit.commands.map((cmd) => (
                    <CommandRow
                      key={cmd.id}
                      cmd={cmd}
                      kitId={kit.id}
                      enabled={isCommandEnabled(kit.id, cmd.id)}
                      prefix={getCommandPrefix(kit.id, cmd.id, cmd.default_prefix ?? "")}
                      hotkey={getCommandHotkey(kit.id, cmd.id)}
                      onToggle={() => {
                        handleCommandToggle(kit.id, cmd.id);
                      }}
                      onPrefixChange={(p) => {
                        handlePrefixChange(kit.id, cmd.id, p);
                      }}
                      onHotkeyChange={(h) => {
                        handleHotkeyChange(kit.id, cmd.id, h);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Editable field that shows a capsule with × clear button when a value exists. */
function ClearableField({
  value,
  placeholder,
  onChange,
  ariaLabel,
  className,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className: string;
}) {
  if (value) {
    return (
      <span className={kitStyles.capsule}>
        <input
          className={className}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          aria-label={ariaLabel}
        />
        <button
          className={kitStyles.capsuleClear}
          onClick={() => {
            onChange("");
          }}
          aria-label={`Clear ${ariaLabel}`}
        >
          ×
        </button>
      </span>
    );
  }

  return (
    <input
      className={className}
      type="text"
      value=""
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
      }}
      aria-label={ariaLabel}
    />
  );
}

function CommandRow({
  cmd,
  kitId: _kitId,
  enabled,
  prefix,
  hotkey,
  onToggle,
  onPrefixChange,
  onHotkeyChange,
}: {
  cmd: CommandInfo;
  kitId: string;
  enabled: boolean;
  prefix: string;
  hotkey: string;
  onToggle: () => void;
  onPrefixChange: (prefix: string) => void;
  onHotkeyChange: (hotkey: string) => void;
}) {
  return (
    <tr className={kitStyles.tableRow}>
      <td className={kitStyles.tdCommand}>
        <span className={kitStyles.commandName}>{cmd.name}</span>
      </td>
      <td className={kitStyles.tdPrefix}>
        <ClearableField
          value={prefix}
          placeholder="none"
          onChange={onPrefixChange}
          ariaLabel={`Prefix for ${cmd.name}`}
          className={kitStyles.prefixInput}
        />
      </td>
      <td className={kitStyles.tdHotkey}>
        <ClearableField
          value={hotkey}
          placeholder="none"
          onChange={onHotkeyChange}
          ariaLabel={`Hotkey for ${cmd.name}`}
          className={kitStyles.hotkeyInput}
        />
      </td>
      <td className={kitStyles.tdToggle}>
        <button
          className={enabled ? styles.toggleOn : styles.toggle}
          onClick={onToggle}
          aria-label={`Toggle ${cmd.name}`}
        />
      </td>
    </tr>
  );
}
