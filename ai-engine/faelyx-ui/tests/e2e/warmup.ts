import { chromium, type FullConfig } from '@playwright/test';

// Loads the app once before the tests: the dev server compiles modules on
// first request, and on a cold start that alone can outlast a test's
// timeout.
export default async function warmup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL as string;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(baseURL, { timeout: 180_000 });
  await page.getByRole('button', { name: /^Front Plane/ }).waitFor({ timeout: 180_000 });
  await browser.close();
}
