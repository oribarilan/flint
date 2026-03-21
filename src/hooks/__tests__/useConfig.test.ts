import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import type { FlintConfig } from "../../lib/commands";

const mockGetConfig = vi.fn<() => Promise<FlintConfig>>();
const mockGetDefaultConfig = vi.fn<() => Promise<FlintConfig>>();
const mockUpdateConfig = vi.fn<(config: FlintConfig) => Promise<void>>();

vi.mock("../../lib/commands", () => ({
  getConfig: (...args: unknown[]) => mockGetConfig(...(args as [])),
  getDefaultConfig: (...args: unknown[]) => mockGetDefaultConfig(...(args as [])),
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...(args as [FlintConfig])),
}));

import { useConfig } from "../useConfig";

const DEFAULT_CONFIG: FlintConfig = {
  general: { hotkey: "CmdOrCtrl+Space", launch_at_login: false, terminal: "auto", editor: "auto" },
  appearance: { font_size: "medium", theme: "flint", backdrop_blur: false },
  search: { directories: ["/Users/test"] },
  chat: { default_model: "gpt-4o" },
  second_brain: { repo_path: null },
  kits: {},
  monitored_servers: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  mockGetConfig.mockResolvedValue(DEFAULT_CONFIG);
  mockUpdateConfig.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("useConfig", () => {
  it("should load config on mount", async () => {
    const { result } = renderHook(() => useConfig());

    await waitFor(() => {
      expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });

    expect(mockGetConfig).toHaveBeenCalledOnce();
  });

  it("should set isLoading false after load", async () => {
    const { result } = renderHook(() => useConfig());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.config).toEqual(DEFAULT_CONFIG);
  });

  it("should handle load error gracefully", async () => {
    mockGetConfig.mockRejectedValue(new Error("disk error"));
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useConfig());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.config).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith("Failed to load config:", expect.any(Error));

    consoleSpy.mockRestore();
  });

  it("should call updateConfig and update local state", async () => {
    const { result } = renderHook(() => useConfig());

    await waitFor(() => {
      expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });

    const updated: FlintConfig = {
      ...DEFAULT_CONFIG,
      general: { ...DEFAULT_CONFIG.general, hotkey: "Alt+Space" },
    };

    await act(async () => {
      await result.current.update(updated);
    });

    expect(mockUpdateConfig).toHaveBeenCalledWith(updated);
    expect(result.current.config).toEqual(updated);
  });

  it("should reset a section to defaults", async () => {
    const DEFAULTS: FlintConfig = {
      general: {
        hotkey: "CmdOrCtrl+Shift+Space",
        launch_at_login: false,
        terminal: "auto",
        editor: "auto",
      },
      appearance: { font_size: "small", theme: "flint", backdrop_blur: false },
      search: { directories: ["~/Desktop"] },
      chat: { default_model: "gpt-4.1" },
      second_brain: { repo_path: null },
      kits: {},
      monitored_servers: [],
    };
    mockGetDefaultConfig.mockResolvedValue(DEFAULTS);

    const { result } = renderHook(() => useConfig());
    await waitFor(() => {
      expect(result.current.config).toEqual(DEFAULT_CONFIG);
    });

    await act(async () => {
      const updated = await result.current.resetSection("chat");
      expect(updated?.chat).toEqual(DEFAULTS.chat);
    });

    expect(mockGetDefaultConfig).toHaveBeenCalledOnce();
    expect(mockUpdateConfig).toHaveBeenCalled();
    expect(result.current.config?.chat.default_model).toBe("gpt-4.1");
  });

  it("should return undefined when resetting before config loads", async () => {
    mockGetConfig.mockImplementation(
      () =>
        new Promise(() => {
          /* intentionally never resolves */
        }),
    );
    const { result } = renderHook(() => useConfig());

    // Config is still null
    const returned = await result.current.resetSection("general");
    expect(returned).toBeUndefined();
    expect(mockGetDefaultConfig).not.toHaveBeenCalled();
  });
});
