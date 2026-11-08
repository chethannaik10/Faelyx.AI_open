import { defineConfig } from '@playwright/test';

// End-to-end walkthrough of the Sketch & 2D tools against the real app:
// the Vite dev server plus the real cad_server.py backend (constraint
// solver + Open Cascade). `npm run test:e2e`; reuses servers already up.
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/warmup.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:5174', viewport: { width: 1600, height: 950 } },
  webServer: [
    {
      command: "bash -c 'cd ../cad-server && source ./activate_venv.sh && uvicorn cad_server:app --port 8000'",
      url: 'http://127.0.0.1:8000/health',
      reuseExistingServer: true,
      timeout: 300_000,
    },
    { command: 'npm run dev -- --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: true },
  ],
});
