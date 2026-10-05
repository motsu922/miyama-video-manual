import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import ExcelJS from 'exceljs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5176/'
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
// Never use the live Firebase project for import tests.
await page.route('**/src/manualRepository.ts', (route) => route.fulfill({ contentType: 'text/javascript', body: `
  window.importTest = { uploads: [], saved: [], failUpload: false, failSave: false };
  export const subscribeManuals = (callback) => { callback([]); return () => {}; };
  export const subscribeFlashTestResults = (id, callback) => { callback([]); return () => {}; };
  export const ensureSignedIn = async () => {};
  export const saveManual = async (manual) => { if(window.importTest.failSave) throw Error('test save failure'); window.importTest.saved.push(manual); };
  export const uploadManualImage = async (id, file) => { if(window.importTest.failUpload) throw Error('test upload failure'); window.importTest.uploads.push({id, name:file.name}); return 'https://example.invalid/' + id + '/' + encodeURIComponent(file.name); };
  export const uploadInspectionImage = async () => '';
  export const uploadManualVideo = async () => '';
  export const deleteManual = async () => {};
  export const recordManualView = async () => {};
  export const recordFlashTestResult = async () => {};
` }))
await page.route('https://example.invalid/**', (route) => route.fulfill({ status: 404, body: '' }))
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Excelから取り込む' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('工程1')
  sheet.mergeCells('A1:B2'); sheet.getCell('A1').value = '作業名'
  sheet.mergeCells('C1:F2'); sheet.getCell('C1').value = 'テスト作業'
  sheet.getCell('A4').value = '作業内容'; sheet.getCell('D4').value = '確認ポイント'
  sheet.mergeCells('A5:C7'); sheet.getCell('A5').value = '確認する'
  sheet.getCell('D5').value = '傷がないこと'
  sheet.getCell('A8').value = '記録する'; sheet.getCell('D8').value = '確認者へ報告'
  const image = workbook.addImage({ base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZyEAAAAASUVORK5CYII=', extension: 'png' })
  sheet.addImage(image, { tl: { col: 2, row: 4 }, ext: { width: 60, height: 60 } })
  workbook.addWorksheet('説明').getCell('A1').value = '対象外の説明シート'
  const payload = { name: 'test.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) }
  await dialog.locator('input[type=file]').setInputFiles(payload)
  await dialog.getByRole('heading', { name: '手順の確認（2件）' }).waitFor()
  assert.equal(await dialog.getByLabel('手順書名', { exact: true }).inputValue(), 'テスト作業')
  assert.equal(await dialog.locator('figure').count(), 1)
  assert.equal(await dialog.getByRole('button', { name: '下書きとして登録' }).isDisabled(), true)
  assert.equal(await page.evaluate(() => window.importTest.uploads.length), 0)
  await dialog.getByRole('checkbox', { name: /文章・写真/ }).check()
  await page.evaluate(() => { window.importTest.failUpload = true })
  await dialog.getByRole('button', { name: '下書きとして登録' }).click()
  await dialog.getByRole('alert').waitFor()
  assert.equal(await page.evaluate(() => window.importTest.saved.length), 0)
  await page.evaluate(() => { window.importTest.failUpload = false; window.importTest.failSave = true })
  await dialog.getByRole('button', { name: '下書きとして登録' }).click()
  await dialog.getByText(/test save failure/).waitFor()
  const uploads = await page.evaluate(() => window.importTest.uploads)
  assert.equal(uploads.length, 2)
  await page.evaluate(() => { window.importTest.failSave = false })
  await dialog.getByRole('button', { name: '下書きとして登録' }).click()
  await dialog.waitFor({ state: 'detached' })
  const state = await page.evaluate(() => window.importTest)
  assert.equal(state.saved.length, 1)
  assert.equal(state.uploads.length, 2, 'retry reuses assets')
  const manual = state.saved[0]
  assert.equal(manual.status, 'draft')
  assert.equal(manual.steps.length, 2)
  assert.equal(manual.decisionNodes.length, 3)
  assert.equal(manual.decisionNodes[0].nextNodeId, manual.decisionNodes[1].id)
  assert.equal(manual.decisionNodes[1].nextNodeId, 'import-end')
  assert.equal(manual.steps[0].inspectionImages[0].url, manual.decisionNodes[0].media[0].url)
  assert.ok(manual.sourceDocument.url.startsWith('https:'))
  assert.equal(manual.id, uploads[0].id)
  console.log('PASS: merged cells, metadata, photos, ordered flow, draft save, failure/retry without duplicate uploads')

  await page.getByRole('button', { name: 'Excelから取り込む' }).first().click()
  await dialog.locator('input[type=file]').setInputFiles({ name: 'broken.xlsx', mimeType: payload.mimeType, buffer: Buffer.from('invalid') })
  await dialog.getByRole('alert').waitFor()
  assert.match(await dialog.getByRole('alert').innerText(), /読み込めませんでした/)
  console.log('PASS: invalid Excel rejected')
  if (process.argv[2]) {
    await dialog.locator('input[type=file]').setInputFiles(process.argv[2])
    await dialog.getByRole('heading', { name: '手順の確認（15件）' }).waitFor({ timeout: 60000 })
    const sourceWorkbook = new ExcelJS.Workbook()
    await sourceWorkbook.xlsx.readFile(process.argv[2])
    assert.equal(await dialog.getByLabel('手順書名', { exact: true }).inputValue(), sourceWorkbook.worksheets[0].getCell('D3').text.trim())
    assert.equal(await dialog.getByLabel('部署', { exact: true }).inputValue(), sourceWorkbook.worksheets[0].getCell('J2').text.trim())
    assert.equal(await dialog.getByLabel('作成者', { exact: true }).inputValue(), sourceWorkbook.worksheets[0].getCell('AN2').text.trim())
    assert.equal(await dialog.locator('.excel-import-sheets input').count(), 5)
    const figures = await dialog.locator('figure').count()
    assert.ok(figures >= 20)
    const outputs = path.resolve('node_modules/.tmp/excel-import')
    await fs.mkdir(outputs, { recursive: true })
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      const geometry = await dialog.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth, rect: element.getBoundingClientRect().toJSON() }))
      assert.ok(geometry.scroll <= geometry.width + 1, `dialog horizontal overflow at ${viewport.width}`)
      assert.ok(geometry.rect.right <= viewport.width)
      await page.screenshot({ path: path.join(outputs, `preview-${viewport.width}.png`) })
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await dialog.getByRole('heading', { name: /写真の割り当て/ }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(outputs, 'photos.png') })
    const firstPhoto = dialog.locator('figure select').first()
    await firstPhoto.selectOption('')
    assert.equal(await firstPhoto.inputValue(), '')
    const sheet1 = dialog.locator('.excel-import-sheets input').first()
    await sheet1.uncheck()
    await dialog.getByRole('heading', { name: '手順の確認（12件）' }).waitFor()
    await dialog.getByRole('button', { name: 'キャンセル' }).click()
    assert.equal(await page.evaluate(() => window.importTest.saved.length), 1, 'preview/cancel never saves the user workbook')
    console.log(`PASS: actual workbook 5 sheets / 15 steps / ${figures} photos; sheet exclusion, photo reassignment, responsive preview, cancellation`)
    console.log('Screenshots:', outputs)
  }
  assert.deepEqual(errors, [])
} finally { await browser.close() }

