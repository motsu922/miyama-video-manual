import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { unlockViewer } from './viewer-login.mjs'

const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5176/'
const screenshots = 'node_modules/.tmp/password-gate'
await fs.mkdir(screenshots, { recursive: true })
try {
  for (const width of [1440, 1024, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1024 ? 768 : 844 } })
    const page = await context.newPage()
    let appLoads = 0
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/src/App.tsx', route => {
      appLoads++
      return route.fulfill({ contentType: 'text/javascript', body: "export default function App() { return 'Unlocked test application' }" })
    })
    const url = `${base}?manual=qr-test&view=decision`
    await page.goto(url)
    await page.getByRole('heading', { name: 'ミヤマ工業 WEBマニュアル' }).waitFor()
    assert.equal(appLoads, 0, 'App and Firebase must not initialize before unlocking')
    assert.ok(await page.getByRole('button', { name: 'マニュアルを開く' }).isDisabled())
    const input = page.getByLabel('閲覧パスワード', { exact: true })
    assert.equal(await input.getAttribute('type'), 'password')
    await input.fill('incorrect-password')
    await page.getByRole('button', { name: 'パスワードを表示', exact: true }).click()
    assert.equal(await input.getAttribute('type'), 'text')
    await page.getByRole('button', { name: 'パスワードを隠す', exact: true }).click()
    await input.press('Enter')
    await page.getByRole('alert').waitFor()
    assert.equal(appLoads, 0)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.ok(await page.locator('.manual-access-logo').evaluate(img => img.complete && img.naturalWidth > 0))
    await page.screenshot({ path: `${screenshots}/${width}-error.png` })
    await unlockViewer(page)
    await page.getByText('Unlocked test application', { exact: true }).waitFor()
    assert.equal(appLoads, 1)
    assert.equal(page.url(), url, 'QR destination must survive unlocking')
    assert.equal(await page.evaluate(password => Object.values(sessionStorage).includes(password), process.env.TEST_VIEWER_PASSWORD), false)
    await page.reload()
    await page.getByText('Unlocked test application', { exact: true }).waitFor()
    assert.equal(await page.locator('.manual-access-screen').count(), 0)
    await page.evaluate(() => sessionStorage.clear())
    await page.reload()
    await input.waitFor()
    assert.deepEqual(errors, [])
    await context.close()
    console.log(`PASS ${width}px: masked input, wrong password, unlock, QR retention, session refresh, relock, no pre-unlock App load`)
  }
  const page = await browser.newPage()
  await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage unavailable') } }))
  await page.route('**/src/App.tsx', route => route.fulfill({ contentType: 'text/javascript', body: "export default function App() { return 'Memory-only unlock' }" }))
  await page.goto(base)
  await unlockViewer(page)
  await page.getByText('Memory-only unlock', { exact: true }).waitFor()
  await page.reload()
  await page.getByLabel('閲覧パスワード', { exact: true }).waitFor()
  console.log('PASS blocked storage: in-memory unlock works and reload locks again')
} finally { await browser.close() }

