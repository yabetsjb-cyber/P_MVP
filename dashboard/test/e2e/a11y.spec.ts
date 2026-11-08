import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('login page has no WCAG AA violations', async ({ page }) => {
    await page.goto('http://localhost:3001/login');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('authenticated shell has no WCAG AA violations', async ({ page }) => {
    await page.goto('http://localhost:3001/login');
    await page.getByLabel(/email/i).fill('owner@test.com');
    await page.getByLabel(/password/i).fill('correct-horse-battery');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/reservations/);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});