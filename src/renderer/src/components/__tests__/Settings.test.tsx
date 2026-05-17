// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, fireEvent, screen, act } from "@testing-library/react";
import { Settings } from "../Settings";
import { useModelStore } from "../../stores/modelStore";
import type { FlintConfig } from "../../../../main/types";

// Mock window.flint for ModelSelect
const mockFlint = {
  listModels: vi.fn(() =>
    Promise.resolve([
      { id: "gpt-4.1", name: "GPT 4.1" },
      { id: "gpt-4.1-mini", name: "GPT 4.1 Mini" },
      { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
    ]),
  ),
  setModel: vi.fn(),
  testNotification: vi.fn(),
};

Object.defineProperty(window, "flint", { value: mockFlint, writable: true });

const DEFAULT_TEST_CONFIG: FlintConfig = {
  hotkey: "Ctrl+Shift+Space",
  alertMinutes: 5,
  launchAtLogin: true,
  showTrayIcon: true,
  model: "gpt-4.1",
  fontSize: "medium",
  theme: "dark",
  menubarEnabled: true,
  menubarTime: "countdown",
  menubarTitle: true,
  spotlightEnabled: true,
  spotlightMinutes: 1,
};

function renderSettings(overrides: Partial<FlintConfig> = {}) {
  const config = { ...DEFAULT_TEST_CONFIG, ...overrides };
  const onUpdate = vi.fn();
  const result = render(<Settings config={config} onUpdate={onUpdate} />);
  return { ...result, onUpdate, config };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useModelStore.setState({ currentModel: "gpt-4.1", models: [] });
});

describe("Settings layout", () => {
  it("renders settings view with sidebar and content", () => {
    renderSettings();

    expect(screen.getByTestId("settings-view")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Settings categories" })).toBeTruthy();
  });

  it("renders all 5 tabs in the sidebar", () => {
    renderSettings();

    expect(screen.getByRole("tab", { name: /General/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Menubar/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /AI & Models/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Notifications/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Appearance/ })).toBeTruthy();
  });

  it("shows General tab as active by default", () => {
    renderSettings();

    const generalTab = screen.getByRole("tab", { name: /General/ });
    expect(generalTab.getAttribute("aria-selected")).toBe("true");
  });

  it("does not use dialog role or aria-modal", () => {
    renderSettings();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector("[aria-modal]")).toBeNull();
  });
});

describe("Tab switching", () => {
  it("switches to AI & Models tab on click", () => {
    renderSettings();

    fireEvent.click(screen.getByRole("tab", { name: /AI & Models/ }));

    expect(screen.getByRole("tab", { name: /AI & Models/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByText("Chat")).toBeTruthy();
  });

  it("switches to Notifications tab on click", () => {
    renderSettings();

    fireEvent.click(screen.getByRole("tab", { name: /Notifications/ }));

    expect(screen.getByLabelText("Minutes before meeting alert")).toBeTruthy();
  });

  it("switches to Appearance tab on click", () => {
    renderSettings();

    fireEvent.click(screen.getByRole("tab", { name: /Appearance/ }));

    expect(screen.getByLabelText("Theme")).toBeTruthy();
    expect(screen.getByLabelText("Font size")).toBeTruthy();
  });

  it("renders correct tabpanel with aria-labelledby", () => {
    renderSettings();

    const panel = screen.getByRole("tabpanel");
    expect(panel.getAttribute("aria-labelledby")).toBe("settings-tab-general");
  });
});

describe("General tab", () => {
  it("displays hotkey as read-only badge", () => {
    renderSettings({ hotkey: "Ctrl+Shift+Space" });

    expect(screen.getByText("Ctrl+Shift+Space")).toBeTruthy();
  });

  it("toggles launch at login", () => {
    const { onUpdate } = renderSettings({ launchAtLogin: true });

    fireEvent.click(screen.getByRole("switch", { name: "Launch at login" }));

    expect(onUpdate).toHaveBeenCalledWith({ launchAtLogin: false });
  });

  it("toggles show tray icon", () => {
    const { onUpdate } = renderSettings({ showTrayIcon: true });
    fireEvent.click(screen.getByRole("tab", { name: /Menubar/ }));

    fireEvent.click(screen.getByRole("switch", { name: "Show tray icon" }));

    expect(onUpdate).toHaveBeenCalledWith({ showTrayIcon: false });
  });
});

describe("AI & Models tab", () => {
  it("displays chat model selector with current value", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: /AI & Models/ }));

    const chatModelBtn = screen.getByLabelText("Chat model");
    expect(chatModelBtn).toBeTruthy();
    expect(chatModelBtn.textContent).toContain("gpt-4.1");
  });

  it("opens model picker and selects a chat model", async () => {
    const { onUpdate } = renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: /AI & Models/ }));

    // Click chat model trigger
    const chatModelBtn = screen.getByLabelText("Chat model");
    act(() => {
      fireEvent.click(chatModelBtn);
    });

    // Wait for models to load
    await act(async () => {
      await Promise.resolve();
    });

    // Select a different model
    fireEvent.click(screen.getByText("Claude Sonnet 4"));

    expect(onUpdate).toHaveBeenCalledWith({ model: "claude-sonnet-4" });
    expect(mockFlint.setModel).toHaveBeenCalledWith("claude-sonnet-4");
  });

  it("does not render the removed Background Agent card", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: /AI & Models/ }));

    expect(screen.queryByText("Background Agent")).toBeNull();
    expect(screen.queryByLabelText("Background polling")).toBeNull();
    expect(screen.queryByLabelText("Poll model")).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Poll frequency" })).toBeNull();
  });
});

describe("Notifications tab", () => {
  it("renders alert minutes input with current value", () => {
    renderSettings({ alertMinutes: 10 });
    fireEvent.click(screen.getByRole("tab", { name: /Notifications/ }));

    const input = screen.getByLabelText("Minutes before meeting alert");
    expect((input as HTMLInputElement).value).toBe("10");
  });

  it("clamps alert minutes to valid range", () => {
    const { onUpdate } = renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: /Notifications/ }));

    const input = screen.getByLabelText("Minutes before meeting alert");
    fireEvent.change(input, { target: { value: "100" } });

    expect(onUpdate).toHaveBeenCalledWith({ alertMinutes: 60 });
  });

  it("sends test notification on button click", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: /Notifications/ }));

    fireEvent.click(screen.getByText("Send test"));

    expect(mockFlint.testNotification).toHaveBeenCalledTimes(1);
  });
});

describe("Appearance tab", () => {
  it("renders theme control with current value selected", () => {
    renderSettings({ theme: "dark" });
    fireEvent.click(screen.getByRole("tab", { name: /Appearance/ }));

    const darkBtn = screen.getByRole("radio", { name: "Dark" });
    expect(darkBtn.getAttribute("aria-checked")).toBe("true");
  });

  it("renders all theme options including System", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: /Appearance/ }));

    const group = screen.getByRole("radiogroup", { name: "Theme" });
    const radios = Array.from(group.querySelectorAll("[role='radio']")).map(
      (el) => el.textContent,
    );
    expect(radios).toEqual(["Dark", "Light", "System"]);
  });

  it("calls onUpdate and sets data attribute when theme changes", () => {
    const { onUpdate } = renderSettings({ theme: "dark" });
    fireEvent.click(screen.getByRole("tab", { name: /Appearance/ }));

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));

    expect(onUpdate).toHaveBeenCalledWith({ theme: "light" });
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("renders font size control with current value selected", () => {
    renderSettings({ fontSize: "medium" });
    fireEvent.click(screen.getByRole("tab", { name: /Appearance/ }));

    const medBtn = screen.getByRole("radio", { name: "M" });
    expect(medBtn.getAttribute("aria-checked")).toBe("true");
  });

  it("renders all font size options", () => {
    renderSettings();
    fireEvent.click(screen.getByRole("tab", { name: /Appearance/ }));

    const group = screen.getByRole("radiogroup", { name: "Font size" });
    const radios = Array.from(group.querySelectorAll("[role='radio']")).map(
      (el) => el.textContent,
    );
    expect(radios).toEqual(["XS", "S", "M", "L"]);
  });

  it("calls onUpdate and sets data attribute when font size changes", () => {
    const { onUpdate } = renderSettings({ fontSize: "medium" });
    fireEvent.click(screen.getByRole("tab", { name: /Appearance/ }));

    fireEvent.click(screen.getByRole("radio", { name: "L" }));

    expect(onUpdate).toHaveBeenCalledWith({ fontSize: "large" });
    expect(document.documentElement.dataset.fontSize).toBe("large");
  });
});
