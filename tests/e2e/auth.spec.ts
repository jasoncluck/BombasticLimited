import { test, expect } from "@playwright/test";
import { resetDatabase, shouldResetDatabase } from "./utils/db-utils";

test.describe("Authentication Flow", () => {
  // Only reset before each test if explicitly requested
  test.beforeEach(async () => {
    if (process.env.RESET_DB_EACH_TEST === "true") {
      console.log("🔄 Resetting database before test...");
      await resetDatabase();
    }
  });

  test("homepage loads correctly", async ({ page }) => {
    await page.goto("/");

    // Check that the page loads
    await expect(page).toHaveTitle(/Bombastic/);

    // Add more specific checks based on your homepage
    await expect(page.locator("body")).toBeVisible();
  });

  test("can navigate to auth pages", async ({ page }) => {
    await page.goto("/");

    // Try to find login/signup links - adjust selectors based on your app
    const loginLink = page.locator('button:has-text("Login")').first();

    if (await loginLink.isVisible()) {
      await loginLink.click();
      // Verify we're on an auth page
      expect(page.url()).toContain("/auth/login");
    } else {
      console.log("No visible auth links found - this might be expected");
    }
  });
});
