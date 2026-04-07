const { chromium } = require('playwright')

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ baseURL: 'http://localhost:3000' })
  const logs = []
  const log = (label, value) => logs.push(`${label}=${value}`)

  console.log('step=goto-login')
  await page.goto('/login')
  console.log('step=filled-login-form')
  await page.fill('#email', 'client@test.com')
  await page.fill('#password', 'password123')
  console.log('step=click-sign-in')
  await page.getByRole('button', { name: /Sign In/i }).click()
  console.log('step=waiting-after-click')
  await page.waitForTimeout(8000)
  console.log('step=post-wait')
  log('post-login-url', page.url())
  const loginError = await page.locator('text=Invalid email or password').first().isVisible().catch(() => false)
  log('login-error-visible', loginError)
  if (!page.url().includes('/dashboard')) {
    console.log('step=not-on-dashboard')
    console.log(logs.join('\n'))
    await browser.close()
    return
  }

  console.log('step=on-dashboard')
  await page.waitForLoadState('networkidle')
  console.log('step=networkidle')
  await page.waitForSelector('text=Overall AI Insights', { timeout: 30000 })
  console.log('step=insights-visible')

  assert(!page.url().includes('/admin/clients'), 'Client login was redirected to admin flow')

  const kpiCards = page.locator('div.grid.gap-4.md\\:grid-cols-2.xl\\:grid-cols-7 > div')
  const kpiTexts = await kpiCards.evaluateAll((cards) =>
    cards.map((card) => card.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
  )
  log('kpi-card-count', kpiTexts.length)
  log('kpi-card-texts', kpiTexts.join(' || '))

  const chartHeadingTexts = await page.locator('h3').allTextContents()
  log('chart-headings', chartHeadingTexts.join(' | '))

  const insightPanel = page.locator('section').filter({ has: page.getByText('Overall AI Insights', { exact: true }) }).first()
  const insightBox = await insightPanel.boundingBox()
  assert(insightBox, 'Overall AI Insights panel is not visible')
  log('insight-panel-box', JSON.stringify(insightBox))

  const trendHeading = page.getByText('Revenue vs Cost Trend', { exact: true })
  const splitHeading = page.getByText('Revenue Split', { exact: true })
  const chartTrendBox = await trendHeading.locator('xpath=ancestor::div[contains(@class, "rounded-[1.7rem]")][1]').boundingBox()
  const chartSplitBox = await splitHeading.locator('xpath=ancestor::div[contains(@class, "rounded-[1.7rem]")][1]').boundingBox()
  assert(chartTrendBox && chartSplitBox, 'Chart panels were not found')
  log('trend-panel-box', JSON.stringify(chartTrendBox))
  log('split-panel-box', JSON.stringify(chartSplitBox))
  assert(insightBox.y > chartTrendBox.y && insightBox.y > chartSplitBox.y, 'Insights panel is not below the chart row')

  const rows = insightPanel.locator('div.flex.w-full.items-start')
  const rowCount = await rows.count()
  log('insight-row-count', rowCount)
  const panelText = (await insightPanel.textContent())?.replace(/\s+/g, ' ').trim() ?? ''
  log('insight-panel-text', panelText)
  const divClasses = await insightPanel.locator('div').evaluateAll((nodes) =>
    nodes.map((node) => node.className || ''),
  )
  log('insight-panel-div-classes', divClasses.join(' || '))
  assert(rowCount >= 3, 'Expected 3 or more insight rows')

  const rowTexts = []
  const iconColors = []
  for (let i = 0; i < rowCount; i += 1) {
    const row = rows.nth(i)
    rowTexts.push((await row.textContent())?.replace(/\s+/g, ' ').trim() ?? '')
    const svg = row.locator('svg').first()
    iconColors.push(await svg.evaluate((el) => getComputedStyle(el).color))
  }
  log('insight-row-texts', rowTexts.join(' || '))
  log('icon-colors', iconColors.join(' | '))

  await page.getByRole('button', { name: /Open chat assistant/i }).click()
  await page.waitForSelector('text=Spokes AI Assistant', { timeout: 15000 })
  log('chat-widget-open', 'true')

  const chatInput = page.locator('input[placeholder="Ask a question…"]')
  assert(await chatInput.isVisible(), 'Chat input is not visible after opening the widget')
  log('chat-input-visible', 'true')

  console.log(logs.join('\n'))
  await browser.close()
})().catch(async (error) => {
  console.error(String(error?.stack || error))
  process.exitCode = 1
})
