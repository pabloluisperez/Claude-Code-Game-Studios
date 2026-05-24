import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for E2E tests against the local dev stack.
 *
 * Prerequisites (run once):
 *   pnpm install
 *   pnpm -F @smt/web exec playwright install
 *   docker compose up -d        # Postgres + Redis
 *   pnpm -F @smt/db db:migrate
 *   pnpm -F @smt/api dev        # in one terminal
 *
 * Then either:
 *   pnpm -F @smt/web dev        # in another terminal — playwright will reuse it
 *   pnpm -F @smt/web test:e2e   # boots its own dev server if 5173 is free
 *
 * Story: Playwright E2E follow-up
 */

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // tests share DB state — keep serial
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
