import { chromium, type FullConfig } from "@playwright/test";

async function globalSetup(config: FullConfig) {
  try {
    // Launch browser to warm up for faster test execution
    const browser = await chromium.launch();
    await browser.close();
    console.log("✓ Global setup completed");
  } catch (error) {
    console.warn(
      "⚠ Browser warmup failed, tests may run slower:",
      (error as Error).message,
    );
  }
}

export default globalSetup;
