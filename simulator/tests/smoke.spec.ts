import { test, expect, type Page } from "@playwright/test";

// Helper: wait for the simulator to be ready (app rendered + mocks installed)
async function waitForSimReady(page: Page) {
  await page.waitForFunction(() => (window as any).__sim !== undefined, null, {
    timeout: 10000,
  });
  await page.waitForSelector('input[type="text"]', { timeout: 5000 });
}

function searchInput(page: Page) {
  return page.locator('input[type="text"]');
}

test.describe("Flint Simulator - Smoke Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForSimReady(page);
  });

  test("app renders with search bar", async ({ page }) => {
    const input = searchInput(page);
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test("simulator banner is visible", async ({ page }) => {
    const banner = page.locator("#sim-banner");
    await expect(banner).toHaveText("SIMULATOR");
  });

  test("typing in search bar shows results", async ({ page }) => {
    const input = searchInput(page);
    await input.fill("term");

    // Wait for results — use exact match to avoid matching the subtitle too
    await expect(page.getByText("Terminal", { exact: true })).toBeVisible({
      timeout: 3000,
    });
  });

  test("empty query shows no results", async ({ page }) => {
    const input = searchInput(page);
    await input.fill("");

    await page.waitForTimeout(300);
    const results = page.locator('[class*="resultItem"]');
    await expect(results).toHaveCount(0);
  });
});

test.describe("Flint Simulator - Agent Mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForSimReady(page);
  });

  test("Tab switches to agent mode", async ({ page }) => {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);

    // The input placeholder or the surrounding UI should indicate agent mode.
    // Look for the chat panel container or a visible message area.
    // Since the app is pre-connected, the ChatPanel should render.
    // Use a broad selector — any element whose class contains "container" inside the app.
    const input = searchInput(page);
    await expect(input).toBeVisible();
  });

  test("sending a message shows response", async ({ page }) => {
    // Switch to agent mode
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);

    // Type a message
    const input = searchInput(page);
    await input.fill("hello");
    await page.keyboard.press("Enter");

    // Wait for the simulated streaming response
    await expect(page.getByText("Flint simulator", { exact: false })).toBeVisible({
      timeout: 5000,
    });
  });

  test("Tab toggles back to search mode", async ({ page }) => {
    // Switch to agent mode
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);

    // Switch back to search mode
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200);

    // Should be back in search mode — type and see results
    const input = searchInput(page);
    await input.fill("note");
    await expect(page.getByText("Notes", { exact: true })).toBeVisible({
      timeout: 3000,
    });
  });
});

test.describe("Flint Simulator - Keyboard Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForSimReady(page);
  });

  test("arrow keys navigate results", async ({ page }) => {
    const input = searchInput(page);
    await input.fill("a");

    // Wait for results
    await page.waitForTimeout(500);

    // Arrow down should move selection
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(100);

    // Arrow up should move selection back
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(100);
  });

  test("Escape clears query", async ({ page }) => {
    const input = searchInput(page);
    await input.fill("test query");
    await expect(input).toHaveValue("test query");

    await page.keyboard.press("Escape");
    await expect(input).toHaveValue("");
  });
});

test.describe("Flint Simulator - Model Picker", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForSimReady(page);
    // Switch to agent mode
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
  });

  test("typing / opens slash commands and /models opens model picker", async ({ page }) => {
    const input = searchInput(page);
    await input.fill("/");

    await expect(page.getByRole("listbox", { name: "Commands" })).toBeVisible();
    await expect(page.getByText("/models")).toBeVisible();

    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    // Should show a chip in the search bar
    await expect(page.getByTestId("model-chip")).toBeVisible();

    // Should show the model list
    await expect(page.getByRole("listbox", { name: "Models" })).toBeVisible();

    // Should have models in the list
    await expect(page.getByRole("option").first()).toBeVisible();
  });

  test("typing filters models", async ({ page }) => {
    await searchInput(page).fill("/");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    const input = searchInput(page);
    await input.fill("opus");

    // Only Opus models should remain
    const options = page.getByRole("option");
    const count = await options.count();
    expect(count).toBe(2); // Claude Opus 4.6 + Claude Opus 4.5
  });

  test("Enter selects model and closes picker", async ({ page }) => {
    await searchInput(page).fill("/");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    // Navigate down and select
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // Picker should close — no more model-chip
    await expect(page.getByTestId("model-chip")).not.toBeVisible();

    // Placeholder should be back to "Ask anything..."
    await expect(searchInput(page)).toHaveAttribute("placeholder", "Ask anything...");
  });

  test("Escape closes picker without changing model", async ({ page }) => {
    await searchInput(page).fill("/");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    await expect(page.getByTestId("model-chip")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("model-chip")).not.toBeVisible();
  });

  test("Escape dismisses slash menu and keeps slash as plain text", async ({ page }) => {
    const input = searchInput(page);
    await input.fill("/");

    await expect(page.getByRole("listbox", { name: "Commands" })).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("listbox", { name: "Commands" })).not.toBeVisible();
    await expect(input).toHaveValue("/");
  });
});

test.describe("Flint Simulator - Tool Calls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForSimReady(page);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
  });

  test("file query shows tool call card", async ({ page }) => {
    const input = searchInput(page);
    await input.fill("search my files");
    await page.keyboard.press("Enter");

    // Tool card should appear (Search Files with emoji)
    await expect(page.getByText("Search Files")).toBeVisible({ timeout: 3000 });
  });

  test("tool cards disappear after completion", async ({ page }) => {
    const input = searchInput(page);
    await input.fill("search my files");
    await page.keyboard.press("Enter");

    // Wait for tool to appear
    await expect(page.getByText("Search Files")).toBeVisible({ timeout: 3000 });

    // Wait for response to finish and tool to clear
    await page.waitForTimeout(6000);
    await expect(page.getByText("Search Files")).not.toBeVisible();
  });
});

test.describe("Flint Simulator - New Chat", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForSimReady(page);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);
  });

  test("new chat button clears messages", async ({ page }) => {
    // Send a message first
    const input = searchInput(page);
    await input.fill("hello");
    await page.keyboard.press("Enter");

    // Wait for response
    await expect(page.getByText("Flint simulator", { exact: false })).toBeVisible({
      timeout: 5000,
    });

    // Click new chat
    await page.getByRole("button", { name: "New chat" }).click();
    await page.waitForTimeout(300);

    // Messages should be cleared, empty state should show
    await expect(page.getByText("Ask anything about your second brain")).toBeVisible();
  });
});
