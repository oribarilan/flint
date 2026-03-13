import { useState, useEffect, useCallback } from "react";
import { getConfig, getDefaultConfig, updateConfig, type FlintConfig } from "../lib/commands";

export function useConfig() {
  const [config, setConfig] = useState<FlintConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getConfig()
      .then((cfg) => {
        setConfig(cfg);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        console.error("Failed to load config:", err);
        setIsLoading(false);
      });
  }, []);

  const update = useCallback(async (newConfig: FlintConfig) => {
    await updateConfig(newConfig);
    setConfig(newConfig);
  }, []);

  const resetSection = useCallback(
    async (section: keyof FlintConfig) => {
      if (!config) return;
      const defaults = await getDefaultConfig();
      const updated = { ...config, [section]: defaults[section] };
      await updateConfig(updated);
      setConfig(updated);
      return updated;
    },
    [config],
  );

  return { config, isLoading, update, resetSection };
}
