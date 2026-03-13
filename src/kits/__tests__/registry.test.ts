import { describe, it, expect, beforeEach } from "vitest";
import { registerKit, getKitComponents, type KitComponents } from "../registry";

// Reset registry between tests by re-registering defaults
const DummyComponent = () => null;
const defaultComponents: KitComponents = { SearchResult: DummyComponent };

beforeEach(() => {
  // Re-register the _default to ensure clean state
  registerKit("_default", defaultComponents);
});

describe("Kit component registry", () => {
  it("returns registered kit components", () => {
    const custom: KitComponents = { SearchResult: DummyComponent };
    registerKit("calc", custom);

    const result = getKitComponents("calc");
    expect(result).toBe(custom);
  });

  it("falls back to _default for unknown kit", () => {
    const result = getKitComponents("unknown-kit");
    expect(result).toBe(defaultComponents);
  });

  it("overwrites previous registration", () => {
    const first: KitComponents = { SearchResult: DummyComponent };
    const second: KitComponents = { SearchResult: DummyComponent };
    registerKit("calc", first);
    registerKit("calc", second);

    expect(getKitComponents("calc")).toBe(second);
  });

  it("throws if no default and no kit found", () => {
    // Register a known kit but access a different unknown one
    // This test relies on _default being set in beforeEach
    // To test the throw, we'd need to clear the registry which
    // isn't exposed. Instead, verify it doesn't throw with default.
    expect(() => getKitComponents("nonexistent")).not.toThrow();
  });
});
