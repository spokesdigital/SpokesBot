import { test, expect } from '@playwright/test';
import * as path from 'path';

const ADMIN_EMAIL = 'admin@test.com';
const ADMIN_PASSWORD = 'password123';

test.describe('Admin Dataset Upload Flow', () => {
  test('admin login, navigate to clients, upload CSV and verify completion', async ({ page }) => {
    // Step 1: Navigate to login
    await page.goto('/login', { waitUntil: 'networkidle', timeout: 15000 });
    await expect(page).toHaveTitle(/SpokesBot/, { timeout: 10000 });

    // Step 2: Login with Admin credentials
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /Sign In/i }).click();

    // Step 3: Wait for login redirect (admins get redirected to /admin/clients)
    await expect(page).toHaveURL(/.*admin\/clients/, { timeout: 15000 });
    await expect(page.getByRole('heading', { name: /Clients Console/i })).toBeVisible({ timeout: 10000 });

    // Step 5: Select first client org card
    const orgCards = page.locator('a[href*="/admin/clients/"]');
    await expect(orgCards.first()).toBeVisible({ timeout: 15000 });
    await orgCards.first().click();

    // Step 6: Verify we're on the org detail page
    await expect(page).toHaveURL(/.*admin\/clients\/[^/]+$/, { timeout: 15000 });

    // Step 7: Upload test CSV via file input
    const csvPath = path.join(__dirname, '../../test_data.csv');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(csvPath, { timeout: 15000 });

    // Step 8: Verify upload processing state appears
    await expect(page.getByText(/Processing CSV/i)).toBeVisible({ timeout: 15000 });

    // Step 9: Wait for completion (polling up to 60s)
    await expect(page.getByText(/Dataset ready/i)).toBeVisible({ timeout: 60000 });

    // Step 10: Verify dataset appears in table with completed status
    const completedBadge = page.locator('span.rounded-full:has-text("completed")').first();
    await expect(completedBadge).toBeVisible({ timeout: 15000 });

    // Verify the dataset row contains expected content
    const datasetRow = page.locator('.glass-panel', { hasText: 'completed' }).first();
    await expect(datasetRow).toBeVisible({ timeout: 10000 });
    await expect(datasetRow.getByText(/rows/)).toBeVisible({ timeout: 10000 });
  });
});
