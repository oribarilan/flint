import { vi, describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  hideWindow,
  showWindow,
  toggleWindow,
  searchFiles,
  openFile,
  getAppIcon,
} from "../commands";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockedInvoke.mockReset();
});

describe("commands", () => {
  it("hideWindow calls invoke with correct command", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await hideWindow();
    expect(mockedInvoke).toHaveBeenCalledWith("hide_window");
  });

  it("showWindow calls invoke with correct command", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await showWindow();
    expect(mockedInvoke).toHaveBeenCalledWith("show_window");
  });

  it("toggleWindow calls invoke with correct command", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await toggleWindow();
    expect(mockedInvoke).toHaveBeenCalledWith("toggle_window");
  });

  it("searchFiles passes query parameter", async () => {
    const mockResults = [{ id: "1", name: "test.txt", path: "/test.txt", kind: "file" }];
    mockedInvoke.mockResolvedValue(mockResults);

    const result = await searchFiles("hello");

    expect(mockedInvoke).toHaveBeenCalledWith("search_files", {
      query: "hello",
    });
    expect(result).toEqual(mockResults);
  });

  it("openFile passes path parameter", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await openFile("/usr/bin/vim");
    expect(mockedInvoke).toHaveBeenCalledWith("open_file", {
      path: "/usr/bin/vim",
    });
  });

  it("getAppIcon passes path parameter", async () => {
    mockedInvoke.mockResolvedValue("base64data");
    const result = await getAppIcon("/Applications/Safari.app");
    expect(mockedInvoke).toHaveBeenCalledWith("get_app_icon", {
      path: "/Applications/Safari.app",
    });
    expect(result).toBe("base64data");
  });

  it("getAppIcon returns null when invoke returns null", async () => {
    mockedInvoke.mockResolvedValue(null);
    const result = await getAppIcon("/nonexistent");
    expect(result).toBeNull();
  });
});
