import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('loads sessions view when backend is up', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));

    await page.goto('/');
    await expect(page).toHaveTitle(/Rap Factory/i);
    await expect(page.getByRole('heading', { name: 'YOUR SESSIONS' })).toBeVisible();
    await expect(page.locator('a.btn.btn-primary[href="/new"]')).toBeVisible();

    expect(jsErrors, jsErrors.join('\n')).toEqual([]);
  });
});
