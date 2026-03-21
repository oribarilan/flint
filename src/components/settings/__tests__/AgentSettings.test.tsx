import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import type { FlintConfig, MonitoredServerConfig } from "../../../lib/commands";

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
    monitored_servers: [],
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

// ---------------------------------------------------------------------------
// Monitored servers section
// ---------------------------------------------------------------------------

function makeConfigWithServers(servers: MonitoredServerConfig[]): FlintConfig {
  return { ...makeConfig(), monitored_servers: servers };
}

describe("AgentSettings — Monitored Servers", () => {
  it("shows empty hint when no servers configured", async () => {
    render(<AgentSettings config={makeConfig()} onUpdate={noop} onResetSection={noop} />);
    expect(await screen.findByText(/No servers configured/i)).toBeTruthy();
  });

  it("shows Add button when no form is open", async () => {
    render(<AgentSettings config={makeConfig()} onUpdate={noop} onResetSection={noop} />);
    expect(await screen.findByRole("button", { name: "Add server" })).toBeTruthy();
  });

  it("opens add form when Add is clicked", async () => {
    render(<AgentSettings config={makeConfig()} onUpdate={noop} onResetSection={noop} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add server" }));
    expect(screen.getByLabelText("Server ID")).toBeTruthy();
    expect(screen.getByLabelText("Server host")).toBeTruthy();
    expect(screen.getByLabelText("Server port")).toBeTruthy();
    expect(screen.getByLabelText("Server label")).toBeTruthy();
  });

  it("cancel closes add form without saving", async () => {
    render(<AgentSettings config={makeConfig()} onUpdate={noop} onResetSection={noop} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add server" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Server ID")).toBeNull();
    expect(noop).not.toHaveBeenCalled();
  });

  it("validates empty ID before saving", async () => {
    render(<AgentSettings config={makeConfig()} onUpdate={noop} onResetSection={noop} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add server" }));

    // Clear the ID field and try to save.
    const idInput = screen.getByLabelText("Server ID");
    fireEvent.change(idInput, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("ID is required.")).toBeTruthy();
    expect(noop).not.toHaveBeenCalled();
  });

  it("validates empty host before saving", async () => {
    render(<AgentSettings config={makeConfig()} onUpdate={noop} onResetSection={noop} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add server" }));

    fireEvent.change(screen.getByLabelText("Server ID"), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Server host"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Host is required.")).toBeTruthy();
    expect(noop).not.toHaveBeenCalled();
  });

  it("validates invalid port before saving", async () => {
    render(<AgentSettings config={makeConfig()} onUpdate={noop} onResetSection={noop} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add server" }));

    fireEvent.change(screen.getByLabelText("Server ID"), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Server port"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Port must be 1–65535.")).toBeTruthy();
    expect(noop).not.toHaveBeenCalled();
  });

  it("saves valid new server and calls onUpdate", async () => {
    const onUpdate = vi.fn(() => Promise.resolve(undefined));
    render(<AgentSettings config={makeConfig()} onUpdate={onUpdate} onResetSection={noop} />);
    fireEvent.click(await screen.findByRole("button", { name: "Add server" }));

    fireEvent.change(screen.getByLabelText("Server ID"), { target: { value: "local" } });
    fireEvent.change(screen.getByLabelText("Server host"), { target: { value: "127.0.0.1" } });
    fireEvent.change(screen.getByLabelText("Server port"), { target: { value: "14097" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          monitored_servers: expect.arrayContaining([
            expect.objectContaining({ id: "local", host: "127.0.0.1", port: 14097 }) as object,
          ]) as object,
        }),
      );
    });
  });

  it("renders existing servers in the list", async () => {
    const servers: MonitoredServerConfig[] = [
      { id: "s1", host: "127.0.0.1", port: 14097, label: "Local" },
    ];
    render(
      <AgentSettings
        config={makeConfigWithServers(servers)}
        onUpdate={noop}
        onResetSection={noop}
      />,
    );
    expect(await screen.findByText("Local")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit server s1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove server s1" })).toBeTruthy();
  });

  it("remove server calls onUpdate with server excluded", async () => {
    const onUpdate = vi.fn(() => Promise.resolve(undefined));
    const servers: MonitoredServerConfig[] = [
      { id: "s1", host: "127.0.0.1", port: 14097, label: null },
      { id: "s2", host: "192.168.1.10", port: 14097, label: null },
    ];
    render(
      <AgentSettings
        config={makeConfigWithServers(servers)}
        onUpdate={onUpdate}
        onResetSection={noop}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Remove server s1" }));

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          monitored_servers: [expect.objectContaining({ id: "s2" }) as object],
        }),
      );
    });
  });

  it("edit opens inline form prefilled with server values", async () => {
    const servers: MonitoredServerConfig[] = [
      { id: "s1", host: "127.0.0.1", port: 14097, label: "My Server" },
    ];
    render(
      <AgentSettings
        config={makeConfigWithServers(servers)}
        onUpdate={noop}
        onResetSection={noop}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Edit server s1" }));

    const idInput = screen.getByLabelText<HTMLInputElement>("Server ID");
    expect(idInput.value).toBe("s1");
    const hostInput = screen.getByLabelText<HTMLInputElement>("Server host");
    expect(hostInput.value).toBe("127.0.0.1");
  });

  it("validates duplicate ID when adding second server", async () => {
    const servers: MonitoredServerConfig[] = [
      { id: "s1", host: "127.0.0.1", port: 14097, label: null },
    ];
    const onUpdate = vi.fn(() => Promise.resolve(undefined));
    render(
      <AgentSettings
        config={makeConfigWithServers(servers)}
        onUpdate={onUpdate}
        onResetSection={noop}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Add server" }));

    fireEvent.change(screen.getByLabelText("Server ID"), { target: { value: "s1" } });
    fireEvent.change(screen.getByLabelText("Server host"), { target: { value: "192.168.1.10" } });
    fireEvent.change(screen.getByLabelText("Server port"), { target: { value: "14097" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText(/already in use/i)).toBeTruthy();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
