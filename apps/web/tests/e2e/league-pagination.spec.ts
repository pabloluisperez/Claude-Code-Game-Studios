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
  // Wait for signup to complete before navigating (avoids a /login race).
  await expect(page).toHaveURL(/\/(dashboard|game|$)/, { timeout: 10_000 });

  await page.goto('/game');
  // Manager name is required (added after this spec was first written).
  await page.getByLabel(/tu nombre como m[áa]nager/i).fill(`Mgr ${uniq()}`);
  await page.getByLabel(/nombre del club/i).fill(`League FC ${uniq()}`);
  await page.getByLabel(/ciudad/i).fill('League City');
  await page.getByRole('button', { name: /comenzar carrera/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  // Advance several weeks via the dashboard form action (deterministic; the
  // 7-day transition modal UI itself is covered by happy-path.spec.ts). This
  // keeps the league-standings assertion below free of modal-timing flakiness.
  for (let i = 0; i < 6; i++) {
    await page.evaluate(async () => {
      const fd = new FormData();
      fd.set('redirectMode', 'skip');
      await fetch('/dashboard?/advance', {
        method: 'POST',
        body: fd,
        headers: { 'x-sveltekit-action': 'true' },
      });
    });
  }

  await page.goto('/league');

  // Standings table accumulates: group size varies by division, so assert the
  // table has a sensible number of rows and the leader has played matches.
  const rows = page.locator('table tbody tr');
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(10);

  // Top row should show > 0 played matches.
  const firstRowPlayed = rows.first().locator('td').nth(2);
  await expect(firstRowPlayed).not.toHaveText(/^0$/);
});
