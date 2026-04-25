// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AttentionIcon } from "../AttentionIcon";

describe("AttentionIcon", () => {
  it('renders calendar icon for "calendar" name', () => {
    const { container } = render(<AttentionIcon name="calendar" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it('renders message-circle icon for "message-circle" name', () => {
    const { container } = render(<AttentionIcon name="message-circle" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it('renders mail icon for "mail" name', () => {
    const { container } = render(<AttentionIcon name="mail" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it('renders file-text icon for "file-text" name', () => {
    const { container } = render(<AttentionIcon name="file-text" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("renders fallback circle icon for unknown name", () => {
    const { container } = render(<AttentionIcon name="unknown-thing" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("passes size prop to the SVG", () => {
    const { container } = render(<AttentionIcon name="calendar" size={20} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
  });
});
