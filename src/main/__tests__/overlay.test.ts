import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Capture instances created via `new BrowserWindow(...)` so the test can
// inspect which event listeners were attached and trigger them.
type Listener = (...args: unknown[]) => void;

interface FakeBrowserWindow {
  on: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  center: ReturnType<typeof vi.fn>;
  isVisible: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  loadFile: ReturnType<typeof vi.fn>;
  getBounds: ReturnType<typeof vi.fn>;
  setPosition: ReturnType<typeof vi.fn>;
  listeners: Map<string, Listener[]>;
  emit: (event: string, ...args: unknown[]) => void;
}

const createdWindows: FakeBrowserWindow[] = [];

function makeFakeWindow(): FakeBrowserWindow {
  const listeners = new Map<string, Listener[]>();
  const win: FakeBrowserWindow = {
    listeners,
    on: vi.fn((event: string, cb: Listener) => {
      const arr = listeners.get(event) ?? [];
      arr.push(cb);
      listeners.set(event, arr);
      return win;
    }),
    hide: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    center: vi.fn(),
    isVisible: vi.fn(() => true),
    loadURL: vi.fn(() => Promise.resolve()),
    loadFile: vi.fn(() => Promise.resolve()),
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 340, height: 480 })),
    setPosition: vi.fn(),
    emit: (event: string, ...args: unknown[]) => {
      for (const cb of listeners.get(event) ?? []) cb(...args);
    },
  };
  return win;
}

vi.mock("electron", () => ({
  BrowserWindow: vi.fn(() => {
    const win = makeFakeWindow();
    createdWindows.push(win);
    return win;
  }),
  screen: {
    getPrimaryDisplay: () => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
    }),
  },
}));

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: false },
}));

vi.mock("../window/tray", () => ({
  getTray: vi.fn(() => null),
}));

beforeEach(() => {
  createdWindows.length = 0;
  vi.resetModules();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("overlay window", () => {
  it("auto-hides when the window emits 'blur'", async () => {
    const { createOverlayWindow } = await import("../window/overlay");
    createOverlayWindow();

    expect(createdWindows).toHaveLength(1);
    const win = createdWindows[0];

    // A blur listener should be registered for click-outside dismissal
    expect(win.listeners.get("blur") ?? []).toHaveLength(1);

    win.isVisible.mockReturnValue(true);
    win.emit("blur");
    expect(win.hide).toHaveBeenCalledTimes(1);
  });

  it("hideOverlay still hides the window when called explicitly", async () => {
    const { createOverlayWindow, hideOverlay } = await import("../window/overlay");
    createOverlayWindow();
    const win = createdWindows[0];
    win.isVisible.mockReturnValue(true);

    hideOverlay();

    expect(win.hide).toHaveBeenCalledTimes(1);
  });

  it("toggleOverlay shows the window when hidden", async () => {
    const { createOverlayWindow, toggleOverlay } = await import("../window/overlay");
    createOverlayWindow();
    const win = createdWindows[0];
    win.isVisible.mockReturnValue(false);

    toggleOverlay();

    expect(win.show).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
  });
});
