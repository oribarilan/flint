import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useSearchStore } from "../../stores/searchStore";
import type { KitSearchResult } from "../../kits/types";

// ---------------------------------------------------------------------------
// jsdom stubs
// ---------------------------------------------------------------------------

// jsdom does not implement scrollIntoView — stub it globally so the
// ResultsList useEffect that calls scrollIntoView doesn't throw.
Element.prototype.scrollIntoView = vi.fn();

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock external IPC commands — we test wiring not real Tauri calls.
vi.mock("../../lib/commands", () => ({
  openFile: vi.fn(() => Promise.resolve()),
  hideWindow: vi.fn(() => Promise.resolve()),
  executeCommand: vi.fn(() => Promise.resolve({ type: "Done" })),
  revealInFileManager: vi.fn(() => Promise.resolve()),
  deleteToTrash: vi.fn(() => Promise.resolve()),
  openInEditor: vi.fn(() => Promise.resolve()),
  handleCustomAction: vi.fn(() => Promise.resolve(null)),
}));

// Mock clipboard API so Copy actions don't crash in jsdom.
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn(() => Promise.resolve()) },
  writable: true,
});

// Mock kit registry — provide a minimal SearchResult renderer so tests
// don't depend on full kit initialisation or icon rendering.
vi.mock("../../kits/registry", () => ({
  getKitComponents: vi.fn(() => ({
    SearchResult: ({ result }: { result: KitSearchResult }) => (
      <span data-testid="result-row">{result.title}</span>
    ),
  })),
}));

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

function makeResult(overrides: Partial<KitSearchResult> = {}): KitSearchResult {
  return {
    kitId: "core",
    id: "/tmp/hello.ts",
    title: "hello.ts",
    subtitle: "/tmp",
    kind: { type: "File" },
    actions: [{ type: "Open", target: "/tmp/hello.ts" }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useSearchStore.setState(STORE_RESET);
  // Clear all mock call histories between tests.
  vi.clearAllMocks();
});

// Lazy import so mock registrations above take effect first.
const { default: ResultsList } = await import("../ResultsList");

describe("ResultsList", () => {
  // ── Empty-state cases ─────────────────────────────────────────────────────

  it("returns null when query is empty and results are empty", () => {
    const { container } = render(<ResultsList />);
    expect(container.firstChild).toBeNull();
  });

  it("shows 'No matches for ...' when query is non-empty but results are empty", () => {
    useSearchStore.setState({ query: "xyzzy", results: [] });
    render(<ResultsList />);
    expect(screen.getByText(/No matches for/)).toBeInTheDocument();
    expect(screen.getByText(/xyzzy/)).toBeInTheDocument();
  });

  it("shows the hint text in empty state", () => {
    useSearchStore.setState({ query: "abc", results: [] });
    render(<ResultsList />);
    expect(screen.getByText(/Try a shorter term/)).toBeInTheDocument();
  });

  // ── Result rendering ──────────────────────────────────────────────────────

  it("renders a result row for each result", () => {
    useSearchStore.setState({
      query: "hello",
      results: [makeResult({ title: "alpha.ts" }), makeResult({ id: "2", title: "beta.ts" })],
    });
    render(<ResultsList />);
    expect(screen.getAllByTestId("result-row")).toHaveLength(2);
    expect(screen.getByText("alpha.ts")).toBeInTheDocument();
    expect(screen.getByText("beta.ts")).toBeInTheDocument();
  });

  it("renders a listbox with correct ARIA label", () => {
    useSearchStore.setState({ query: "x", results: [makeResult()] });
    render(<ResultsList />);
    expect(screen.getByRole("listbox", { name: "Search results" })).toBeInTheDocument();
  });

  // ── Pointer selection ─────────────────────────────────────────────────────

  it("mouseEnter on a result sets selectedIndex to that item's index", () => {
    useSearchStore.setState({
      query: "hello",
      results: [makeResult({ title: "first.ts" }), makeResult({ id: "2", title: "second.ts" })],
      selectedIndex: 0,
    });
    render(<ResultsList />);

    const options = screen.getAllByRole("option");
    // Hover over the second item.
    const secondOption = options[1];
    expect(secondOption).toBeDefined();
    if (!secondOption) {
      throw new Error("Expected second result option to exist");
    }
    fireEvent.mouseEnter(secondOption);

    expect(useSearchStore.getState().selectedIndex).toBe(1);
  });

  it("mouseEnter on first result keeps selectedIndex at 0", () => {
    useSearchStore.setState({
      query: "hello",
      results: [makeResult({ title: "only.ts" })],
      selectedIndex: 0,
    });
    render(<ResultsList />);

    fireEvent.mouseEnter(screen.getByRole("option"));
    expect(useSearchStore.getState().selectedIndex).toBe(0);
  });

  // ── Click / default action ────────────────────────────────────────────────

  it("clicking a result with an Open action calls openFile and hideWindow", async () => {
    const { openFile, hideWindow } = await import("../../lib/commands");
    const mockOpenFile = vi.mocked(openFile);
    const mockHideWindow = vi.mocked(hideWindow);

    useSearchStore.setState({
      query: "hello",
      results: [makeResult({ actions: [{ type: "Open", target: "/tmp/hello.ts" }] })],
    });
    render(<ResultsList />);

    fireEvent.click(screen.getByRole("option"));

    // Allow the promise chain to flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockOpenFile).toHaveBeenCalledWith("/tmp/hello.ts");
    expect(mockHideWindow).toHaveBeenCalled();
  });

  it("clicking a result with a RevealInFileManager action calls revealInFileManager", async () => {
    const { revealInFileManager, hideWindow } = await import("../../lib/commands");
    const mockReveal = vi.mocked(revealInFileManager);
    const mockHideWindow = vi.mocked(hideWindow);

    useSearchStore.setState({
      query: "hello",
      results: [
        makeResult({
          actions: [{ type: "RevealInFileManager", target: "/tmp/hello.ts" }],
        }),
      ],
    });
    render(<ResultsList />);

    fireEvent.click(screen.getByRole("option"));

    await Promise.resolve();
    await Promise.resolve();

    expect(mockReveal).toHaveBeenCalledWith("/tmp/hello.ts");
    expect(mockHideWindow).toHaveBeenCalled();
  });

  it("clicking an Execute-mode Command result hides window then calls executeCommand", async () => {
    const { hideWindow, executeCommand } = await import("../../lib/commands");
    const mockHideWindow = vi.mocked(hideWindow);
    const mockExecuteCommand = vi.mocked(executeCommand);

    useSearchStore.setState({
      query: "tile",
      results: [
        makeResult({
          kitId: "window-management",
          id: "tile-left",
          title: "Tile Left",
          kind: {
            type: "Command",
            kit_id: "window-management",
            command_id: "tile-left",
            mode: "Execute",
          },
          actions: [{ type: "Open", target: "" }],
        }),
      ],
    });
    render(<ResultsList />);

    fireEvent.click(screen.getByRole("option"));

    await Promise.resolve();
    await Promise.resolve();

    expect(mockHideWindow).toHaveBeenCalled();
    expect(mockExecuteCommand).toHaveBeenCalledWith("window-management", "tile-left");
  });

  // ── ARIA selection state ──────────────────────────────────────────────────

  it("selected item has aria-selected=true, others have aria-selected=false", () => {
    useSearchStore.setState({
      query: "q",
      results: [makeResult({ title: "a.ts" }), makeResult({ id: "2", title: "b.ts" })],
      selectedIndex: 1,
    });
    render(<ResultsList />);

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
  });
});
