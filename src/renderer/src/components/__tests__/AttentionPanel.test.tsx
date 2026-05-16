// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { AttentionItem } from "../../../../main/types";

type StatusCallback = (status: string) => void;

let registeredCallback: StatusCallback | null = null;
const mockOnConnectionStatus = vi.fn((cb: StatusCallback) => {
  registeredCallback = cb;
  return vi.fn();
});

Object.defineProperty(window, "flint", {
  value: {
    platform: "darwin",
    onConnectionStatus: mockOnConnectionStatus,
  },
  writable: true,
});

import { AttentionPanel } from "../AttentionPanel";

beforeEach(() => {
  registeredCallback = null;
  mockOnConnectionStatus.mockClear();
});

afterEach(() => {
  cleanup();
});

const noop = (): void => {
  /* test stub */
};

function renderEmpty() {
  return render(
    <AttentionPanel items={[]} selectedIds={new Set()} onSelect={noop} onOpen={noop} />,
  );
}

describe("AttentionPanel empty state", () => {
  it("shows 'Reconnecting to Copilot…' as default before first status", () => {
    renderEmpty();
    expect(screen.getByText("Reconnecting to Copilot…")).toBeTruthy();
  });

  it("shows 'No items yet' when status is connected", () => {
    renderEmpty();
    act(() => {
      registeredCallback?.("connected");
    });
    expect(screen.getByText("No items yet")).toBeTruthy();
  });

  it("shows 'Not connected to Copilot' when status is disconnected", () => {
    renderEmpty();
    act(() => {
      registeredCallback?.("disconnected");
    });
    expect(screen.getByText("Not connected to Copilot")).toBeTruthy();
  });

  it("shows 'Reconnecting to Copilot…' when status is reconnecting", () => {
    renderEmpty();
    act(() => {
      registeredCallback?.("reconnecting");
    });
    expect(screen.getByText("Reconnecting to Copilot…")).toBeTruthy();
  });
});

describe("AttentionPanel with items", () => {
  const items: AttentionItem[] = [
    {
      id: "item-1",
      icon: "calendar",
      title: "Test meeting",
      description: "A test item",
      metadata: {},
    },
  ];

  it("renders items regardless of connection status", () => {
    render(
      <AttentionPanel
        items={items}
        selectedIds={new Set()}
        onSelect={noop}
        onOpen={noop}
      />,
    );
    act(() => {
      registeredCallback?.("disconnected");
    });
    expect(screen.getByText("Test meeting")).toBeTruthy();
    expect(screen.queryByText("Not connected to Copilot")).toBeNull();
  });
});
