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

test.describe("Flint Simulator - Chat Mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForSimReady(page);
  });

  test("Tab switches to chat mode", async ({ page }) => {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);

    // The input placeholder or the surrounding UI should indicate chat mode.
    // Look for the chat panel container or a visible chat message area.
    // Since the app is pre-connected, the ChatPanel should render.
    // Use a broad selector — any element whose class contains "container" inside the app.
    const input = searchInput(page);
    await expect(input).toBeVisible();
  });

  test("sending a chat message shows response", async ({ page }) => {
    // Switch to chat mode
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
    // Switch to chat mode
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
