import { test, expect } from '@playwright/test';

test.describe('Session lifecycle', () => {
  test('create session and land in studio', async ({ page }) => {
    const jsErrors = [];
    page.on('pageerror', (e) => jsErrors.push(e.message));

    await page.goto('/new');
    await expect(page.getByRole('heading', { name: 'NEW SESSION' })).toBeVisible();

    const name = `E2E ${Date.now()}`;
    await page.getByPlaceholder(/DARK ZONE/i).fill(name);
    await page.getByRole('button', { name: /Create Session/i }).click();

    await expect(page).toHaveURL(/\/studio\/[0-9a-f-]{36}/i, { timeout: 30_000 });
    await expect(page.locator('button.record-btn-spec')).toBeVisible({ timeout: 15_000 });

    expect(jsErrors, jsErrors.join('\n')).toEqual([]);
  });
});
