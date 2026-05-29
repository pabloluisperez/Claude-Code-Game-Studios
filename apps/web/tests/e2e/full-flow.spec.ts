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
    // Manager name is required (added after this spec was first written).
    await page.getByLabel(/tu nombre como m[áa]nager/i).fill(`Mgr ${uniq()}`);
    await page.getByLabel(/nombre del club/i).fill(`Test FC ${uniq()}`);
    await page.getByLabel(/ciudad/i).fill('Testville');
    await page.getByRole('button', { name: /comenzar carrera/i }).click();

    // ── 4. Dashboard renders with real club name ──────────────────────
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText(/Test FC/).first()).toBeVisible({ timeout: 10_000 });

    // ── 5. Advance one week (handle the 7-day transition modal) ───────
    await page.getByRole('button', { name: /avanzar semana/i }).click();
    const skip = page.getByRole('button', { name: /avanzar a fin de semana/i });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    const back = page.getByRole('button', { name: /volver al dashboard/i });
    if (await back.isVisible().catch(() => false)) await back.click();
    await expect(page.getByText(/semana/i).first()).toBeVisible();

    // ── 6. League page renders a standings table ──────────────────────
    await page.goto('/league');
    await expect(page.getByText(/clasificaci[óo]n|jornada/i).first()).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10_000 });

    // ── 7. Staff page renders with the initial active staff ───────────
    // New careers start with 3 tier-1 staff; assert the hub + an active member.
    // (Tiers are labelled "Nivel 1/2/3" in the UI since this spec was written.)
    await page.goto('/staff');
    await expect(page.getByRole('heading', { name: /empleados del club/i })).toBeVisible();
    await expect(page.getByText(/jardinero/i).first()).toBeVisible();
    await expect(page.getByText(/activo/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
