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

  test("shows connection controls for second-brain/OpenCode", async ({ page }) => {
    await expect(page.getByText("Second Brain", { exact: true })).toBeVisible();
    await expect(page.getByText("Connection", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restart OpenCode" })).toBeVisible();
  });

  test("shows default model picker", async ({ page }) => {
    await expect(page.getByText("Default Model")).toBeVisible();
    const select = page.getByRole("combobox");
    await expect(select).toBeVisible();
    // Default model from mock is anthropic/claude-sonnet-4
    await expect(select).toContainText("Claude Sonnet 4");
  });
});

test.describe("Settings - Agent Repository", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?page=settings");
    await waitForSettings(page);
    await page.getByRole("button", { name: "Agent" }).click();
  });

  test("shows second brain section with repository controls", async ({ page }) => {
    await expect(page.getByText("Second Brain")).toBeVisible();
    await expect(page.getByLabel("Second brain repository path")).toBeVisible();
    await expect(page.getByRole("button", { name: "Browse" })).toBeVisible();
  });

  test("shows repository and save controls", async ({ page }) => {
    await expect(page.getByText("Repository")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });
});
