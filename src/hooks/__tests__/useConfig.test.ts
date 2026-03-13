import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import type { FlintConfig } from "../../lib/commands";

const mockGetConfig = vi.fn<() => Promise<FlintConfig>>();
const mockUpdateConfig = vi.fn<(config: FlintConfig) => Promise<void>>();

vi.mock("../../lib/commands", () => ({
  getConfig: (...args: unknown[]) => mockGetConfig(...(args as [])),
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...(args as [FlintConfig])),
}));

import { useConfig } from "../useConfig";

const DEFAULT_CONFIG: FlintConfig = {
  general: { hotkey: "CmdOrCtrl+Space", launch_at_login: false },
  search: { directories: ["/Users/test"], exclude: ["node_modules"], max_depth: 5 },
  chat: { default_model: "gpt-4o" },
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
});
