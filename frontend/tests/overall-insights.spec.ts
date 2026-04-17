import { expect, test } from '@playwright/test'

const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'client@test.com'
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'password123'

test.describe('Overall AI Insights Dashboard', () => {
  test('renders the insights panel below the charts without breaking the dashboard shell', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill(TEST_USER_EMAIL)
    await page.locator('#password').fill(TEST_USER_PASSWORD)
    await page.getByRole('button', { name: /Sign In/i }).click()

    await expect(page).toHaveURL(/.*dashboard/, { timeout: 15000 })

    const insightsHeading = page.getByRole('heading', { name: /Overall AI Insights/i })
    await expect(insightsHeading).toBeVisible({ timeout: 20000 })

    const insightsSection = insightsHeading.locator('xpath=ancestor::section[1]')
    const trendHeading = page.getByRole('heading', { name: /Revenue vs Cost Trend/i })
    const splitHeading = page.getByRole('heading', { name: /Revenue Split/i })

    await expect(trendHeading).toBeVisible()
    await expect(splitHeading).toBeVisible()

    const trendBox = await trendHeading.boundingBox()
    const insightsBox = await insightsSection.boundingBox()
    expect(trendBox).not.toBeNull()
    expect(insightsBox).not.toBeNull()
    expect((insightsBox?.y ?? 0)).toBeGreaterThan(trendBox?.y ?? 0)

    await expect(page.getByText('IMPRESSIONS').first()).toBeVisible()

    const badge = insightsSection.getByText('AI-POWERED')
    await expect(badge).toBeVisible()

    const emptyState = insightsSection.getByText(/Insights will appear once the active dataset is ready for AI analysis/i)
    if (await emptyState.isVisible()) {
      await expect(emptyState).toBeVisible()
    } else {
      const insightRows = insightsSection.locator('svg')
      await expect(insightRows.first()).toBeVisible()
      expect(await insightRows.count()).toBeGreaterThanOrEqual(4)

      const iconColors = await insightRows.evaluateAll((nodes) =>
        nodes.map((node) => window.getComputedStyle(node).color),
      )
      expect(
        iconColors.some((color) =>
          ['rgb(34, 197, 94)', 'rgb(59, 130, 246)', 'rgb(234, 179, 8)', 'rgb(249, 115, 22)'].includes(color),
        ),
      ).toBeTruthy()
    }

    const chatLauncher = page.getByRole('button', { name: /Open chat assistant/i })
    await expect(chatLauncher).toBeVisible()
    await chatLauncher.click({ force: true })
    await expect(page.getByRole('button', { name: /Close chat assistant/i })).toBeVisible()
    await expect(page.getByText(/Spokes AI Assistant/i)).toBeVisible({ timeout: 10000 })
  })
})
