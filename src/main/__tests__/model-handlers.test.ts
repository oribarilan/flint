import { describe, it, expect, vi } from "vitest";
import {
  filterModels,
  handleSetModel,
  type RawModelInfo,
  type SetModelDeps,
} from "../ipc/model-handlers";

describe("filterModels", () => {
  it("returns enabled models with id and name only", () => {
    const models: RawModelInfo[] = [
      { id: "gpt-4.1", name: "GPT 4.1", policy: { state: "enabled" } },
      { id: "claude-sonnet-4", name: "Claude Sonnet" },
    ];

    expect(filterModels(models)).toEqual([
      { id: "gpt-4.1", name: "GPT 4.1" },
      { id: "claude-sonnet-4", name: "Claude Sonnet" },
    ]);
  });

  it("filters out disabled models", () => {
    const models: RawModelInfo[] = [
      { id: "gpt-4.1", name: "GPT 4.1", policy: { state: "enabled" } },
      { id: "old-model", name: "Old Model", policy: { state: "disabled" } },
    ];

    expect(filterModels(models)).toEqual([{ id: "gpt-4.1", name: "GPT 4.1" }]);
  });

  it("includes models with undefined policy", () => {
    const models: RawModelInfo[] = [{ id: "gpt-4.1", name: "GPT 4.1" }];

    expect(filterModels(models)).toEqual([{ id: "gpt-4.1", name: "GPT 4.1" }]);
  });

  it("returns empty array for empty input", () => {
    expect(filterModels([])).toEqual([]);
  });

  it("filters all when all disabled", () => {
    const models: RawModelInfo[] = [
      { id: "a", name: "A", policy: { state: "disabled" } },
      { id: "b", name: "B", policy: { state: "disabled" } },
    ];

    expect(filterModels(models)).toEqual([]);
  });
});

describe("handleSetModel", () => {
  function createMockDeps(overrides: Partial<SetModelDeps> = {}): SetModelDeps & {
    mockSetModel: ReturnType<typeof vi.fn>;
    mockUpdate: ReturnType<typeof vi.fn>;
    mockSend: ReturnType<typeof vi.fn>;
  } {
    const mockSetModel = vi.fn().mockResolvedValue(undefined);
    const mockUpdate = vi.fn();
    const mockSend = vi.fn();
    return {
      session: { setModel: mockSetModel },
      configStore: {
        getAll: vi.fn(),
        update: mockUpdate,
      } as unknown as SetModelDeps["configStore"],
      sendToRenderer: mockSend,
      mockSetModel,
      mockUpdate,
      mockSend,
      ...overrides,
    };
  }

  it("persists to config and notifies renderer when session exists", async () => {
    const deps = createMockDeps();

    await handleSetModel("claude-sonnet-4", deps);

    expect(deps.mockSetModel).toHaveBeenCalledWith("claude-sonnet-4");
    expect(deps.mockUpdate).toHaveBeenCalledWith({ model: "claude-sonnet-4" });
    expect(deps.mockSend).toHaveBeenCalledWith("claude-sonnet-4");
  });

  it("persists and notifies without calling setModel when no session", async () => {
    const deps = createMockDeps({ session: null });

    await handleSetModel("gpt-4.1", deps);

    expect(deps.mockUpdate).toHaveBeenCalledWith({ model: "gpt-4.1" });
    expect(deps.mockSend).toHaveBeenCalledWith("gpt-4.1");
  });

  it("does not update config or notify renderer when setModel throws", async () => {
    const mockSetModel = vi.fn().mockRejectedValue(new Error("model not found"));
    const deps = createMockDeps({
      session: { setModel: mockSetModel },
    });

    await expect(handleSetModel("bad-model", deps)).rejects.toThrow("model not found");

    expect(deps.mockUpdate).not.toHaveBeenCalled();
    expect(deps.mockSend).not.toHaveBeenCalled();
  });

  it("calls setModel before persisting (order matters)", async () => {
    const callOrder: string[] = [];
    const mockSetModel = vi.fn().mockImplementation(() => {
      callOrder.push("setModel");
    });
    const mockUpdate = vi.fn().mockImplementation(() => {
      callOrder.push("update");
    });
    const mockSend = vi.fn().mockImplementation(() => {
      callOrder.push("send");
    });

    await handleSetModel("gpt-4.1", {
      session: { setModel: mockSetModel },
      configStore: {
        getAll: vi.fn(),
        update: mockUpdate,
      } as unknown as SetModelDeps["configStore"],
      sendToRenderer: mockSend,
    });

    expect(callOrder).toEqual(["setModel", "update", "send"]);
  });
});
