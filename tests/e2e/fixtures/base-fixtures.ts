import { test as base } from "@playwright/test";
import { HomePage } from "../pages/home-page";
import { TestUtils } from "../utils/test-utils";

type TestFixtures = {
  homePage: HomePage;
  testUtils: TestUtils;
};

export const test = base.extend<TestFixtures>({
  homePage: async ({ page }, use) => {
    const homePage = new HomePage(page);
    await use(homePage);
  },

  testUtils: async ({ page }, use) => {
    const testUtils = new TestUtils(page);
    await use(testUtils);
  },
});

export { expect } from "@playwright/test";
