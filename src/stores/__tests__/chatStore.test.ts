import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "../chatStore";

beforeEach(() => {
  useChatStore.setState({
    messages: [],
    isStreaming: false,
    currentResponse: "",
    activeToolCalls: [],
    chatStatus: { connected: false, sessionId: null, repoPath: null },
  });
});

describe("chatStore", () => {
  it("addUserMessage adds message and starts streaming", () => {
    useChatStore.getState().addUserMessage("hello");

    const state = useChatStore.getState();
    expect(state.messages).toEqual([{ role: "user", content: "hello" }]);
    expect(state.isStreaming).toBe(true);
    expect(state.currentResponse).toBe("");
  });

  it("appendToken accumulates in currentResponse", () => {
    useChatStore.getState().appendToken("Hello");
    useChatStore.getState().appendToken(" world");

    expect(useChatStore.getState().currentResponse).toBe("Hello world");
  });

  it("finishResponse creates assistant message from currentResponse", () => {
    useChatStore.setState({ currentResponse: "bot reply", isStreaming: true });
    useChatStore.getState().finishResponse();

    const state = useChatStore.getState();
    expect(state.messages).toEqual([{ role: "assistant", content: "bot reply" }]);
    expect(state.currentResponse).toBe("");
    expect(state.isStreaming).toBe(false);
  });

  it("finishResponse does nothing when currentResponse is empty", () => {
    useChatStore.setState({
      currentResponse: "",
      isStreaming: true,
      messages: [{ role: "user", content: "hi" }],
    });
    useChatStore.getState().finishResponse();

    const state = useChatStore.getState();
    // Messages unchanged — no empty assistant message added
    expect(state.messages).toEqual([{ role: "user", content: "hi" }]);
    // isStreaming stays true because finishResponse bailed out early
    expect(state.isStreaming).toBe(true);
  });

  it("full chat lifecycle: addUser → append tokens → finish", () => {
    const { addUserMessage, appendToken, finishResponse } = useChatStore.getState();

    addUserMessage("What is Rust?");
    appendToken("Rust ");
    appendToken("is ");
    appendToken("great.");
    finishResponse();

    const state = useChatStore.getState();
    expect(state.messages).toEqual([
      { role: "user", content: "What is Rust?" },
      { role: "assistant", content: "Rust is great." },
    ]);
    expect(state.isStreaming).toBe(false);
    expect(state.currentResponse).toBe("");
  });

  it("setError creates error message and stops streaming", () => {
    useChatStore.setState({ isStreaming: true, currentResponse: "partial" });
    useChatStore.getState().setError("something went wrong");

    const state = useChatStore.getState();
    expect(state.messages).toEqual([{ role: "error", content: "something went wrong" }]);
    expect(state.isStreaming).toBe(false);
    expect(state.currentResponse).toBe("");
  });

  it("clearChat resets messages and streaming state", () => {
    useChatStore.setState({
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hey" },
      ],
      isStreaming: true,
      currentResponse: "in progress",
    });
    useChatStore.getState().clearChat();

    const state = useChatStore.getState();
    expect(state.messages).toEqual([]);
    expect(state.isStreaming).toBe(false);
    expect(state.currentResponse).toBe("");
  });

  it("setChatStatus updates chat connection status", () => {
    useChatStore.getState().setChatStatus({
      connected: true,
      sessionId: "sess-123",
      repoPath: "/path/to/brain",
    });

    const { chatStatus } = useChatStore.getState();
    expect(chatStatus.connected).toBe(true);
    expect(chatStatus.sessionId).toBe("sess-123");
    expect(chatStatus.repoPath).toBe("/path/to/brain");
  });

  it("multiple messages accumulate correctly", () => {
    const s = useChatStore.getState();

    // First exchange
    s.addUserMessage("question 1");
    useChatStore.getState().appendToken("answer 1");
    useChatStore.getState().finishResponse();

    // Second exchange
    useChatStore.getState().addUserMessage("question 2");
    useChatStore.getState().appendToken("answer 2");
    useChatStore.getState().finishResponse();

    expect(useChatStore.getState().messages).toEqual([
      { role: "user", content: "question 1" },
      { role: "assistant", content: "answer 1" },
      { role: "user", content: "question 2" },
      { role: "assistant", content: "answer 2" },
    ]);
  });

  it("addToolCall tracks active tool calls", () => {
    useChatStore.getState().addToolCall({ kitId: "calculator", toolName: "calculate" });

    expect(useChatStore.getState().activeToolCalls).toEqual([
      { kitId: "calculator", toolName: "calculate" },
    ]);
  });

  it("removeToolCall removes by tool name", () => {
    useChatStore.getState().addToolCall({ kitId: "calculator", toolName: "calculate" });
    useChatStore.getState().addToolCall({ kitId: "stocks", toolName: "get_price" });
    useChatStore.getState().removeToolCall("calculate");

    expect(useChatStore.getState().activeToolCalls).toEqual([
      { kitId: "stocks", toolName: "get_price" },
    ]);
  });

  it("clearChat also clears active tool calls", () => {
    useChatStore.getState().addToolCall({ kitId: "calculator", toolName: "calculate" });
    useChatStore.getState().clearChat();

    expect(useChatStore.getState().activeToolCalls).toEqual([]);
  });

  // ── Model picker state ────────────────────────────────────

  it("openModelPicker sets modelPickerOpen and resets query/index", () => {
    useChatStore.getState().setModelPickerQuery("test");
    useChatStore.getState().setModelPickerIndex(5);
    useChatStore.getState().openModelPicker();

    const state = useChatStore.getState();
    expect(state.modelPickerOpen).toBe(true);
    expect(state.modelPickerQuery).toBe("");
    expect(state.modelPickerIndex).toBe(0);
  });

  it("closeModelPicker resets all picker state", () => {
    useChatStore.getState().openModelPicker();
    useChatStore.getState().setModelPickerQuery("claude");
    useChatStore.getState().setModelPickerIndex(3);
    useChatStore.getState().closeModelPicker();

    const state = useChatStore.getState();
    expect(state.modelPickerOpen).toBe(false);
    expect(state.modelPickerQuery).toBe("");
    expect(state.modelPickerIndex).toBe(0);
  });

  it("setAvailableModels stores the model list", () => {
    const models = [
      {
        id: "anthropic/claude-4",
        name: "Claude 4",
        providerId: "anthropic",
        providerName: "Anthropic",
      },
      { id: "openai/gpt-5", name: "GPT-5", providerId: "openai", providerName: "OpenAI" },
    ];
    useChatStore.getState().setAvailableModels(models);
    expect(useChatStore.getState().availableModels).toEqual(models);
  });

  it("setModelPickerQuery updates query and resets index", () => {
    useChatStore.getState().setModelPickerIndex(5);
    useChatStore.getState().setModelPickerQuery("opus");

    expect(useChatStore.getState().modelPickerQuery).toBe("opus");
    expect(useChatStore.getState().modelPickerIndex).toBe(0);
  });

  it("setModelPickerIndex updates selected index", () => {
    useChatStore.getState().setModelPickerIndex(3);
    expect(useChatStore.getState().modelPickerIndex).toBe(3);
  });

  it("setSelectedModel updates the selected model", () => {
    useChatStore.getState().setSelectedModel({
      providerId: "anthropic",
      modelId: "claude-sonnet-4",
      displayName: "Claude Sonnet 4",
    });

    const model = useChatStore.getState().selectedModel;
    expect(model?.providerId).toBe("anthropic");
    expect(model?.modelId).toBe("claude-sonnet-4");
    expect(model?.displayName).toBe("Claude Sonnet 4");
  });

  it("setChatStatus updates connection info", () => {
    useChatStore.getState().setChatStatus({
      connected: true,
      sessionId: "sess-123",
      repoPath: "/path/to/brain",
    });

    const { chatStatus } = useChatStore.getState();
    expect(chatStatus.connected).toBe(true);
    expect(chatStatus.sessionId).toBe("sess-123");
    expect(chatStatus.repoPath).toBe("/path/to/brain");
  });
});
