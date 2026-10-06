import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import ExcelJS from 'exceljs'

// Arguments: inspection workbook, abnormal-stop workbook, die-change workbook.
// Original workbooks stay outside the repository and are never registered during this test.
const inputs = process.argv.slice(2)
assert.equal(inputs.length, 3)
const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/src/manualRepository.ts', (route) => route.fulfill({ contentType: 'text/javascript', body: `
  export const subscribeManuals = (callback) => { callback([]); return () => {}; };
  export const subscribeFlashTestResults = (id, callback) => { callback([]); return () => {}; };
  export const ensureSignedIn = async () => {};
  export const saveManual = async () => { throw Error('Real registration is prohibited in this test'); };
  export const uploadManualImage = saveManual;
  export const uploadInspectionImage = saveManual;
  export const uploadManualVideo = saveManual;
  export const deleteManual = saveManual;
  export const recordManualView = saveManual;
  export const recordFlashTestResult = saveManual;
` }))
const compact = (value) => value.replace(/\s/g, '')
try {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:5176/', { waitUntil: 'domcontentloaded' })
  for (const [index, input] of inputs.entries()) {
    const source = new ExcelJS.Workbook()
    const buffer = await fs.readFile(input)
    await source.xlsx.load(buffer)
    const result = await page.evaluate(async ({ data, name }) => {
      const { readExcelManual, buildImportedManual } = await import('/src/excelManualImport.ts')
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      const draft = await readExcelManual(new File([bytes], name))
      const urls = new Map(draft.photos.map((photo) => [photo.id, `https://example.invalid/${photo.id}`]))
      const manual = buildImportedManual(draft, 'test-only', urls, 'https://example.invalid/source', name)
      return { ...draft, photos: draft.photos.map(({ file, ...photo }) => ({ ...photo, size: file.size })), manual }
    }, { data: buffer.toString('base64'), name: path.basename(input) })
    assert.equal(result.steps.length, [12, 5, 16][index])
    assert.equal(result.photos.length, [15, 7, 25][index])
    assert.equal(result.photos.filter((photo) => !photo.stepId).length, 0)
    assert.equal(result.manual.decisionNodes.length, result.steps.length + 1)
    assert.equal(result.manual.status, 'draft')
    for (const sheet of source.worksheets) {
      const steps = result.steps.filter((step) => step.sheet === sheet.name)
      const fullText = compact(steps.map((step) => step.title + step.detail).join('\n'))
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber <= 7) return
        row.eachCell((cell, col) => {
          if (col < 3 || col >= 15 && col < 27 || cell.isMerged && cell.master.address !== cell.address) return
          if (cell.text.trim()) assert.ok(fullText.includes(compact(cell.text)), `Missing source cell: workbook ${index + 1}, sheet ${sheet.name}, ${cell.address}`)
        })
      })
      for (const photo of result.photos.filter((photo) => photo.sheet === sheet.name)) {
        assert.ok(steps.some((step) => step.id === photo.stepId))
        assert.ok(photo.size > 0)
      }
    }
    if (index === 0) {
      assert.ok(result.steps[5].title.startsWith('＜プレス＞'))
      assert.ok(result.steps[9].title.startsWith('＜ロボット＞'))
    }
    if (index === 2) assert.ok(compact(result.steps[4].detail).includes(compact(source.worksheets[0].getCell('AZ57').text)))
    await page.getByRole('button', { name: 'Excelから取り込む' }).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[type=file]').setInputFiles(input)
    await dialog.getByRole('heading', { name: `手順の確認（${result.steps.length}件）` }).waitFor({ timeout: 60000 })
    assert.equal(await dialog.getByLabel('手順書名', { exact: true }).inputValue(), source.worksheets[0].getCell('D3').text.trim())
    assert.equal(await dialog.locator('figure').count(), result.photos.length)
    assert.ok(await dialog.getByRole('button', { name: '下書きとして登録' }).isDisabled())
    const out = path.resolve('node_modules/.tmp/excel-import-forms')
    await fs.mkdir(out, { recursive: true })
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 900 })
      assert.ok(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
      await page.screenshot({ path: path.join(out, `form-${index + 1}-${width}.png`) })
    }
    await page.setViewportSize({ width: 1440, height: 1000 })
    await dialog.getByRole('heading', { name: /写真の割り当て/ }).scrollIntoViewIfNeeded()
    const images = dialog.locator('figure img')
    for (let n = 0; n < await images.count(); n++) {
      await images.nth(n).scrollIntoViewIfNeeded()
      await images.nth(n).evaluate((img) => img.decode())
    }
    await dialog.getByRole('heading', { name: /写真の割り当て/ }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(out, `form-${index + 1}-photos.png`) })
    await dialog.getByRole('button', { name: 'キャンセル' }).click()
    console.log(`PASS workbook ${index + 1}: ${result.steps.length} steps / ${result.photos.length} images, all work/checkpoint/risk text retained, responsive preview, no registration`)
  }
  assert.deepEqual(errors, [])
} finally { await browser.close() }

