import { defineConfig } from 'vitest/config';

// Unit tests for the pure sketch modules (profile tracing, 2D geometry).
// The browser walkthrough lives in tests/e2e and runs under Playwright.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'] },
});
