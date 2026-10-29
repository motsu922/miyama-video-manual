import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { unlockViewer } from './viewer-login.mjs'

const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5176/'
const out = 'node_modules/.tmp/authoring-sections'
await fs.mkdir(out, { recursive: true })
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', dialog => dialog.accept())

// A silent PCM fixture exercises media playback without external files or network access.
const wav = Buffer.alloc(44 + 8000 * 20 * 2)
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34)
wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40)
const videoUrl = `data:audio/wav;base64,${wav.toString('base64')}`
const manual = {
  id: 'sections-test', title: '作成セクションの確認', workName: '検査作業', controlNo: 'TEST-01', productName: 'テスト品',
  department: 'テスト部署', owner: 'テスト担当', status: 'draft', version: 'v1.0', duration: '00:20', updatedAt: '2026-10-29',
  videoUrl, thumbnail: '', tags: [], reviewers: [], checks: [], approvalHistory: [],
  steps: [{ id: 1, title: '部品を確認', detail: '現品と番号を確認', time: '00:00' }],
  decisionStartNodeId: 'a', decisionNodes: [
    { id: 'a', type: 'action', title: '安全を確認', detail: '周囲を確認', nextNodeId: 'b', flowPosition: { x: 38, y: 30 } },
    { id: 'b', type: 'end', title: '完了', detail: '', flowPosition: { x: 350, y: 30 } },
  ],
}
const chapterOnly = { ...manual, id: 'chapter-only', title: 'チャプターのみ', decisionNodes: [], decisionStartNodeId: undefined }
await page.route('**/src/manualRepository.ts*', route => route.fulfill({ contentType: 'text/javascript', body: `
window.testSaves=[];
export const subscribeManuals=cb=>{cb(${JSON.stringify([manual, chapterOnly])});return()=>{};};
export const subscribeFlashTestResults=(id,cb)=>{cb([]);return()=>{};};
export const ensureSignedIn=async()=>{};
export const saveManual=async manual=>{window.testSaves.push(structuredClone(manual));};
const prohibited=async()=>{throw Error('Unexpected write in section test');};
export const uploadManualVideo=prohibited,uploadManualImage=prohibited,uploadInspectionImage=prohibited,deleteManual=prohibited,recordManualView=prohibited,recordFlashTestResult=prohibited;
` }))
await page.route(/https:\/\/.*(googleapis|firebasestorage)\.com\/.*/, route => route.abort())

try {
  await page.goto(base)
  await unlockViewer(page)
  await page.locator('.manual-list').getByRole('button', { name: '編集', exact: true }).first().click()
  const flowTab = page.getByRole('tab', { name: 'フローチャート作成', exact: true })
  const stepsTab = page.getByRole('tab', { name: '手順作成', exact: true })
  const flow = page.locator('#authoring-flow-panel')
  const steps = page.locator('#authoring-steps-panel')
  assert.equal(await flowTab.getAttribute('aria-selected'), 'true')
  assert.equal(await flow.isVisible(), true)
  assert.equal(await steps.isVisible(), false)
  assert.equal(await page.locator('.editor-workspace > :first-child h2').first().innerText(), '基本情報')
  await page.locator('.form-panel').getByLabel('作業名', { exact: true }).fill('基本情報の変更を保持')
  await flow.getByRole('button', { name: '作業: 安全を確認', exact: true }).click()
  const cardEditor = page.getByRole('dialog')
  await cardEditor.getByLabel('表示内容', { exact: true }).fill('安全を再確認')
  await cardEditor.getByRole('button', { name: '確定', exact: true }).click()
  await stepsTab.click()
  assert.equal(await flow.isVisible(), false)
  assert.equal(await steps.isVisible(), true)
  await steps.getByLabel('手順名', { exact: true }).fill('製品番号を照合')
  await steps.getByRole('textbox', { name: /^説明/ }).fill('番号が一致していることを確認')
  await stepsTab.focus()
  for (const key of ['Delete', 'Control+z', 'Control+v']) await page.keyboard.press(key)
  assert.equal(await flow.locator('.decision-flow-node').count(), 2)
  await flowTab.click()
  assert.equal(await flow.getByRole('button', { name: '作業: 安全を再確認', exact: true }).count(), 1)
  await stepsTab.click()
  assert.equal(await steps.getByLabel('手順名', { exact: true }).inputValue(), '製品番号を照合')
  assert.equal(await page.locator('.form-panel').getByLabel('作業名', { exact: true }).inputValue(), '基本情報の変更を保持')

  await steps.getByText('登録済みの全体動画', { exact: true }).click()
  const video = steps.locator('.video-frame video')
  await video.evaluate(async element => {
    if (!element.readyState) await new Promise(resolve => element.addEventListener('loadedmetadata', resolve, { once: true }))
    element.currentTime = 4
    await element.play()
  })
  await page.waitForFunction(() => document.querySelector('#authoring-steps-panel .video-frame video').currentTime > 4.1)
  await flowTab.click()
  assert.ok(await video.evaluate(element => element.paused))
  const pausedTime = await video.evaluate(element => element.currentTime)
  await stepsTab.click()
  assert.ok(Math.abs(await video.evaluate(element => element.currentTime) - pausedTime) < .1)

  await steps.getByRole('button', { name: 'フローへ追加', exact: true }).click()
  assert.equal(await flowTab.getAttribute('aria-selected'), 'true')
  assert.equal(await flow.getByRole('button', { name: '作業: 製品番号を照合', exact: true }).count(), 1)
  assert.equal(await flow.locator('.decision-flow-node').count(), 3)
  await stepsTab.click()
  await steps.getByRole('button', { name: 'フローを更新', exact: true }).click()
  assert.equal(await flow.locator('.decision-flow-node').count(), 3)
  await page.getByRole('button', { name: '手順書を保存', exact: true }).click()
  await page.waitForFunction(() => window.testSaves.length === 1)
  const saved = await page.evaluate(() => window.testSaves[0])
  assert.equal(saved.title, '基本情報の変更を保持')
  assert.equal(saved.steps[0].title, '製品番号を照合')
  assert.equal(saved.decisionNodes[0].title, '安全を再確認')
  assert.equal(saved.decisionNodes[0].nextNodeId, 'b')
  assert.equal(saved.decisionNodes[2].sourceStepId, 1)

  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const [tab, active, inactive, name] of [[flowTab, flow, steps, 'flow'], [stepsTab, steps, flow, 'steps']]) {
      await tab.click()
      assert.ok(await active.isVisible())
      assert.equal(await inactive.isVisible(), false)
      const panelId = await active.getAttribute('id')
      const expectedTab = await tab.getAttribute('id')
      assert.equal(await tab.getAttribute('aria-controls'), panelId)
      assert.equal(await active.getAttribute('aria-labelledby'), expectedTab)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page overflow ${width} ${name}`)
      assert.ok(await tab.evaluate(element => element.scrollWidth <= element.clientWidth + 1), `tab overflow ${width}`)
      await page.getByRole('tablist', { name: '作成セクション' }).evaluate(el => el.scrollIntoView({ block: 'start' }))
      await page.screenshot({ path: `${out}/${name}-${width}.png` })
      if (name === 'steps') {
        const card = steps.locator('.step-card').first()
        await card.scrollIntoViewIfNeeded()
        const box = await card.boundingBox()
        for (const input of await card.locator('input, textarea, button').all()) {
          const bounds = await input.boundingBox()
          if (bounds) assert.ok(bounds.x >= box.x - 1 && bounds.x + bounds.width <= box.x + box.width + 1, `field overflow ${width}`)
        }
        await card.screenshot({ path: `${out}/step-fields-${width}.png` })
      }
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await stepsTab.focus()
  await page.keyboard.press('ArrowLeft')
  assert.equal(await flowTab.getAttribute('aria-selected'), 'true')
  assert.ok(await flowTab.evaluate(el => document.activeElement === el))
  await page.keyboard.press('End')
  assert.equal(await stepsTab.getAttribute('aria-selected'), 'true')
  await page.keyboard.press('Home')
  assert.equal(await flowTab.getAttribute('aria-selected'), 'true')
  assert.equal(await page.evaluate(() => window.testSaves.length), 1)
  // Existing chapter-only manuals open directly in their relevant section.
  await page.locator('.manual-list').getByRole('button', { name: '編集', exact: true }).nth(1).click()
  assert.equal(await stepsTab.getAttribute('aria-selected'), 'true')
  assert.equal(await steps.getByLabel('手順名', { exact: true }).inputValue(), '部品を確認')
  assert.deepEqual(errors, [])
  console.log('PASS sections: independent panels, input retention, hidden-flow shortcut protection, media pause/position, linking/updating, shared save, keyboard tabs, desktop/tablet/mobile; no production writes.')
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` })
  console.error(errors)
  throw error
} finally { await browser.close() }
