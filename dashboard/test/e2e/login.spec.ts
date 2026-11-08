import { test, expect } from '@playwright/test';

test.describe('Login flow', () => {
  test('logs in with valid credentials and lands on reservations', async ({ page }) => {
    await page.goto('http://localhost:3001/');

    // Unauthenticated → redirected to /login
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel(/email/i).fill('owner@test.com');
    await page.getByLabel(/password/i).fill('correct-horse-battery');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/reservations/);
    await expect(page.getByRole('heading', { name: /reservations/i })).toBeVisible();
    await expect(page.getByText('Abeba Pharmacy')).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('http://localhost:3001/login');
    await page.getByLabel(/email/i).fill('owner@test.com');
    await page.getByLabel(/password/i).fill('wrong');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/email or password is incorrect/i)).toBeVisible();
  });
});