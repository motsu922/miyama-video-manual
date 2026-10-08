import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { getJapaneseOriginal, joinViewerText } from '../src/viewerBilingual.ts'
import { splitDecisionFlowEdgeLabel } from '../src/decisionFlowLabels.ts'

assert.equal(getJapaneseOriginal('Thai', '日本語'), '日本語')
assert.equal(getJapaneseOriginal('日本語', ' 日本語 '), '')
assert.equal(getJapaneseOriginal(undefined, '日本語'), '')
assert.equal(joinViewerText('Thai', '日本語'), 'Thai\n日本語')
assert.deepEqual(splitDecisionFlowEdgeLabel('Translated\n日本語'), ['Translated', '日本語'])
assert.deepEqual(splitDecisionFlowEdgeLabel('Translated\n日本語', 1, 3), ['2. Translated', '日本語'])
const manual = {
  id: 'bilingual-test', title: '設備の点検手順書', workName: '始業前点検', productName: '検査部品', controlNo: 'TEST',
  department: '製造課', owner: 'テスト', status: 'published', version: '1', duration: '00:30', updatedAt: '2026-10-09',
  videoUrl: '', thumbnail: '', tags: ['点検'], reviewers: [], checks: [],
  steps: [{ id: 1, time: '00:00', title: '外観を確認', detail: '部品の表面を確認します。' }, { id: 2, time: '00:10', title: '未翻訳の手順', detail: '元の説明' }],
  decisionStartNodeId: 'question', decisionNodes: [
    { id: 'question', type: 'question', title: '異常はありますか', detail: '表面の傷を確認してください。', branches: [{ id: 'yes', label: '傷がある', nextNodeId: 'action' }, { id: 'no', label: '傷はない', nextNodeId: 'end' }] },
    { id: 'action', type: 'action', title: '担当者に連絡', detail: '上長に報告してください。', nextNodeId: 'end' },
    { id: 'end', type: 'end', title: '点検終了', detail: '点検完了です。' },
  ], translations: {},
}
for (const [language, title, question, answer] of [
  ['th', 'คู่มือการตรวจสอบอุปกรณ์', 'มีความผิดปกติหรือไม่', 'มีรอยขีดข่วน'],
  ['pt', 'Manual de inspecao dos equipamentos', 'Existe alguma anomalia?', 'Ha riscos'],
]) manual.translations[language] = {
  language, title, department: 'Department', tags: ['Inspection'], translatedAt: '2026-10-09',
  steps: [{ id: 1, title: 'Inspect the surface', detail: 'Check the surface of the part.' }],
  decisionNodes: [
    { id: 'question', title: question, detail: 'Check for scratches.', branches: [{ id: 'yes', label: answer }, { id: 'no', label: 'No scratches' }] },
    { id: 'action', title: 'Contact supervisor', detail: 'Report to the supervisor.', branches: [] },
  ],
}
const chapterManual = { ...manual, id: 'chapters-test', decisionNodes: [], decisionStartNodeId: undefined }
const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
const page = await browser.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
await page.route('**/src/manualRepository.ts', route => route.fulfill({ contentType: 'text/javascript', body: `
  export const subscribeManuals = cb => { cb(${JSON.stringify([manual, chapterManual])}); return () => {}; };
  export const subscribeFlashTestResults = (id, cb) => { cb([]); return () => {}; };
  export const ensureSignedIn = async () => {};
  export const saveManual = async () => { throw Error('Writes prohibited during viewer test'); };
  export const uploadManualImage = saveManual, uploadInspectionImage = saveManual, uploadManualVideo = saveManual;
  export const deleteManual = saveManual, recordManualView = saveManual, recordFlashTestResult = saveManual;
` }))
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5176/'
await fs.mkdir('node_modules/.tmp/viewer-bilingual', { recursive: true })
try {
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 1024 ? 768 : 900 })
    await page.goto(`${base}?manual=bilingual-test&view=decision`)
    await page.locator('#decision-current-title').waitFor()
    assert.equal(await page.locator('.viewer-japanese').count(), 0)
    for (const language of ['th', 'pt']) {
      await page.getByLabel('表示言語', { exact: true }).selectOption(language)
      assert.equal(await page.locator('#decision-current-title .viewer-japanese').innerText(), '異常はありますか')
      assert.equal(await page.locator('.decision-runner-instruction .viewer-japanese').innerText(), '表面の傷を確認してください。')
      const answer = page.locator('.decision-answer').first()
      assert.equal(await answer.locator('.viewer-japanese').innerText(), '傷がある')
      assert.ok(await answer.locator('.viewer-japanese').evaluate(el => parseFloat(getComputedStyle(el).fontSize) < parseFloat(getComputedStyle(el.parentElement).fontSize)))
      await page.getByRole('button', { name: 'フローを表示', exact: true }).click()
      assert.ok(await page.locator('.viewer-japanese-svg').count() >= 4)
      await page.screenshot({ path: `node_modules/.tmp/viewer-bilingual/flow-${width}-${language}.png` })
      await page.getByRole('button', { name: 'フローを閉じる', exact: true }).click()
      await answer.click()
      assert.equal(await page.locator('#decision-current-title .viewer-japanese').innerText(), '担当者に連絡')
      await page.screenshot({ path: `node_modules/.tmp/viewer-bilingual/runner-${width}-${language}.png` })
      await page.evaluate(() => window.scrollTo(0, 400))
      assert.ok(await page.locator('.viewer-language-header').evaluate(el => el.getBoundingClientRect().top >= -1))
      await page.getByRole('button', { name: '最初に戻る', exact: true }).click()
    }
    await page.getByLabel('表示言語', { exact: true }).selectOption('ja')
    assert.equal(await page.locator('.viewer-japanese').count(), 0)
    await page.goto(`${base}?manual=chapters-test`)
    await page.getByLabel('表示言語', { exact: true }).selectOption('pt')
    assert.equal(await page.locator('.viewer-steps:visible .viewer-japanese').count(), 2)
    assert.ok(await page.locator('.viewer-steps:visible').innerText().then(text => text.includes('未翻訳の手順')))
    await page.screenshot({ path: `node_modules/.tmp/viewer-bilingual/chapters-${width}.png` })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    console.log(`PASS ${width}px: translated title, instructions, branches, flowchart, chapters, Japanese fallback; no writes`)
  }
  assert.deepEqual(errors, [])
} finally { await browser.close() }

