import { chromium, type FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  // Launch browser to warm up for faster test execution
  const browser = await chromium.launch();
  await browser.close();
  
  console.log('✓ Global setup completed');
}

export default globalSetup;