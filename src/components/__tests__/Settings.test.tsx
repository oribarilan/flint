import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import type { FlintConfig } from "../../lib/commands";

// ---------------------------------------------------------------------------
// Module mocks — must be hoisted before any imports that use the modules
// ---------------------------------------------------------------------------

const mockShow = vi.fn<() => Promise<void>>(() => Promise.resolve());

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ show: mockShow }),
}));

// Lightweight stub components so route-switching assertions are robust and
// don't require rendering the full settings sub-pages.
vi.mock("../settings/GeneralSettings", () => ({
  default: () => <div>GeneralSettings page</div>,
}));
vi.mock("../settings/SearchSettings", () => ({
  default: () => <div>SearchSettings page</div>,
}));
vi.mock("../settings/AgentSettings", () => ({
  default: () => <div>AgentSettings page</div>,
}));
vi.mock("../settings/KitsSettings", () => ({
  default: () => <div>KitsSettings page</div>,
}));

// useConfig is mocked after its own mock factory is set up below.
const mockUseConfig = vi.fn<
  () => {
    config: FlintConfig | null;
    isLoading: boolean;
    update: (c: FlintConfig) => Promise<void>;
    resetSection: (section: keyof FlintConfig) => Promise<FlintConfig | undefined>;
  }
>();

vi.mock("../../hooks/useConfig", () => ({
  useConfig: (...args: unknown[]) => mockUseConfig(...(args as [])),
}));

// Import after mocks are in place.
import Settings from "../Settings";

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const BASE_CONFIG: FlintConfig = {
  general: { hotkey: "CmdOrCtrl+Space", launch_at_login: false, terminal: "auto", editor: "auto" },
  appearance: { font_size: "medium", theme: "flint", backdrop_blur: false },
  search: { directories: [] },
  chat: { default_model: "gpt-4o" },
  second_brain: { repo_path: null },
  kits: {},
  monitored_servers: [],
};

const noop = vi.fn(() => Promise.resolve());
const noopReset = vi.fn(() => Promise.resolve(undefined));

function configLoaded() {
  mockUseConfig.mockReturnValue({
    config: BASE_CONFIG,
    isLoading: false,
    update: noop,
    resetSection: noopReset,
  });
}

function configLoading() {
  mockUseConfig.mockReturnValue({
    config: null,
    isLoading: true,
    update: noop,
    resetSection: noopReset,
  });
}

function configFailed() {
  mockUseConfig.mockReturnValue({
    config: null,
    isLoading: false,
    update: noop,
    resetSection: noopReset,
  });
}

beforeEach(() => {
  mockShow.mockClear();
  noop.mockClear();
  noopReset.mockClear();
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Settings — nav rendering", () => {
  it("renders all four nav items when config is loaded", () => {
    configLoaded();
    render(<Settings />);

    expect(screen.getByRole("button", { name: /General/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Search/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Agent/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Kits/i })).toBeTruthy();
  });

  it("defaults to General page on first render", () => {
    configLoaded();
    render(<Settings />);

    expect(screen.getByText("GeneralSettings page")).toBeTruthy();
    expect(screen.queryByText("SearchSettings page")).toBeNull();
    expect(screen.queryByText("AgentSettings page")).toBeNull();
    expect(screen.queryByText("KitsSettings page")).toBeNull();
  });
});

describe("Settings — route switching", () => {
  it("clicking Search nav shows SearchSettings page", () => {
    configLoaded();
    render(<Settings />);

    fireEvent.click(screen.getByRole("button", { name: /Search/i }));

    expect(screen.getByText("SearchSettings page")).toBeTruthy();
    expect(screen.queryByText("GeneralSettings page")).toBeNull();
  });

  it("clicking Agent nav shows AgentSettings page", () => {
    configLoaded();
    render(<Settings />);

    fireEvent.click(screen.getByRole("button", { name: /Agent/i }));

    expect(screen.getByText("AgentSettings page")).toBeTruthy();
    expect(screen.queryByText("GeneralSettings page")).toBeNull();
  });

  it("clicking Kits nav shows KitsSettings page", () => {
    configLoaded();
    render(<Settings />);

    fireEvent.click(screen.getByRole("button", { name: /Kits/i }));

    expect(screen.getByText("KitsSettings page")).toBeTruthy();
    expect(screen.queryByText("GeneralSettings page")).toBeNull();
  });

  it("clicking General after another page returns to General", () => {
    configLoaded();
    render(<Settings />);

    fireEvent.click(screen.getByRole("button", { name: /Agent/i }));
    expect(screen.getByText("AgentSettings page")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /General/i }));
    expect(screen.getByText("GeneralSettings page")).toBeTruthy();
  });
});

describe("Settings — loading state", () => {
  it("shows Loading… while isLoading is true", () => {
    configLoading();
    render(<Settings />);

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("does not render nav while loading", () => {
    configLoading();
    render(<Settings />);

    expect(screen.queryByRole("button", { name: /General/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Search/i })).toBeNull();
  });

  it("does not call window.show while isLoading is true", () => {
    configLoading();
    render(<Settings />);

    expect(mockShow).not.toHaveBeenCalled();
  });
});

describe("Settings — config load failure", () => {
  it("shows Loading… fallback when config is null and not loading", () => {
    configFailed();
    render(<Settings />);

    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("does not render nav when config failed to load", () => {
    configFailed();
    render(<Settings />);

    expect(screen.queryByRole("button", { name: /General/i })).toBeNull();
  });

  it("does not call window.show when config is null", () => {
    configFailed();
    render(<Settings />);

    expect(mockShow).not.toHaveBeenCalled();
  });
});

describe("Settings — window.show lifecycle", () => {
  it("calls window.show once when config is loaded and not loading", async () => {
    configLoaded();

    await act(async () => {
      render(<Settings />);
      await Promise.resolve();
    });

    expect(mockShow).toHaveBeenCalledTimes(1);
  });

  it("does not call window.show a second time when re-rendered without state change", async () => {
    configLoaded();

    const { rerender } = render(<Settings />);
    await act(async () => {
      await Promise.resolve();
    });

    mockShow.mockClear();
    rerender(<Settings />);
    await act(async () => {
      await Promise.resolve();
    });

    // show is guarded by the useEffect dep array [isLoading, config]
    // — same values on re-render → no additional calls.
    expect(mockShow).not.toHaveBeenCalled();
  });
});
