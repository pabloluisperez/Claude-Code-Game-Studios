/**
 * League-specific E2E: advances several weeks and verifies standings
 * accumulate matches played + a top-of-table club emerges.
 *
 * Story: Playwright E2E follow-up
 * Control Manifest: 2026-05-19
 */

import { test, expect } from '@playwright/test';

const uniq = () => Math.random().toString(36).slice(2, 10);

test('league standings accumulate as weeks advance', async ({ page }) => {
  const username = `playwright_${uniq()}`;
  const email = `${username}@e2e.test`;
  const password = 'TestPassword123!';

  await page.goto('/signup');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign up|crear/i }).click();

  await page.goto('/game');
  await page.getByLabel(/nombre del club/i).fill(`League FC ${uniq()}`);
  await page.getByLabel(/ciudad/i).fill('League City');
  await page.getByRole('button', { name: /comenzar carrera/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  // Advance 4 weeks
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /avanzar semana/i }).click();
    await page.waitForTimeout(500);
  }

  await page.goto('/league');

  // Standings table must have 12 rows (one per club).
  const rows = page.locator('table tbody tr');
  await expect(rows).toHaveCount(12);

  // Top row should show > 0 played matches.
  const firstRowPlayed = rows.first().locator('td').nth(2);
  await expect(firstRowPlayed).not.toHaveText(/^0$/);
});
