// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { Popover } from "../Popover";

afterEach(() => {
  cleanup();
});

describe("Popover", () => {
  it("renders children", () => {
    const triggerRef = createRef<HTMLButtonElement>();
    render(
      <Popover onClose={vi.fn()} triggerRef={triggerRef}>
        <span>Hello</span>
      </Popover>,
    );

    expect(screen.getByText("Hello")).toBeTruthy();
  });

  it("calls onClose when clicking outside", () => {
    const onClose = vi.fn();
    const triggerRef = createRef<HTMLButtonElement>();
    render(
      <div>
        <Popover onClose={onClose} triggerRef={triggerRef}>
          <span>Inside</span>
        </Popover>
        <button data-testid="outside">Outside</button>
      </div>,
    );

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when clicking inside", () => {
    const onClose = vi.fn();
    const triggerRef = createRef<HTMLButtonElement>();
    render(
      <Popover onClose={onClose} triggerRef={triggerRef}>
        <span>Inside content</span>
      </Popover>,
    );

    fireEvent.mouseDown(screen.getByText("Inside content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not call onClose when clicking on trigger", () => {
    const onClose = vi.fn();
    const triggerRef = createRef<HTMLButtonElement>();
    render(
      <div>
        <button ref={triggerRef}>Trigger</button>
        <Popover onClose={onClose} triggerRef={triggerRef}>
          <span>Content</span>
        </Popover>
      </div>,
    );

    fireEvent.mouseDown(screen.getByText("Trigger"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("applies custom className", () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const { container } = render(
      <Popover onClose={vi.fn()} triggerRef={triggerRef} className="custom-class">
        <span>Content</span>
      </Popover>,
    );

    const popover = container.firstElementChild as HTMLElement;
    expect(popover.className).toContain("custom-class");
  });
});
