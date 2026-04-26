import { describe, it, expect, beforeEach } from "vitest";
import { useModelStore } from "../modelStore";

describe("modelStore", () => {
  beforeEach(() => {
    useModelStore.setState({
      currentModel: "gpt-4.1",
      models: [],
    });
  });

  it("starts with default model", () => {
    const state = useModelStore.getState();
    expect(state.currentModel).toBe("gpt-4.1");
    expect(state.models).toEqual([]);
  });

  it("setCurrentModel updates current model", () => {
    useModelStore.getState().setCurrentModel("claude-sonnet-4");

    expect(useModelStore.getState().currentModel).toBe("claude-sonnet-4");
  });

  it("setModels updates models list", () => {
    const models = [
      { id: "gpt-4.1", name: "GPT 4.1" },
      { id: "claude-sonnet-4", name: "Claude Sonnet" },
    ];
    useModelStore.getState().setModels(models);

    expect(useModelStore.getState().models).toEqual(models);
  });

  it("setCurrentModel does not affect models list", () => {
    const models = [{ id: "gpt-4.1", name: "GPT 4.1" }];
    useModelStore.getState().setModels(models);
    useModelStore.getState().setCurrentModel("claude-sonnet-4");

    expect(useModelStore.getState().models).toEqual(models);
  });

  it("setModels does not affect current model", () => {
    useModelStore.getState().setCurrentModel("claude-sonnet-4");
    useModelStore.getState().setModels([{ id: "gpt-4.1", name: "GPT 4.1" }]);

    expect(useModelStore.getState().currentModel).toBe("claude-sonnet-4");
  });
});
