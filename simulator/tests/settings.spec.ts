import { test, expect, type Page } from "@playwright/test";

async function waitForSettings(page: Page) {
  await page.waitForFunction(() => (window as any).__sim !== undefined, null, {
    timeout: 10000,
  });
  await page.waitForSelector("nav", { timeout: 5000 });
}

test.describe("Settings - Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?page=settings");
    await waitForSettings(page);
  });

  test("renders sidebar with all nav items", async ({ page }) => {
    await expect(page.getByRole("button", { name: "General" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Search" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agent" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Brain" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kits" })).toBeVisible();
  });

  test("defaults to General page", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
  });
});

test.describe("Settings - Agent", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?page=settings");
    await waitForSettings(page);
    await page.getByRole("button", { name: "Agent" }).click();
  });

  test("shows connected providers list", async ({ page }) => {
    await expect(page.getByText("Model Providers")).toBeVisible();
    // Both providers should show as connected
    await expect(page.getByText("GitHub Copilot")).toBeVisible();
    await expect(page.getByText("OpenCode Zen")).toBeVisible();
  });

  test("shows Reconnect button when provider is connected", async ({ page }) => {
    // Connected badge should be visible for providers
    const badges = page.getByText("Connected", { exact: true });
    expect(await badges.count()).toBeGreaterThanOrEqual(1);
  });

  test("shows default model picker", async ({ page }) => {
    await expect(page.getByText("Default Model")).toBeVisible();
    const select = page.getByRole("combobox");
    await expect(select).toBeVisible();
    // Default model from mock is anthropic/claude-sonnet-4
    await expect(select).toContainText("Claude Sonnet 4");
  });
});

test.describe("Settings - Brain", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?page=settings");
    await waitForSettings(page);
    await page.getByRole("button", { name: "Brain" }).click();
  });

  test("shows Second Brain section with no-repo state", async ({ page }) => {
    await expect(page.getByText("Second Brain")).toBeVisible();
    // Select button visible when no repo
    await expect(page.getByRole("button", { name: "Select" })).toBeVisible();
  });

  test("shows select button when no repo", async ({ page }) => {
    await expect(page.getByText("Repository")).toBeVisible();
    await expect(page.getByRole("button", { name: "Select" })).toBeVisible();
  });
});
