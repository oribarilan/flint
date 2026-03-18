import { vi, describe, it, expect, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import {
  hideWindow,
  showWindow,
  toggleWindow,
  searchFiles,
  searchAll,
  openFile,
  getAppIcon,
  revealInFileManager,
  deleteToTrash,
  openInEditor,
  getAvailableModels,
  getProjectModelConfigStatus,
  setProjectDefaultModel,
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

    const result = await searchFiles("hello"); // eslint-disable-line @typescript-eslint/no-deprecated -- testing deprecated function

    expect(mockedInvoke).toHaveBeenCalledWith("search_files", {
      query: "hello",
    });
    expect(result).toEqual(mockResults);
  });

  it("searchAll passes query parameter", async () => {
    const mockResults = [
      {
        kitId: "core",
        id: "1",
        title: "test.txt",
        actions: [{ type: "Open", target: "/test.txt" }],
      },
    ];
    mockedInvoke.mockResolvedValue(mockResults);

    const result = await searchAll("hello");

    expect(mockedInvoke).toHaveBeenCalledWith("search_all", {
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

  // ── Action Panel commands ──────────────────────────────────

  it("revealInFileManager passes path parameter", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await revealInFileManager("/tmp/test.txt");
    expect(mockedInvoke).toHaveBeenCalledWith("reveal_in_file_manager", {
      path: "/tmp/test.txt",
    });
  });

  it("deleteToTrash passes path parameter", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await deleteToTrash("/tmp/test.txt");
    expect(mockedInvoke).toHaveBeenCalledWith("delete_to_trash", {
      path: "/tmp/test.txt",
    });
  });

  it("openInEditor passes path parameter", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await openInEditor("/tmp/test.rs");
    expect(mockedInvoke).toHaveBeenCalledWith("open_in_editor", {
      path: "/tmp/test.rs",
    });
  });

  it("getAvailableModels invokes get_available_models", async () => {
    mockedInvoke.mockResolvedValue([[], null]);
    await getAvailableModels();
    expect(mockedInvoke).toHaveBeenCalledWith("get_available_models");
  });

  it("getProjectModelConfigStatus invokes backend status command", async () => {
    mockedInvoke.mockResolvedValue({
      exists: true,
      has_model: true,
      model: "anthropic/claude-sonnet-4",
      path: "/repo/opencode.jsonc",
    });
    await getProjectModelConfigStatus();
    expect(mockedInvoke).toHaveBeenCalledWith("get_project_model_config_status");
  });

  it("setProjectDefaultModel passes model parameter", async () => {
    mockedInvoke.mockResolvedValue(undefined);
    await setProjectDefaultModel("openai/gpt-5.4");
    expect(mockedInvoke).toHaveBeenCalledWith("set_project_default_model", {
      model: "openai/gpt-5.4",
    });
  });
});
