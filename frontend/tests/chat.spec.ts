import { test, expect } from '@playwright/test';

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'client@test.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'password123';
const usernameInput = '#email';
const passwordInput = '#password';

test.describe('Chat Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.locator(usernameInput).fill(TEST_USER_EMAIL);
    await page.locator(passwordInput).fill(TEST_USER_PASSWORD);
    await page.getByRole('button', { name: /Sign In/i }).click();
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
  });

  test('can navigate to chat page', async ({ page }) => {
    await page.goto('/chat');
    await expect(page).toHaveURL(/.*chat/, { timeout: 10000 });
  });

  test('chat page loads with input field', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.locator('input, textarea').first()).toBeVisible({ timeout: 10000 });
  });

  test('new chat requires a dataset before the composer is enabled', async ({ page }) => {
    await page.goto('/chat');
    await page.getByRole('button', { name: /New Chat/i }).click();

    await expect(page.getByText(/Upload a dataset first before starting a chat\./i)).toBeVisible();
    await expect(page.locator('form input[type="text"]').first()).toBeDisabled();
  });

  test('chat keeps send controls disabled until a conversation exists', async ({ page }) => {
    await page.goto('/chat');

    await expect(page.locator('form input[type="text"]').first()).toBeDisabled();
    await expect(page.locator('form button[type="submit"]').first()).toBeDisabled();
  });
});
