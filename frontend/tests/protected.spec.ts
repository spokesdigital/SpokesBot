import { test, expect } from '@playwright/test';

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'client@test.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'password123';
const usernameInput = '#email';
const passwordInput = '#password';

test.describe('Protected Routes', () => {
  test('unauthenticated user visiting /dashboard is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/.*login/, { timeout: 10000 });
  });

  test('unauthenticated user visiting root is redirected to /login', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveURL(/.*login/, { timeout: 10000 });
  });

  test('authenticated user can access /dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.locator(usernameInput).fill(TEST_USER_EMAIL);
    await page.locator(passwordInput).fill(TEST_USER_PASSWORD);
    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
  });

  test('direct navigation to protected routes redirects when not logged in', async ({ page }) => {
    const protectedRoutes = ['/dashboard', '/datasets/upload', '/chat'];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/.*login/, { timeout: 10000 });
    }
  });
});
