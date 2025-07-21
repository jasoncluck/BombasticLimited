import { test, expect } from "../fixtures/base-fixtures";

test.describe("Basic Navigation and Loading", () => {
  test("should load the home page successfully", async ({ homePage }) => {
    await homePage.goto("/");
    await homePage.expectPageToLoad();
    await expect(homePage.page).toHaveTitle(/bombify/i);
  });

  test("should display the latest videos section", async ({ homePage }) => {
    await homePage.goto("/");
    await homePage.expectLatestVideosSection();
  });

  test("should load without console errors", async ({ page, testUtils }) => {
    const consoleErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto("/");
    await testUtils.waitForContent({ text: "Latest Videos" });

    // Filter out known acceptable errors (like missing favicon, etc.)
    const criticalErrors = consoleErrors.filter(
      (error) =>
        !error.includes("favicon") &&
        !error.includes("robots.txt") &&
        !error.includes("404"),
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("should have proper meta tags", async ({ page }) => {
    await page.goto("/");

    // Check for viewport meta tag
    const viewportMeta = page.locator('meta[name="viewport"]');
    await expect(viewportMeta).toHaveAttribute("content", /width=device-width/);

    // Check for charset
    const charsetMeta = page.locator("meta[charset]");
    await expect(charsetMeta).toHaveAttribute("charset", "utf-8");
  });

  test("should handle network errors gracefully", async ({
    page,
    testUtils,
  }) => {
    // Simulate offline condition
    await page.context().setOffline(true);

    try {
      await page.goto("/", { timeout: 5000 });
    } catch (error) {
      // This is expected when offline
    }

    // Go back online
    await page.context().setOffline(false);
    await page.goto("/");
    await testUtils.waitForContent({ text: "Latest Videos" });

    // Page should load normally now
    await expect(page.getByText("Latest Videos")).toBeVisible();
  });
});
