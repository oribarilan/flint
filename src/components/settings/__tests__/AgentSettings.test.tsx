import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import type { FlintConfig } from "../../../lib/commands";

const {
  mockGetChatStatus,
  mockInitOpencode,
  mockGetAvailableModels,
  mockGetProjectModelConfigStatus,
} = vi.hoisted(() => ({
  mockGetChatStatus: vi.fn<() => Promise<unknown>>(),
  mockInitOpencode: vi.fn<() => Promise<unknown>>(),
  mockGetAvailableModels: vi.fn<() => Promise<unknown>>(),
  mockGetProjectModelConfigStatus: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("../../../lib/commands", () => ({
  getChatStatus: mockGetChatStatus,
  initOpencode: mockInitOpencode,
  getAvailableModels: mockGetAvailableModels,
  getProjectModelConfigStatus: mockGetProjectModelConfigStatus,
}));

function makeConfig(
  overrides: Partial<FlintConfig["second_brain"] & FlintConfig["chat"]> = {},
): FlintConfig {
  return {
    general: {
      hotkey: "CmdOrCtrl+Space",
      launch_at_login: false,
      terminal: "iTerm",
      editor: "code",
    },
    appearance: { font_size: "14px", theme: "dark", backdrop_blur: true },
    search: { directories: [] },
    chat: { default_model: overrides.default_model ?? "anthropic/claude-sonnet-4" },
    second_brain: { repo_path: overrides.repo_path ?? null },
    kits: {},
  };
}

const noop = vi.fn(() => Promise.resolve(undefined));

import AgentSettings from "../AgentSettings";

beforeEach(() => {
  vi.stubGlobal("__TAURI_INTERNALS__", {
    invoke: vi.fn(),
    transformCallback: vi.fn(),
    convertFileSrc: vi.fn(),
    unregisterCallback: vi.fn(),
    metadata: {
      currentWindow: { label: "main" },
      currentWebview: { label: "main" },
    },
  });

  vi.clearAllMocks();
  mockGetChatStatus.mockResolvedValue({ connected: false, session_id: null, repo_path: null });
  mockInitOpencode.mockResolvedValue(undefined);
  mockGetAvailableModels.mockResolvedValue([[], null]);
  mockGetProjectModelConfigStatus.mockResolvedValue({
    exists: false,
    has_model: false,
    model: null,
    path: "",
  });
});

describe("AgentSettings", () => {
  it("renders repo path input and action buttons", async () => {
    render(<AgentSettings config={makeConfig()} onUpdate={noop} onResetSection={noop} />);

    expect(await screen.findByRole("heading", { name: "Agent" })).toBeTruthy();
    expect(screen.getByLabelText("Second brain repository path")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Browse" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restart OpenCode" })).toBeTruthy();
  });

  it("save validates empty repo path", async () => {
    render(<AgentSettings config={makeConfig()} onUpdate={noop} onResetSection={noop} />);

    const input = screen.getByLabelText("Second brain repository path");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Repository path is required.")).toBeTruthy();
    expect(noop).not.toHaveBeenCalled();
  });

  it("save persists repo path and reconnects", async () => {
    const onUpdate = vi.fn(() => Promise.resolve(undefined));
    render(<AgentSettings config={makeConfig()} onUpdate={onUpdate} onResetSection={noop} />);

    const input = screen.getByLabelText("Second brain repository path");
    fireEvent.change(input, { target: { value: "/Users/me/brain" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          second_brain: expect.objectContaining({ repo_path: "/Users/me/brain" }) as object,
        }),
      );
    });

    expect(mockInitOpencode).toHaveBeenCalled();
  });

  it("restart button calls init and handles failure message", async () => {
    mockInitOpencode.mockRejectedValue(new Error("Restart failed"));
    render(
      <AgentSettings
        config={makeConfig({ repo_path: "/brain" })}
        onUpdate={noop}
        onResetSection={noop}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Restart OpenCode" }));
    expect(await screen.findByText("Restart failed")).toBeTruthy();
  });

  it("shows default-model section even when models unavailable", async () => {
    mockGetChatStatus.mockResolvedValue({
      connected: false,
      session_id: null,
      repo_path: "/brain",
    });
    mockGetAvailableModels.mockResolvedValue([[], null]);

    render(
      <AgentSettings
        config={makeConfig({ repo_path: "/brain", default_model: "anthropic/claude-sonnet-4" })}
        onUpdate={noop}
        onResetSection={noop}
      />,
    );

    expect(await screen.findByText("Default Model")).toBeTruthy();
    expect(
      screen.getByText("No models available right now. Reconnect and try again."),
    ).toBeTruthy();
  });

  it("renders model select when models exist and updates config", async () => {
    mockGetAvailableModels.mockResolvedValue([
      [
        {
          id: "anthropic/claude-sonnet-4",
          name: "Claude Sonnet 4",
          provider_id: "anthropic",
          provider_name: "Anthropic",
        },
        {
          id: "openai/gpt-4o",
          name: "GPT-4o",
          provider_id: "openai",
          provider_name: "OpenAI",
        },
      ],
      "anthropic/claude-sonnet-4",
    ]);

    const onUpdate = vi.fn(() => Promise.resolve(undefined));

    render(
      <AgentSettings
        config={makeConfig({ repo_path: "/brain", default_model: "anthropic/claude-sonnet-4" })}
        onUpdate={onUpdate}
        onResetSection={noop}
      />,
    );

    const select = await screen.findByRole("combobox");
    act(() => {
      fireEvent.change(select, { target: { value: "openai/gpt-4o" } });
    });

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        chat: expect.objectContaining({ default_model: "openai/gpt-4o" }) as object,
      }),
    );
  });

  it("Enter key on path input triggers save", async () => {
    const onUpdate = vi.fn(() => Promise.resolve(undefined));
    render(<AgentSettings config={makeConfig()} onUpdate={onUpdate} onResetSection={noop} />);

    const input = screen.getByLabelText("Second brain repository path");
    fireEvent.change(input, { target: { value: "/tmp/brain" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          second_brain: expect.objectContaining({ repo_path: "/tmp/brain" }) as object,
        }),
      );
    });
  });
});
