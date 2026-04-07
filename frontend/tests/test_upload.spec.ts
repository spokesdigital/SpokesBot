import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Admin CSV Upload Test', () => {
  test.setTimeout(60000); // 60 seconds timeout

  test('successfully login as admin and upload CSV data', async ({ page }) => {
    // 1. Visit Login
    console.log("Navigating to login...");
    await page.goto('/login');
    
    // 2. Fill admin credentials
    console.log("Filling admin credentials...");
    await page.locator('input[name="email"]').fill('admin@test.com');
    await page.locator('input[name="password"]').fill('password123');
    await page.getByRole('button', { name: /Sign In/i }).click();

    // 3. Wait for dashboard view or admin view
    console.log("Waiting for dashboard...");
    await page.waitForURL('**/dashboard*');

    // 4. Navigate to Clients Console
    console.log("Navigating to /admin/clients...");
    await page.goto('/admin/clients');

    // Wait for the clients list to load by waiting for a link to a client detail page
    // Using a generic approach since we know there is an Acme Corp QA
    console.log("Looking for Acme Corp QA...");
    const clientLink = page.locator('a', { hasText: 'Acme Corp QA' }).first();
    await clientLink.waitFor();
    await clientLink.click();

    // 5. Client detail page loaded, find upload zone
    console.log("On client detail page, waiting for Upload Dataset...");
    await expect(page.locator('h2').filter({ hasText: 'Upload Dataset' })).toBeVisible();

    // 6. Upload file
    const filePath = path.resolve('../test_data.csv');
    console.log("Uploading file from ", filePath);
    
    // Playwright needs the input[type=file] element to use setInputFiles
    // Assuming the UploadZone component renders an input type file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // 7. Wait for processing to finish (we know it shows a success message or the dataset appears)
    console.log("Waiting for Datasets list to update...");
    // Check if the file "test_data.csv" appears in the datasets list
    const uploadedDataset = page.locator('text=test_data.csv');
    await expect(uploadedDataset).toBeVisible({ timeout: 15000 });
    
    // Also check for "completed" status
    const statusText = page.locator('text=completed').first();
    await expect(statusText).toBeVisible({ timeout: 15000 });

    console.log("Test completely successful!");
  });
});
