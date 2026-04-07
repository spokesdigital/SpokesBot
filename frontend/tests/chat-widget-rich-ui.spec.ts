import path from 'path'

import { expect, test } from '@playwright/test'

const ADMIN_EMAIL = 'admin@test.com'
const ADMIN_PASSWORD = 'password123'
const CLIENT_EMAIL = process.env.TEST_USER_EMAIL || 'client@test.com'
const CLIENT_PASSWORD = process.env.TEST_USER_PASSWORD || 'password123'

test.describe('Chat Widget Rich UI', () => {
  test.setTimeout(30000)

  test('renders markdown, chart, auto-scroll, and follow-up chips', async ({ page }) => {
    const reportName = `Chat Widget QA ${Date.now()}`
    const csvPath = path.join(__dirname, 'fixtures', 'chat-widget-sales.csv')

    await page.goto('/login')
    await page.locator('#email').fill(ADMIN_EMAIL)
    await page.locator('#password').fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: /Sign In/i }).click()
    await expect(page).toHaveURL(/.*admin\/clients/, { timeout: 10000 })

    await page.locator('a', { hasText: 'Acme Corp QA' }).first().click()
    await expect(page).toHaveURL(/.*admin\/clients\/[^/]+$/, { timeout: 10000 })

    await page.locator('#client-report-name').fill(reportName)
    await page.locator('input[type="file"]').setInputFiles(csvPath)
    await expect(page.getByText(/Dataset ready/i)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(reportName).first()).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: /Sign Out/i }).click()
    await expect(page).toHaveURL(/.*login/, { timeout: 10000 })

    await page.locator('#email').fill(CLIENT_EMAIL)
    await page.locator('#password').fill(CLIENT_PASSWORD)
    await page.getByRole('button', { name: /Sign In/i }).click()
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 })

    await page.locator('#report-selector').selectOption({ label: reportName })

    const chatLauncher = page.getByRole('button', { name: /Open chat assistant/i })
    await chatLauncher.click({ force: true })
    await expect(page.getByTestId('chat-widget')).toBeVisible()

    const input = page.getByTestId('chat-input')
    await input.fill('Compare In-Store vs Delivery sales and show me a table and a chart.')
    await page.getByRole('button', { name: /Send message/i }).click()

    await expect(page.getByText(/SUGGESTED FOLLOW-UPS/i)).toBeVisible({ timeout: 15000 })
    await expect(page.locator('[data-testid="chat-widget"] table').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('chat-inline-chart')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('chat-follow-up-chip').first()).toBeVisible({ timeout: 15000 })

    const scrollTop = await page.getByTestId('chat-messages-container').evaluate(
      (element) => (element as HTMLDivElement).scrollTop,
    )
    expect(scrollTop).toBeGreaterThan(0)
  })
})
