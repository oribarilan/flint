import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useSearchStore } from "../../stores/searchStore";
import type { KitSearchResult, KitAction } from "../../kits/types";

// ---------------------------------------------------------------------------
// jsdom stubs
// ---------------------------------------------------------------------------

// jsdom does not implement scrollIntoView — stub it globally so the
// ActionPanel useEffect that calls scrollIntoView doesn't throw.
Element.prototype.scrollIntoView = vi.fn();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// executeActionFromPanel is the IPC entry point from the panel.
// We mock it to avoid Tauri invoke calls; instead we verify it is called
// with the right action.
vi.mock("../ResultsList", async (importOriginal) => {
  const originalModule = await importOriginal();
  const original = (originalModule ?? {}) as Record<string, unknown>;
  return {
    ...original,
    executeActionFromPanel: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORE_RESET = {
  mode: "search" as const,
  query: "",
  results: [] as KitSearchResult[],
  selectedIndex: 0,
  isLoading: false,
  activeCommand: null,
  actionPanelOpen: false,
  actionPanelResult: null,
  actionFilterQuery: "",
  selectedActionIndex: 0,
  armedActionIndex: null,
};

function makeResult(actions: KitAction[]): KitSearchResult {
  return {
    kitId: "core",
    id: "/tmp/file.ts",
    title: "file.ts",
    kind: { type: "File" },
    actions,
  };
}

/** Place a result in the store and open the action panel. */
function openPanelWithActions(actions: KitAction[]): void {
  const result = makeResult(actions);
  useSearchStore.setState({ results: [result], selectedIndex: 0 });
  useSearchStore.getState().openActionPanel();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useSearchStore.setState(STORE_RESET);
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// Lazy import so mock registrations above take effect first.
const { default: ActionPanel } = await import("../ActionPanel");

describe("ActionPanel", () => {
  // ── Null when no result ───────────────────────────────────────────────────

  it("renders nothing when actionPanelResult is null", () => {
    const { container } = render(<ActionPanel />);
    expect(container.firstChild).toBeNull();
  });

  // ── Action rendering ──────────────────────────────────────────────────────

  it("renders all actions by default", () => {
    openPanelWithActions([
      { type: "Open", target: "/tmp/file.ts" },
      { type: "OpenInEditor", target: "/tmp/file.ts" },
      { type: "CopyPath", path: "/tmp/file.ts" },
    ]);

    render(<ActionPanel />);

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
  });

  it("renders action labels correctly", () => {
    openPanelWithActions([
      { type: "Open", target: "/tmp/file.ts" },
      { type: "Delete", target: "/tmp/file.ts" },
    ]);

    render(<ActionPanel />);

    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("has correct ARIA role and label", () => {
    openPanelWithActions([{ type: "Open", target: "/tmp/file.ts" }]);
    render(<ActionPanel />);
    expect(screen.getByRole("listbox", { name: "Actions" })).toBeInTheDocument();
  });

  // ── Filter rendering ──────────────────────────────────────────────────────

  it("filters actions by actionFilterQuery", () => {
    openPanelWithActions([
      { type: "Open", target: "/tmp/file.ts" },
      { type: "CopyPath", path: "/tmp/file.ts" },
      { type: "CopyName", name: "file.ts" },
      { type: "Delete", target: "/tmp/file.ts" },
    ]);

    // Set filter AFTER panel is already open.
    useSearchStore.setState({ actionFilterQuery: "copy" });

    render(<ActionPanel />);

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(screen.getByText("Copy Path")).toBeInTheDocument();
    expect(screen.getByText("Copy Name")).toBeInTheDocument();
    expect(screen.queryByText("Open")).toBeNull();
    expect(screen.queryByText("Delete")).toBeNull();
  });

  it("shows 'No matching actions' when filter matches nothing", () => {
    openPanelWithActions([{ type: "Open", target: "/tmp/file.ts" }]);
    useSearchStore.setState({ actionFilterQuery: "zzznomatch" });

    render(<ActionPanel />);

    expect(screen.getByText("No matching actions")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("shows all actions when filter is cleared", () => {
    openPanelWithActions([
      { type: "Open", target: "/tmp" },
      { type: "CopyPath", path: "/tmp" },
    ]);

    // Set then clear filter.
    useSearchStore.setState({ actionFilterQuery: "open" });
    useSearchStore.setState({ actionFilterQuery: "" });

    render(<ActionPanel />);

    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  // ── Non-destructive action: execute immediately ───────────────────────────

  it("non-destructive action executes and closes panel immediately on click", async () => {
    const { executeActionFromPanel } = await import("../ResultsList");
    const mockExecute = vi.mocked(executeActionFromPanel);

    openPanelWithActions([{ type: "Open", target: "/tmp/file.ts" }]);
    render(<ActionPanel />);

    fireEvent.click(screen.getByRole("option"));

    // Panel should close.
    expect(useSearchStore.getState().actionPanelOpen).toBe(false);
    expect(useSearchStore.getState().actionPanelResult).toBeNull();
    // Execute should have been called with the action.
    expect(mockExecute).toHaveBeenCalledWith({ type: "Open", target: "/tmp/file.ts" });
  });

  it("non-destructive CopyPath action executes immediately on click", async () => {
    const { executeActionFromPanel } = await import("../ResultsList");
    const mockExecute = vi.mocked(executeActionFromPanel);

    openPanelWithActions([{ type: "CopyPath", path: "/tmp/file.ts" }]);
    render(<ActionPanel />);

    fireEvent.click(screen.getByRole("option"));

    expect(useSearchStore.getState().actionPanelOpen).toBe(false);
    expect(mockExecute).toHaveBeenCalledWith({ type: "CopyPath", path: "/tmp/file.ts" });
  });

  // ── Destructive action: arm/confirm flow ─────────────────────────────────

  it("first click on a destructive action arms it (does NOT execute)", async () => {
    const { executeActionFromPanel } = await import("../ResultsList");
    const mockExecute = vi.mocked(executeActionFromPanel);

    openPanelWithActions([{ type: "Delete", target: "/tmp/file.ts" }]);
    render(<ActionPanel />);

    fireEvent.click(screen.getByRole("option"));

    // Not executed yet.
    expect(mockExecute).not.toHaveBeenCalled();
    // Panel stays open, action is armed.
    expect(useSearchStore.getState().actionPanelOpen).toBe(true);
    expect(useSearchStore.getState().armedActionIndex).toBe(0);
  });

  it("first click shows armed confirmation label", () => {
    openPanelWithActions([{ type: "Delete", target: "/tmp/file.ts" }]);
    render(<ActionPanel />);

    fireEvent.click(screen.getByRole("option"));

    // Component re-renders because armedActionIndex changed.
    expect(screen.getByText("Press Enter again to delete")).toBeInTheDocument();
  });

  it("second click on an armed destructive action executes and closes panel", async () => {
    const { executeActionFromPanel } = await import("../ResultsList");
    const mockExecute = vi.mocked(executeActionFromPanel);

    openPanelWithActions([{ type: "Delete", target: "/tmp/file.ts" }]);
    render(<ActionPanel />);

    const option = screen.getByRole("option");
    // Arm.
    fireEvent.click(option);
    // Confirm.
    fireEvent.click(option);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith({ type: "Delete", target: "/tmp/file.ts" });
    expect(useSearchStore.getState().actionPanelOpen).toBe(false);
  });

  it("destructive Custom action with requires_confirmation follows arm/confirm flow", async () => {
    const { executeActionFromPanel } = await import("../ResultsList");
    const mockExecute = vi.mocked(executeActionFromPanel);

    openPanelWithActions([
      { type: "Custom", id: "purge", label: "Purge All", requires_confirmation: true },
    ]);
    render(<ActionPanel />);

    const option = screen.getByRole("option");
    // First click: arm only.
    fireEvent.click(option);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(useSearchStore.getState().armedActionIndex).toBe(0);

    // Second click: execute.
    fireEvent.click(option);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  // ── Auto-disarm timeout (bonus: controlled fake timers) ───────────────────

  it("armed action auto-disarms after 3 seconds", () => {
    vi.useFakeTimers();

    openPanelWithActions([{ type: "Delete", target: "/tmp/file.ts" }]);
    render(<ActionPanel />);

    fireEvent.click(screen.getByRole("option"));
    expect(useSearchStore.getState().armedActionIndex).toBe(0);

    // Fast-forward past the 3 s disarm timeout.
    act(() => {
      vi.advanceTimersByTime(3001);
    });

    expect(useSearchStore.getState().armedActionIndex).toBeNull();
  });

  it("disarm timer is cancelled when action is executed before timeout", async () => {
    vi.useFakeTimers();
    const { executeActionFromPanel } = await import("../ResultsList");
    const mockExecute = vi.mocked(executeActionFromPanel);

    openPanelWithActions([{ type: "Delete", target: "/tmp/file.ts" }]);
    render(<ActionPanel />);

    const option = screen.getByRole("option");
    fireEvent.click(option); // arm
    fireEvent.click(option); // confirm — should execute and close

    expect(mockExecute).toHaveBeenCalledTimes(1);

    // Advancing time past timeout should NOT cause errors or further calls.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  // ── mouseEnter sets selectedActionIndex ──────────────────────────────────

  it("mouseEnter on an action sets selectedActionIndex", () => {
    openPanelWithActions([
      { type: "Open", target: "/tmp/file.ts" },
      { type: "CopyPath", path: "/tmp/file.ts" },
    ]);

    render(<ActionPanel />);

    const options = screen.getAllByRole("option");
    const secondOption = options[1];
    expect(secondOption).toBeDefined();
    if (!secondOption) {
      throw new Error("Expected second action option to exist");
    }
    fireEvent.mouseEnter(secondOption);

    expect(useSearchStore.getState().selectedActionIndex).toBe(1);
  });

  it("mouseEnter clears any armed action", () => {
    openPanelWithActions([
      { type: "Delete", target: "/tmp/file.ts" },
      { type: "Open", target: "/tmp/file.ts" },
    ]);
    useSearchStore.setState({ armedActionIndex: 0 });

    render(<ActionPanel />);

    const options = screen.getAllByRole("option");
    const secondOption = options[1];
    expect(secondOption).toBeDefined();
    if (!secondOption) {
      throw new Error("Expected second action option to exist");
    }
    fireEvent.mouseEnter(secondOption);

    expect(useSearchStore.getState().armedActionIndex).toBeNull();
  });
});
