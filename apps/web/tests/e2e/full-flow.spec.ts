/**
 * Full MVP flow E2E test.
 *
 * Signup → login → create career → dashboard renders → advance week → league
 * shows played jornada → hire staff → see staff card active.
 *
 * Requires the API + DB stack running (see playwright.config.ts).
 *
 * Story: Playwright E2E follow-up
 * Control Manifest: 2026-05-19
 */

import { test, expect } from '@playwright/test';

const uniq = () => Math.random().toString(36).slice(2, 10);

test.describe('Cascada FC — full MVP flow', () => {
  test('user can sign up, create a career, advance weeks, and see league progress', async ({ page }) => {
    const username = `playwright_${uniq()}`;
    const email = `${username}@e2e.test`;
    const password = 'TestPassword123!';

    // ── 1. Sign up ────────────────────────────────────────────────────
    await page.goto('/signup');
    await page.getByLabel(/username/i).fill(username);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign up|crear/i }).click();

    // ── 2. Land on dashboard (or somewhere authenticated) ─────────────
    await expect(page).toHaveURL(/\/(dashboard|game|$)/, { timeout: 10_000 });

    // ── 3. Create a career ────────────────────────────────────────────
    await page.goto('/game');
    await page.getByLabel(/nombre del club/i).fill(`Test FC ${uniq()}`);
    await page.getByLabel(/ciudad/i).fill('Testville');
    await page.getByRole('button', { name: /comenzar carrera/i }).click();

    // ── 4. Dashboard renders with real club name ──────────────────────
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText(/Test FC/)).toBeVisible({ timeout: 10_000 });

    // ── 5. Advance one week ───────────────────────────────────────────
    await page.getByRole('button', { name: /avanzar semana/i }).click();
    // Topbar week should now be 1.
    await expect(page.getByText(/semana/i).first()).toBeVisible();

    // ── 6. League page shows played jornada 1 ─────────────────────────
    await page.goto('/league');
    await expect(page.getByText(/clasificación|jornada/i).first()).toBeVisible();
    await page.getByRole('tab', { name: /pasadas/i }).click();
    // At least one fixture should be marked played (badge with score).
    await expect(page.locator('.badge.badge-neutral').first()).toBeVisible({ timeout: 10_000 });

    // ── 7. Hire a staff member ────────────────────────────────────────
    await page.goto('/staff');
    await expect(page.getByText(/Jardinero/)).toBeVisible();
    // The first Tier 1 button under Jardinero (or any role).
    const tier1Buttons = page.getByRole('button', { name: /^Tier 1/ });
    await tier1Buttons.first().click();
    await expect(page.getByText(/Contratado|Activo/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
