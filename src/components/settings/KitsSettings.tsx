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

      {kits.length === 0 && <p className={styles.emptyList}>No kits registered.</p>}

      {kits.map((kit) => {
        const expanded = expandedKit === kit.id;
        return (
          <section key={kit.id} className={styles.section}>
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
              <div className={kitStyles.commandList}>
                {kit.commands.map((cmd) => (
                  <CommandRow
                    key={cmd.id}
                    cmd={cmd}
                    kitId={kit.id}
                    enabled={isCommandEnabled(kit.id, cmd.id)}
                    prefix={getCommandPrefix(kit.id, cmd.id, cmd.default_prefix ?? "")}
                    onToggle={() => {
                      handleCommandToggle(kit.id, cmd.id);
                    }}
                    onPrefixChange={(p) => {
                      handlePrefixChange(kit.id, cmd.id, p);
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CommandRow({
  cmd,
  kitId: _kitId,
  enabled,
  prefix,
  onToggle,
  onPrefixChange,
}: {
  cmd: CommandInfo;
  kitId: string;
  enabled: boolean;
  prefix: string;
  onToggle: () => void;
  onPrefixChange: (prefix: string) => void;
}) {
  return (
    <div className={kitStyles.commandRow}>
      <div className={kitStyles.commandInfo}>
        <span className={kitStyles.commandName}>{cmd.name}</span>
        <div className={kitStyles.prefixField}>
          <label className={kitStyles.prefixLabel}>Prefix</label>
          <input
            className={kitStyles.prefixInput}
            type="text"
            value={prefix}
            onChange={(e) => {
              onPrefixChange(e.target.value);
            }}
            placeholder="none"
            aria-label={`Prefix for ${cmd.name}`}
          />
        </div>
      </div>
      <button
        className={enabled ? styles.toggleOn : styles.toggle}
        onClick={onToggle}
        aria-label={`Toggle ${cmd.name}`}
      />
    </div>
  );
}
