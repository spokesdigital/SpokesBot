import { test, expect } from '@playwright/test';

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'client@test.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'password123';
const usernameInput = '#email';
const passwordInput = '#password';

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders login page with correct elements', async ({ page }) => {
    await expect(page).toHaveTitle(/SpokesBot/);
    await expect(page.getByRole('heading', { name: /Spokes Digital/i })).toBeVisible();
    await expect(page.locator(usernameInput)).toBeVisible();
    await expect(page.locator(passwordInput)).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });

  test('shows validation error on empty submit', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: /Sign In/i });
    await submitBtn.click();
    await expect(page.locator(usernameInput)).toBeFocused();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.locator(usernameInput).fill('invalid@example.com');
    await page.locator(passwordInput).fill('wrongpassword');
    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(page.getByText(/Invalid email or password/i)).toBeVisible({ timeout: 10000 });
  });

  test('successful login redirects to dashboard', async ({ page }) => {
    await page.locator(usernameInput).fill(TEST_USER_EMAIL);
    await page.locator(passwordInput).fill(TEST_USER_PASSWORD);
    await page.getByRole('button', { name: /Sign In/i }).click();

    await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
  });

  test('disables submit button while loading', async ({ page }) => {
    await page.locator(usernameInput).fill('test@example.com');
    await page.locator(passwordInput).fill('password');
    await page.getByRole('button', { name: /Sign In/i }).click();

    const btn = page.getByRole('button', { name: /Signing in/i });
    await expect(btn).toBeDisabled({ timeout: 5000 });
  });
});
