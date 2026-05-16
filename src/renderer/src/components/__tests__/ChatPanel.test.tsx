// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ChatMessage } from "../../stores/chatStore";

// Mock MarkdownContent — it pulls in a heavy markdown pipeline we don't need here.
vi.mock("../MarkdownContent", () => ({
  MarkdownContent: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
}));

// Mock ChatEmptyState so the empty-render branch is trivial.
vi.mock("../ChatEmptyState", () => ({
  ChatEmptyState: () => <div data-testid="empty" />,
}));

import { ChatPanel } from "../ChatPanel";

// Track scrollTop assignments on the panel element.
const scrollTopSetter = vi.fn();

beforeEach(() => {
  // rAF runs synchronously so effects observably mutate scrollTop in the test.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    /* no-op for tests */
  });

  scrollTopSetter.mockClear();

  // Force HTMLDivElement.scrollTop to be observable. jsdom returns 0 and
  // ignores writes; intercept the setter so the test can count assignments.
  Object.defineProperty(HTMLDivElement.prototype, "scrollTop", {
    configurable: true,
    get() {
      return 0;
    },
    set(v: number) {
      scrollTopSetter(v);
    },
  });
  // scrollHeight defaults to 0 in jsdom — give it a non-zero value so the
  // assignment in the effect is meaningful.
  Object.defineProperty(HTMLDivElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return 1234;
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function makeMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return { role, content };
}

describe("ChatPanel", () => {
  it("auto-scrolls when streamingContent changes", () => {
    const { rerender } = render(
      <ChatPanel
        messages={[makeMessage("user", "hi")]}
        streamingContent=""
        isStreaming={true}
        onSend={vi.fn()}
      />,
    );

    const initialCalls = scrollTopSetter.mock.calls.length;
    expect(initialCalls).toBeGreaterThan(0); // initial mount scrolled

    rerender(
      <ChatPanel
        messages={[makeMessage("user", "hi")]}
        streamingContent="partial token"
        isStreaming={true}
        onSend={vi.fn()}
      />,
    );

    expect(scrollTopSetter.mock.calls.length).toBeGreaterThan(initialCalls);
    // Last assignment uses scrollHeight (1234).
    const last = scrollTopSetter.mock.calls.at(-1);
    expect(last?.[0]).toBe(1234);
  });

  it("auto-scrolls when messages change", () => {
    const { rerender } = render(
      <ChatPanel
        messages={[makeMessage("user", "hi")]}
        streamingContent=""
        isStreaming={false}
        onSend={vi.fn()}
      />,
    );

    const before = scrollTopSetter.mock.calls.length;

    rerender(
      <ChatPanel
        messages={[makeMessage("user", "hi"), makeMessage("assistant", "hello")]}
        streamingContent=""
        isStreaming={false}
        onSend={vi.fn()}
      />,
    );

    expect(scrollTopSetter.mock.calls.length).toBeGreaterThan(before);
  });

  it("does NOT re-run scroll effect when re-rendering with the same messages and streamingContent", () => {
    const messages = [makeMessage("user", "hi")];
    const { rerender } = render(
      <ChatPanel
        messages={messages}
        streamingContent="abc"
        isStreaming={true}
        onSend={vi.fn()}
      />,
    );

    const callsAfterMount = scrollTopSetter.mock.calls.length;

    // Re-render with identical deps but a changed unrelated prop.
    rerender(
      <ChatPanel
        messages={messages}
        streamingContent="abc"
        isStreaming={true}
        onSend={vi.fn()}
        suggestionsKeyboardFocusedIndex={2}
      />,
    );

    expect(scrollTopSetter.mock.calls.length).toBe(callsAfterMount);
  });
});
