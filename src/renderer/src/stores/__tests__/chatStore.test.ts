import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "../chatStore";

describe("chatStore", () => {
  beforeEach(() => {
    useChatStore.setState({
      messages: [],
      streamingContent: "",
      isStreaming: false,
    });
  });

  it("starts with empty state", () => {
    const state = useChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.streamingContent).toBe("");
    expect(state.isStreaming).toBe(false);
  });

  it("addUserMessage adds message and starts streaming", () => {
    useChatStore.getState().addUserMessage("hello");

    const state = useChatStore.getState();
    expect(state.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(state.isStreaming).toBe(true);
    expect(state.streamingContent).toBe("");
  });

  it("appendDelta accumulates in streamingContent", () => {
    useChatStore.getState().appendDelta("Hello");
    useChatStore.getState().appendDelta(" world");

    expect(useChatStore.getState().streamingContent).toBe("Hello world");
  });

  it("finishStreaming creates assistant message from streamingContent", () => {
    useChatStore.setState({ streamingContent: "bot reply", isStreaming: true });
    useChatStore.getState().finishStreaming();

    const state = useChatStore.getState();
    expect(state.messages).toEqual([{ role: "assistant", content: "bot reply" }]);
    expect(state.streamingContent).toBe("");
    expect(state.isStreaming).toBe(false);
  });

  it("full chat lifecycle: addUser → appendDelta → finishStreaming", () => {
    const { addUserMessage, appendDelta, finishStreaming } = useChatStore.getState();

    addUserMessage("What is Rust?");
    appendDelta("Rust ");
    appendDelta("is ");
    appendDelta("great.");
    finishStreaming();

    const state = useChatStore.getState();
    expect(state.messages).toEqual([
      { role: "user", content: "What is Rust?" },
      { role: "assistant", content: "Rust is great." },
    ]);
    expect(state.isStreaming).toBe(false);
    expect(state.streamingContent).toBe("");
  });

  it("clearMessages resets everything", () => {
    useChatStore.setState({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hey" },
      ],
      isStreaming: true,
      streamingContent: "in progress",
    });
    useChatStore.getState().clearMessages();

    const state = useChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.isStreaming).toBe(false);
    expect(state.streamingContent).toBe("");
  });

  it("multiple exchanges accumulate correctly", () => {
    const s = useChatStore.getState();

    s.addUserMessage("q1");
    useChatStore.getState().appendDelta("a1");
    useChatStore.getState().finishStreaming();

    useChatStore.getState().addUserMessage("q2");
    useChatStore.getState().appendDelta("a2");
    useChatStore.getState().finishStreaming();

    expect(useChatStore.getState().messages).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" },
    ]);
  });
});
