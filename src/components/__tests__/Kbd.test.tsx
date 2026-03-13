import { vi, describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import Kbd from "../Kbd";

vi.mock("../../lib/platform", () => ({
  isMac: vi.fn(() => false),
}));

import { isMac } from "../../lib/platform";
const mockIsMac = vi.mocked(isMac);

beforeEach(() => {
  mockIsMac.mockReturnValue(false);
});

describe("Kbd", () => {
  it("renders a kbd element", () => {
    render(<Kbd keys="Tab" />);
    expect(screen.getByText("Tab")).toBeTruthy();
    expect(screen.getByText("Tab").tagName).toBe("KBD");
  });

  it("renders CmdOrCtrl as Ctrl on non-Mac", () => {
    mockIsMac.mockReturnValue(false);
    render(<Kbd keys="CmdOrCtrl+," />);
    expect(screen.getByText("Ctrl+,")).toBeTruthy();
  });

  it("renders CmdOrCtrl as ⌘ on Mac", () => {
    mockIsMac.mockReturnValue(true);
    render(<Kbd keys="CmdOrCtrl+," />);
    expect(screen.getByText("⌘,")).toBeTruthy();
  });

  it("renders Shift+Enter with symbols", () => {
    render(<Kbd keys="Shift+Enter" />);
    expect(screen.getByText("Shift+↵")).toBeTruthy();
  });

  it("renders Shift with ⇧ on Mac", () => {
    mockIsMac.mockReturnValue(true);
    render(<Kbd keys="Shift+Enter" />);
    expect(screen.getByText("⇧↵")).toBeTruthy();
  });

  it("renders Escape as ⎋", () => {
    render(<Kbd keys="Escape" />);
    expect(screen.getByText("⎋")).toBeTruthy();
  });

  it("renders arrow keys as symbols", () => {
    render(<Kbd keys="ArrowUp" />);
    expect(screen.getByText("↑")).toBeTruthy();
  });

  it("renders CmdOrCtrl+number correctly on Mac", () => {
    mockIsMac.mockReturnValue(true);
    render(<Kbd keys="CmdOrCtrl+1" />);
    expect(screen.getByText("⌘1")).toBeTruthy();
  });

  it("renders CmdOrCtrl+number correctly on non-Mac", () => {
    mockIsMac.mockReturnValue(false);
    render(<Kbd keys="CmdOrCtrl+1" />);
    expect(screen.getByText("Ctrl+1")).toBeTruthy();
  });

  it("renders Ctrl (not CmdOrCtrl) as ⌃ on Mac", () => {
    mockIsMac.mockReturnValue(true);
    render(<Kbd keys="Ctrl+J" />);
    expect(screen.getByText("⌃J")).toBeTruthy();
  });

  it("renders Alt as ⌥ on Mac", () => {
    mockIsMac.mockReturnValue(true);
    render(<Kbd keys="Alt+Tab" />);
    expect(screen.getByText("⌥Tab")).toBeTruthy();
  });

  it("renders Alt as Alt on non-Mac", () => {
    mockIsMac.mockReturnValue(false);
    render(<Kbd keys="Alt+Tab" />);
    expect(screen.getByText("Alt+Tab")).toBeTruthy();
  });
});
