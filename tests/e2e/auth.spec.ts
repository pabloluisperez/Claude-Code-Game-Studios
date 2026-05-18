import { test, expect } from '@playwright/test';

test.describe('auth flow', () => {
  test('can sign up and reach the home page', async ({ page }) => {
    const unique = Date.now();
    await page.goto('/signup');
    await page.fill('[name="email"]', `user${unique}@test.com`);
    await page.fill('[name="username"]', `user${unique}`);
    await page.fill('[name="password"]', 'password123');
    await page.click('[type="submit"]');
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=Continue Managing')).toBeVisible();
  });

  test('shows error on invalid login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="email"]', 'nobody@test.com');
    await page.fill('[name="password"]', 'wrongpassword');
    await page.click('[type="submit"]');
    await expect(page.locator('[role="alert"]')).toBeVisible();
  });
});
