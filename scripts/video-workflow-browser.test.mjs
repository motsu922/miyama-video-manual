import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { unlockViewer } from './viewer-login.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5176/'
const out = 'node_modules/.tmp/video-workflow'
await fs.mkdir(out, { recursive: true })
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('dialog', dialog => dialog.accept())
try {
  // Encode synthetic JPEG frames; no real manuals or footage are used or uploaded.
  await page.setContent('<body style="margin:0;background:#eff5f6;font:48px Arial"><div style="padding:50px;background:#0d807e;color:white">TEST VIDEO</div><div style="margin:50px;width:200px;height:200px;background:#ffb647"></div></body>')
  const jpeg = await page.screenshot({ type: 'jpeg' })
  const ffmpeg = process.env.FFMPEG_PATH
  assert.ok(ffmpeg, 'Set FFMPEG_PATH to the Playwright ffmpeg executable')
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ['-f', 'image2pipe', '-c:v', 'mjpeg', '-r', '10', '-i', 'pipe:0', '-c:v', 'libvpx', '-y', `${out}/fixture.webm`], { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', data => stderr += data)
    child.stdin.on('error', () => {})
    child.on('error', reject)
    child.on('close', code => code ? reject(Error(stderr)) : resolve())
    child.stdin.end(Buffer.concat(Array(50).fill(jpeg)))
  })
  const bytes = await fs.readFile(`${out}/fixture.webm`)
  const url = `data:video/webm;base64,${bytes.toString('base64')}`
  const manual = { id: 'video-workflow-test', title: '動画操作テスト', workName: '', controlNo: '', productName: '', department: 'テスト', owner: '', status: 'draft', version: 'v1.0', duration: '00:00', updatedAt: '2026-10-28', videoUrl: '', thumbnail: '', tags: [], reviewers: [], checks: [], approvalHistory: [], steps: [{ id: 1, time: '00:00', title: '既存作業', detail: '既存の説明' }], decisionNodes: [{ id: 'a', type: 'action', title: '既存作業', detail: '既存の説明', sourceStepId: 1 }] }
  let fixtureManual = manual
  await page.route('**/src/manualRepository.ts*', route => route.fulfill({ contentType: 'text/javascript', body: `
window.testManuals = ${JSON.stringify([fixtureManual])}; window.testSaves=[];window.testUploads=0;window.failNextSave=false;
export const subscribeManuals = cb => { cb(window.testManuals); return () => {}; };
export const subscribeFlashTestResults = (id, cb) => { cb([]); return () => {}; };
export const ensureSignedIn = async () => {};
export const saveManual = async manual => { if(window.failNextSave){window.failNextSave=false;throw Error('Test offline');} window.testSaves.push(manual);window.testManuals=[manual]; };
export const uploadManualVideo = async (id, file, progress) => {window.testUploads++; progress?.(100); return ${JSON.stringify(url)};};
const prohibited = async () => { throw Error('Unexpected write'); };
export const uploadManualImage=prohibited,uploadInspectionImage=prohibited,deleteManual=prohibited,recordManualView=prohibited,recordFlashTestResult=prohibited;
` }))
  // Block actual Firebase traffic even if a mock is missed.
  await page.route(/https:\/\/.*(googleapis|firebasestorage)\.com\/.*/, route => route.abort())
  await page.goto(base)
  await unlockViewer(page)
  await page.locator('.manual-list').getByRole('button', { name: '編集', exact: true }).click()
  const open = () => page.getByRole('button', { name: '動画を編集して手順に追加', exact: true }).click()
  const dialog = page.locator('dialog.video-workflow')
  await open()
  await dialog.getByLabel('動画ファイル', { exact: true }).setInputFiles({ name: 'fixture.webm', mimeType: 'video/webm', buffer: bytes })
  await dialog.getByRole('button', { name: '切り取る', exact: true }).click()
  await dialog.getByLabel('開始秒', { exact: true }).fill('4')
  await dialog.getByLabel('終了秒', { exact: true }).fill('2')
  assert.equal(await dialog.getByRole('button', { name: '編集する', exact: true }).isEnabled(), false)
  assert.equal(await page.evaluate(() => window.testUploads), 0)
  await dialog.getByLabel('開始秒', { exact: true }).fill('1')
  await dialog.getByLabel('終了秒', { exact: true }).fill('3')
  await dialog.screenshot({ path: `${out}/trim-desktop.png` })
  await dialog.getByRole('button', { name: '編集する', exact: true }).click()
  await dialog.getByLabel('再生速度', { exact: true }).selectOption('0.5')
  await dialog.getByLabel('拡大率', { exact: true }).fill('1.5')
  await dialog.getByLabel('スポットを当てる', { exact: true }).check()
  await dialog.getByLabel('挿入する文字', { exact: true }).fill('奥まで差し込む')
  await dialog.locator('video').evaluate(video => video.readyState >= 2 ? null : new Promise(resolve => video.addEventListener('loadeddata', resolve, { once:true })))
  await dialog.getByRole('button', { name: '動画を再生', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('dialog .step-video-player video').currentTime >= 1.25)
  assert.equal(await dialog.locator('video').evaluate(video => video.playbackRate), .5)
  await dialog.screenshot({ path: `${out}/edit-desktop.png` })
  await page.waitForFunction(() => { const v=document.querySelector('dialog .step-video-player video');return v.paused&&v.currentTime>=3 }, { timeout: 10000 })
  assert.ok(await dialog.locator('video').evaluate(video => video.currentTime < 3.08))
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 })
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1))
    assert.ok(await dialog.locator('.vw-body').evaluate(el => el.scrollWidth <= el.clientWidth + 1))
    const footer = await dialog.locator('.vw-footer').boundingBox()
    assert.ok(footer.y + footer.height <= 844)
    await dialog.screenshot({ path: `${out}/edit-${width}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await dialog.getByRole('button', { name: '手順に挿入', exact: true }).click()
  await dialog.getByLabel('作業名', { exact: true }).fill('部品を取り付ける')
  await dialog.getByLabel('作業指示', { exact: true }).fill('奥まで差し込む')
  await page.evaluate(() => { window.failNextSave = true })
  await dialog.getByRole('button', { name: '手順に挿入して保存', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'Test offline' }).waitFor()
  assert.equal(await page.evaluate(() => window.testUploads), 1)
  assert.equal(await page.evaluate(() => window.testSaves.length), 0)
  await dialog.getByRole('button', { name: '手順に挿入して保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  let saved = await page.evaluate(() => window.testSaves.at(-1))
  assert.equal(await page.evaluate(() => window.testUploads), 1)
  assert.equal(saved.steps.length, 2)
  assert.equal(saved.decisionNodes.length, 2)
  assert.equal(saved.steps[1].videos[0].videoEdit.trimStart, 1)
  assert.equal(saved.steps[1].videos[0].videoEdit.playbackRate, .5)
  assert.equal(saved.steps[0].detail, '既存の説明')
  // Editing upserts and uses the original URL without uploading again.
  await page.locator('.step-video-attachments').getByRole('button', { name: 'fixture.webmを編集', exact: true }).click()
  await dialog.getByLabel('終了秒', { exact: true }).fill('4')
  await dialog.getByRole('button', { name: '編集する', exact: true }).click()
  await dialog.getByRole('button', { name: '手順に挿入', exact: true }).click()
  await dialog.getByRole('button', { name: '編集を保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  saved = await page.evaluate(() => window.testSaves.at(-1))
  assert.equal(saved.steps[1].videos.length, 1)
  assert.equal(saved.decisionNodes[1].media.length, 1)
  assert.equal(saved.decisionNodes[1].media[0].videoEdit.trimEnd, 4)
  // Cancel before committing does not mutate or upload.
  await open()
  await dialog.getByLabel('動画ファイル', { exact: true }).setInputFiles({ name: 'cancel.webm', mimeType: 'video/webm', buffer: bytes })
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => window.testUploads), 1)
  assert.equal(await page.evaluate(() => window.testSaves.length), 2)
  // Help is accessible through the app and contains the exact operational sequence.
  await page.getByRole('button', { name: '運用マニュアル', exact: true }).first().click()
  await page.getByRole('link', { name: '動画の編集・手順への挿入', exact: true }).click()
  await page.locator('#guide-video-howto').waitFor()
  assert.ok((await page.locator('#guide-video-howto').innerText()).includes('10〜18秒'))
  await page.screenshot({ path: `${out}/guide.png` })
  fixtureManual = { ...saved, status: 'published', decisionStartNodeId: saved.decisionNodes[1].id }
  await page.goto(`${base}?manual=${manual.id}`)
  await page.locator('.manual-document-table .step-video-player').waitFor()
  await page.waitForFunction(() => document.querySelector('.manual-document-table video')?.readyState >= 2)
  assert.equal(await page.locator('.manual-document-table video').evaluate(video => video.currentTime), 1)
  assert.equal(await page.locator('.manual-document-table video').evaluate(video => video.playbackRate), .5)
  await page.locator('.manual-document-table .step-video-player').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${out}/viewer-desktop.png` })
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const player = page.locator('.decision-runner .step-video-player')
    await player.waitFor()
    await player.scrollIntoViewIfNeeded()
    await page.waitForFunction(() => document.querySelector('.decision-runner video')?.readyState >= 2)
    const dimensions = await player.locator('video').evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }))
    assert.ok(dimensions.width > 100 && dimensions.height > 80)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: `${out}/viewer-${width}.png` })
    await player.getByRole('button', { name: '動画を再生', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.decision-runner video').currentTime > 1.1)
    await player.getByRole('button', { name: '動画を一時停止', exact: true }).click()
  }
  assert.deepEqual(errors, [])
  console.log('Video workflow passed: real WebM preview, trim bounds, effects, responsive layout, retry, reedit, cancellation, guide. No production writes.')
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` })
  console.error(errors, await page.locator('dialog').innerText().catch(() => 'No dialog'))
  throw error
} finally { await browser.close() }
