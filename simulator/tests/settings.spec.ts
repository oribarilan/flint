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

  test("shows OpenCode connection status", async ({ page }) => {
    await expect(page.getByText("OpenCode", { exact: true })).toBeVisible();
    await expect(page.getByText("AI backend powering the agent")).toBeVisible();
  });

  test("shows default model picker", async ({ page }) => {
    await expect(page.getByText("Default model")).toBeVisible();
    const select = page.getByRole("combobox");
    await expect(select).toBeVisible();
    await expect(select).toContainText("Claude Opus 4.6");
  });

  test("shows provider auth status", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Providers" })).toBeVisible();
    await expect(page.getByText("Anthropic", { exact: true })).toBeVisible();
    await expect(page.getByText("OpenAI", { exact: true })).toBeVisible();
    await expect(page.getByText("Google", { exact: true })).toBeVisible();
    await expect(page.getByText("OpenCode Zen", { exact: true })).toBeVisible();
  });
});

test.describe("Settings - Brain", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?page=settings");
    await waitForSettings(page);
    await page.getByRole("button", { name: "Brain" }).click();
  });

  test("shows Second Brain section", async ({ page }) => {
    await expect(page.getByText("Second Brain")).toBeVisible();
    await expect(page.getByText("Connected")).toBeVisible();
  });

  test("shows repo path with change button", async ({ page }) => {
    await expect(page.getByText("Repository")).toBeVisible();
    await expect(page.getByText("/Users/demo/second-brain")).toBeVisible();
    await expect(page.getByRole("button", { name: "Change" })).toBeVisible();
  });
});
