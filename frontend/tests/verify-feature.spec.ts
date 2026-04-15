import { test, expect } from '@playwright/test';

const ADMIN_EMAIL    = 'admin@test.com';
const ADMIN_PASSWORD = 'password123';

test.describe('Admin Client View Feature Verification', () => {
  test.use({ baseURL: 'http://localhost:3000' });
  test.setTimeout(90000);

  test('full verification flow: login then verify Data Management & Client View tabs', async ({ page }) => {
    // ── 1. Login ──────────────────────────────────────────────────────────
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.locator('#email').fill(ADMIN_EMAIL);
    await page.locator('#password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /Sign In/i }).click();

    // Wait for any post-login navigation to settle (can land on /dashboard or /admin/*)
    await page.waitForTimeout(3000);

    // ── 2. Navigate directly to admin clients list ─────────────────────────
    await page.goto('/admin/clients', { waitUntil: 'domcontentloaded' });

    // Confirm we are on the admin clients page (not redirected to login)
    await expect(page).not.toHaveURL(/.*login.*/, { timeout: 10000 });
    console.log('✅ Navigated to /admin/clients successfully');

    // ── 3. Find and click Acme Corp QA ───────────────────────────────────
    const clientLink = page.getByRole('link', { name: /Acme Corp QA/i }).first();
    await expect(clientLink).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'step-clients-list.png' });
    await clientLink.click();

    // Wait for client detail page
    await page.waitForURL(/.*admin\/clients\/.+/, { timeout: 15000 });
    console.log('✅ Landed on client detail page:', page.url());

    // ── 4. Assert both main tabs ──────────────────────────────────────────
    const dataTab   = page.getByRole('tab', { name: /Data Management/i });
    const clientTab = page.getByRole('tab', { name: /Client View/i });
    await expect(dataTab).toBeVisible({ timeout: 10000 });
    await expect(clientTab).toBeVisible({ timeout: 10000 });
    console.log('✅ Both main tabs visible: "Data Management" & "Client View"');

    // ── 5. Verify Data Management content ─────────────────────────────────
    await dataTab.click();
    await expect(page.getByText(/Upload Datasets/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Overview Report/i)).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'step-data-management.png' });
    console.log('✅ Data Management tab: "Upload Datasets" & "Overview Report" sections visible');

    // ── 6. Switch to Client View tab ──────────────────────────────────────
    await clientTab.click();
    await expect(page.getByText(/Viewing as/i)).toBeVisible({ timeout: 10000 });
    console.log('✅ Client View impersonation banner visible');

    // ── 7. Assert the three sub-tabs ──────────────────────────────────────
    const overviewSubTab  = page.getByRole('tab', { name: /^Overview$/i });
    const googleAdsSubTab = page.getByRole('tab', { name: /Google Ads/i });
    const metaAdsSubTab   = page.getByRole('tab', { name: /Meta Ads/i });
    await expect(overviewSubTab).toBeVisible({ timeout: 10000 });
    await expect(googleAdsSubTab).toBeVisible({ timeout: 10000 });
    await expect(metaAdsSubTab).toBeVisible({ timeout: 10000 });
    console.log('✅ Client View sub-tabs visible: Overview | Google Ads | Meta Ads');

    // ── 8. Click Meta Ads sub-tab and screenshot ──────────────────────────
    await metaAdsSubTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'step-meta-ads-view.png' });
    console.log('✅ Meta Ads sub-tab clicked — screenshot saved');

    // ── 9. Click Google Ads sub-tab and screenshot ────────────────────────
    await googleAdsSubTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'step-google-ads-view.png' });
    console.log('✅ Google Ads sub-tab clicked — screenshot saved');

    // ── 10. Back to Overview and screenshot ──────────────────────────────
    await overviewSubTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'step-overview-view.png' });
    console.log('✅ Overview sub-tab clicked — screenshot saved');

    console.log('\n🎉 All verification checks PASSED!');
  });
});
