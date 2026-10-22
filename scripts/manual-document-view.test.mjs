import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { unlockViewer } from './viewer-login.mjs'

const source = process.argv[2]
assert.ok(source, 'Pass the reference workbook path; it is never registered or uploaded')
const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5176/'
const out = 'node_modules/.tmp/manual-document-view'
await fs.mkdir(out, { recursive: true })
let manuals = []
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.route('**/src/manualRepository.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
export const subscribeManuals = cb => { cb(${JSON.stringify(manuals)}); return () => {}; };
export const subscribeFlashTestResults = (id, cb) => { cb([]); return () => {}; };
export const ensureSignedIn = async () => {};
export const saveManual = async () => { throw Error('Writes prohibited in document viewer test'); };
export const uploadManualImage = saveManual, uploadInspectionImage = saveManual, uploadManualVideo = saveManual;
export const deleteManual = saveManual, recordManualView = saveManual, recordFlashTestResult = saveManual;
` }))
try {
  await page.goto(base)
  await unlockViewer(page)
  const buffer = await fs.readFile(source)
  const result = await page.evaluate(async ({ data, name }) => {
    const { readExcelManual, buildImportedManual } = await import('/src/excelManualImport.ts')
    const draft = await readExcelManual(new File([Uint8Array.from(atob(data), c => c.charCodeAt(0))], name))
    const urls = new Map()
    for (const photo of draft.photos) urls.set(photo.id, await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(photo.file) }))
    return { count: draft.steps.length, photos: draft.photos.length, manual: buildImportedManual(draft, 'document-test', urls, 'https://example.invalid/source.xlsx', name) }
  }, { data: buffer.toString('base64'), name: path.basename(source) })
  const manual = { ...result.manual, status: 'published', translations: { pt: {
    language: 'pt', title: 'Manual de verificacao', department: 'Producao', tags: [], translatedAt: '2026-10-22', steps: [],
    decisionNodes: [{ id: 'import-step-1', title: 'Retire a peca da calha de saida.', detail: 'Confirme o numero da peca.', branches: [] }],
  } } }
  manuals = [manual]
  await page.goto(`${base}?manual=document-test`)
  const table = page.locator('.manual-document-table')
  await table.waitFor()
  assert.equal(await table.locator('tbody tr').count(), result.count + 1)
  assert.equal(await table.locator('tbody img').count(), result.photos)
  assert.ok(await table.innerText().then(text => text.includes('16個目') && text.includes('【品質ポイント】')))
  for (const width of [1440, 1280, 1100]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.ok(await table.isVisible())
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: `${out}/document-${width}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  for (const img of await table.locator('img').all()) {
    await img.scrollIntoViewIfNeeded()
    await img.evaluate(img => img.decode())
    assert.equal(await img.evaluate(img => getComputedStyle(img).objectFit), 'contain')
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await table.locator('tbody button').first().click()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByLabel('表示言語', { exact: true }).selectOption('pt')
  assert.ok(await table.locator('.viewer-japanese').count() >= 2)
  await page.screenshot({ path: `${out}/document-bilingual.png` })
  await page.getByRole('button', { name: '手順確認', exact: true }).click()
  await page.locator('.decision-runner').waitFor()
  await page.getByRole('button', { name: '手順書', exact: true }).click()
  await table.waitFor()
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await table.count(), 0)
    await page.locator('.decision-runner').waitFor()
    await page.screenshot({ path: `${out}/interactive-${width}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await table.waitFor()
  const photo = manual.decisionNodes[0].media[0]
  const branchManual = { ...manual, id: 'branch-test', steps: [], translations: {}, decisionStartNodeId: 'q', decisionNodes: [
    { id: 'q', type: 'question', title: '異常はありますか', detail: '現品を確認', branches: [{ id: 'yes', label: '異常あり', nextNodeId: 'a' }, { id: 'no', label: '異常なし', nextNodeId: 'end' }] },
    { id: 'a', type: 'action', title: '上長へ報告', detail: '停止状態を維持', media: [photo], nextNodeId: 'end' },
    { id: 'end', type: 'end', title: '完了', detail: '' },
  ] }
  manuals = [branchManual]
  await page.goto(`${base}?manual=branch-test`)
  await page.locator('#document-node-q a').first().click()
  assert.ok(page.url().endsWith('#document-node-a'))
  assert.ok(await page.locator('#document-node-a').evaluate(el => el.getBoundingClientRect().top > document.querySelector('.viewer-language-header').getBoundingClientRect().bottom))
  // A local silent PCM fixture tests the HTML media seek path without external footage or recording support.
  const wave = Buffer.alloc(44 + 8000 * 3 * 2)
  wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8)
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22)
  wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34)
  wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40)
  const videoUrl = `data:audio/wav;base64,${wave.toString('base64')}`
  manuals = [{ ...manual, id: 'video-test', decisionNodes: [], videoUrl, videoClips: [{ id: 'clip', name: 'Test clip', url: videoUrl, duration: 2.4, trimStart: 0, trimEnd: 2.4 }], steps: [{ id: 1, time: '00:01', title: '動画手順', detail: '動画を確認' }] }]
  await page.goto(`${base}?manual=video-test`)
  await page.getByRole('button', { name: '00:01から動画を見る' }).click()
  await page.locator('.viewer-video-stage video').waitFor()
  try {
    await page.waitForFunction(() => document.querySelector('.viewer-video-stage video')?.currentTime >= 0.95, undefined, { timeout: 10000 })
  } catch (error) {
    console.log(await page.locator('.viewer-video-stage video').evaluate(video => ({ time: video.currentTime, duration: video.duration, state: video.readyState, error: video.error?.message, paused: video.paused })))
    throw error
  }
  assert.deepEqual(errors, [])
  console.log(`PASS reference: ${result.count} procedures / ${result.photos} photos, full text, metadata, original images, fullscreen, bilingual text, desktop/tablet/mobile, mode switch, branch links, video seek; no Firebase writes`)
} finally { await browser.close() }

