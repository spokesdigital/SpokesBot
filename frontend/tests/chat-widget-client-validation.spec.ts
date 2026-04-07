import { expect, test } from '@playwright/test'

const CLIENT_EMAIL = process.env.TEST_USER_EMAIL || 'client@test.com'
const CLIENT_PASSWORD = process.env.TEST_USER_PASSWORD || 'password123'

test.describe('Chat Widget Client Validation', () => {
  test.setTimeout(30000)

  test('renders rich chat UI for the selected report', async ({ page }) => {
    await page.goto('/login')
    await page.locator('#email').fill(CLIENT_EMAIL)
    await page.locator('#password').fill(CLIENT_PASSWORD)
    await page.getByRole('button', { name: /Sign In/i }).click()
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 })

    await expect(page.locator('#report-selector')).toBeVisible({ timeout: 10000 })

    const chatLauncher = page.getByRole('button', { name: /Open chat assistant/i })
    await chatLauncher.click({ force: true })
    await expect(page.getByTestId('chat-widget')).toBeVisible()

    const input = page.getByTestId('chat-input')
    await input.fill('Compare In-Store vs Delivery sales and show me a table and a chart.')
    await page.getByRole('button', { name: /Send message/i }).click()

    await expect(page.getByTestId('chat-follow-up-chip').first()).toBeVisible({ timeout: 20000 })
    await expect(page.locator('[data-testid="chat-widget"] table').first()).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('chat-inline-chart')).toBeVisible({ timeout: 20000 })

    const scrollTop = await page.getByTestId('chat-messages-container').evaluate(
      (element) => (element as HTMLDivElement).scrollTop,
    )
    expect(scrollTop).toBeGreaterThan(0)
  })
})
