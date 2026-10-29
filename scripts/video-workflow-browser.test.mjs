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
let acceptConfirmation = true
page.on('dialog', dialog => acceptConfirmation ? dialog.accept() : dialog.dismiss())
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
  const manual = { id: 'video-workflow-test', title: '動画操作テスト', workName: '', controlNo: '', productName: '', department: 'テスト', owner: '', status: 'draft', version: 'v1.0', duration: '00:05', updatedAt: '2026-10-29', videoUrl: url, videoClips: [{ id: 'legacy', name: '従来の動画', url, duration: 5, trimStart: 1, trimEnd: 4, zoom: 1.2 }], thumbnail: '', tags: [], reviewers: [], checks: [], approvalHistory: [], steps: [{ id: 1, time: '00:00', title: '既存作業', detail: '既存の説明' }], decisionNodes: [{ id: 'a', type: 'action', title: '既存作業', detail: '既存の説明', sourceStepId: 1 }] }
  let fixtureManual = manual
  await page.route('https://video.test/**', route => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '')
    const start = range ? Number(range[1]) : 0
    const end = range?.[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1
    return route.fulfill({ status: range ? 206 : 200, contentType: 'video/webm', headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': 'bytes ' + start + '-' + end + '/' + bytes.length } : {}) }, body: bytes.subarray(start, end + 1) })
  })
  await page.route('https://thumbnail.test/**', route => route.fulfill({ contentType: 'image/jpeg', body: jpeg }))
  await page.route('**/src/manualRepository.ts*', route => route.fulfill({ contentType: 'text/javascript', body: [
    'window.testManuals=' + JSON.stringify([fixtureManual]) + ';window.testSaves=[];window.uploadNames=[];window.failNextSave=false;',
    'export const subscribeManuals=cb=>{cb(window.testManuals);return()=>{}};',
    'export const subscribeFlashTestResults=(id,cb)=>{cb([]);return()=>{}};',
    'export const ensureSignedIn=async()=>{};',
    'export const saveManual=async manual=>{if(window.failNextSave){window.failNextSave=false;throw Error("Test save offline");}window.testSaves.push(manual);window.testManuals=[manual];};',
    'export const uploadManualVideo=async(id,file,progress)=>{window.uploadNames.push(file.name);if(window.failNextUpload){window.failNextUpload=false;throw Error("Test upload offline");}progress?.(100);return "https://video.test/"+file.name;};',
    'export const uploadManualImage=async(id,file)=>"https://thumbnail.test/"+file.name;',
    'const prohibited=async()=>{throw Error("Unexpected write")};export const uploadInspectionImage=prohibited,deleteManual=prohibited,recordManualView=prohibited,recordFlashTestResult=prohibited;',
  ].join('\n') }))
  await page.route(/https:\/\/.*(googleapis|firebasestorage)\.com\/.*/, route => route.abort())
  await page.goto(base)
  await unlockViewer(page)
  const enterSteps = async () => {
    await page.locator('.manual-list').getByRole('button', { name: '編集', exact: true }).click()
    await page.getByRole('tab', { name: '手順作成', exact: true }).click()
  }
  await enterSteps()
  const library = page.locator('.video-source-library')
  const input = page.getByLabel('動画素材ファイル', { exact: true })
  const upload = library.getByRole('button', { name: '動画をアップロード', exact: true })
  const editButton = library.getByRole('button', { name: '選択した素材を編集', exact: true })
  const selectSource = name => library.getByRole('button', { name: '素材を選択: ' + name, exact: true }).click()
  const file = name => ({ name, mimeType: 'video/webm', buffer: bytes })
  assert.ok(await input.getAttribute('multiple') !== null)
  assert.equal(await editButton.count(), 0)
  assert.equal(await library.getByRole('button', { name: '素材を選択: 従来の動画', exact: true }).count(), 1)
  assert.equal(await page.locator('.clip-editor').count(), 0)
  assert.equal(await page.getByRole('button', { name: /動画を編集して|動画を追加/ }).count(), 0)

  // Partial batch success and a save retry must preserve all uploaded files without reuploading.
  await page.evaluate(() => { window.failNextSave = true })
  const chooser = page.waitForEvent('filechooser')
  await upload.focus(); await upload.press('Enter')
  await (await chooser).setFiles([file('first.webm'), file('second.webm'), { name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') }])
  await library.getByRole('button', { name: 'invalid.txtを再試行', exact: true }).waitFor()
  await page.waitForFunction(() => window.testSaves.length === 1)
  await library.getByRole('button', { name: 'first.webmを再試行', exact: true }).click()
  await page.waitForFunction(() => window.testSaves.length === 2)
  assert.deepEqual(await page.evaluate(() => window.uploadNames), ['first.webm', 'second.webm'])
  let saved = await page.evaluate(() => window.testSaves.at(-1))
  assert.equal(saved.videoSources.length, 2)
  assert.ok(saved.videoSources.every(source => source.thumbnail.startsWith('https://thumbnail.test/')))
  assert.equal(saved.videoUrl, url)
  assert.deepEqual(saved.videoClips, manual.videoClips)
  assert.deepEqual(saved.steps, manual.steps)
  await page.evaluate(() => { window.failNextUpload = true })
  await input.setInputFiles(file('third.webm'))
  await library.getByRole('button', { name: 'third.webmを再試行', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.testSaves.length), 2)
  await library.getByRole('button', { name: 'third.webmを再試行', exact: true }).click()
  await page.waitForFunction(() => window.testSaves.length === 3)
  saved = await page.evaluate(() => window.testSaves.at(-1))
  assert.equal(saved.videoSources.length, 3)
  assert.deepEqual(await page.evaluate(() => window.uploadNames), ['first.webm', 'second.webm', 'third.webm', 'third.webm'])
  assert.equal(await input.inputValue(), '')

  // A new session loads the same library and legacy media independently of the playlist.
  fixtureManual = saved
  await page.reload()
  await enterSteps()
  assert.equal(await library.locator('.video-source-item').count(), 4)
  await selectSource('first.webm')
  await page.waitForFunction(() => document.querySelector('.video-source-selection video')?.readyState >= 2)
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await library.scrollIntoViewIfNeeded()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    assert.ok(await library.evaluate(el => el.scrollWidth <= el.clientWidth + 1))
    await library.screenshot({ path: out + '/library-' + width + '.png' })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await editButton.click()
  const dialog = page.locator('dialog.video-workflow')
  assert.equal(await dialog.locator('input[type=file]').count(), 0)
  await dialog.getByLabel('開始秒', { exact: true }).fill('4')
  await dialog.getByLabel('終了秒', { exact: true }).fill('2')
  assert.equal(await dialog.getByRole('button', { name: '編集する', exact: true }).isEnabled(), false)
  await dialog.getByLabel('開始秒', { exact: true }).fill('1')
  await dialog.getByLabel('終了秒', { exact: true }).fill('3')
  await dialog.screenshot({ path: out + '/trim-desktop.png' })
  await dialog.getByRole('button', { name: '編集する', exact: true }).click()
  await dialog.getByLabel('再生速度', { exact: true }).selectOption('0.5')
  await dialog.getByLabel('拡大率', { exact: true }).fill('1.5')
  await dialog.getByLabel('スポットを当てる', { exact: true }).check()
  await dialog.getByLabel('挿入する文字', { exact: true }).fill('奥まで差し込む')
  await page.waitForFunction(() => document.querySelector('dialog .step-video-player video')?.readyState >= 2, null, { timeout: 15000 })
  await dialog.getByRole('button', { name: '動画を再生', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('dialog .step-video-player video').currentTime >= 1.25)
  assert.equal(await dialog.locator('video').evaluate(video => video.playbackRate), .5)
  await page.waitForFunction(() => { const v=document.querySelector('dialog .step-video-player video');return v.paused&&v.currentTime>=3 }, { timeout: 10000 })
  assert.ok(await dialog.locator('video').evaluate(video => video.currentTime < 3.08))
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 844 })
    assert.ok(await dialog.locator('.vw-body').evaluate(el => el.scrollWidth <= el.clientWidth + 1))
    const footer = await dialog.locator('.vw-footer').boundingBox()
    assert.ok(footer.y + footer.height <= 844)
    await dialog.screenshot({ path: out + '/edit-' + width + '.png' })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await dialog.getByRole('button', { name: '手順に挿入', exact: true }).click()
  await dialog.getByLabel('作業名', { exact: true }).fill('部品を取り付ける')
  await dialog.getByLabel('作業指示', { exact: true }).fill('奥まで差し込む')
  await page.evaluate(() => { window.failNextSave = true })
  await dialog.getByRole('button', { name: '手順に挿入して保存', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'Test save offline' }).waitFor()
  await dialog.getByRole('button', { name: '手順に挿入して保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  saved = await page.evaluate(() => window.testSaves.at(-1))
  assert.equal(saved.steps.length, 2)
  assert.equal(saved.decisionNodes.length, 2)
  assert.equal(saved.videoSources.length, 3)
  assert.deepEqual(saved.videoClips, manual.videoClips)
  assert.equal(saved.steps[1].videos[0].videoEdit.trimStart, 1)
  assert.equal(saved.steps[1].videos[0].videoEdit.playbackRate, .5)
  assert.equal(await page.evaluate(() => window.uploadNames.length), 0)
  assert.equal(await page.locator('.step-video-attachments button[title="動画を編集"]').count(), 0)

  // Reedit only through the selected source; synchronized chapter/card uses appear once.
  await library.getByLabel('編集対象', { exact: true }).selectOption('step:' + saved.steps[1].id + ':' + saved.steps[1].videos[0].id)
  assert.equal(await library.getByLabel('編集対象', { exact: true }).locator('option').count(), 2)
  await editButton.click()
  await dialog.getByLabel('終了秒', { exact: true }).fill('4')
  await dialog.getByRole('button', { name: '編集する', exact: true }).click()
  await dialog.getByRole('button', { name: '手順に挿入', exact: true }).click()
  await dialog.getByRole('button', { name: '編集を保存', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  saved = await page.evaluate(() => window.testSaves.at(-1))
  assert.equal(saved.steps[1].videos.length, 1)
  assert.equal(saved.decisionNodes[1].media[0].videoEdit.trimEnd, 4)
  assert.equal(saved.videoSources.length, 3)
  await selectSource('second.webm')
  await editButton.click()
  await dialog.getByRole('button', { name: '素材一覧に戻る', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => window.testSaves.length), 2)
  assert.equal(await page.evaluate(() => window.uploadNames.length), 0)
  // Removal is confirmed and persisted, with referenced media and the legacy playlist preserved.
  const removeSource = name => library.getByRole('button', { name: '素材を削除: ' + name, exact: true }).click()
  acceptConfirmation = false
  await removeSource('second.webm')
  assert.equal(await page.evaluate(() => window.testSaves.length), 2)
  acceptConfirmation = true
  await selectSource('first.webm')
  await page.evaluate(() => { window.failNextSave = true })
  await removeSource('first.webm')
  await library.getByRole('alert').filter({ hasText: 'Test save offline' }).waitFor()
  assert.equal(await library.getByRole('button', { name: '素材を選択: first.webm', exact: true }).count(), 1)
  await removeSource('first.webm')
  await library.getByRole('button', { name: '素材を選択: first.webm', exact: true }).waitFor({ state: 'hidden' })
  assert.equal(await library.locator('.video-source-selection').count(), 0)
  const beforeRemoval = saved
  await removeSource('従来の動画')
  await library.getByRole('button', { name: '素材を選択: 従来の動画', exact: true }).waitFor({ state: 'hidden' })
  saved = await page.evaluate(() => window.testSaves.at(-1))
  assert.deepEqual(saved.steps, beforeRemoval.steps)
  assert.deepEqual(saved.decisionNodes, beforeRemoval.decisionNodes)
  assert.deepEqual(saved.videoClips, beforeRemoval.videoClips)
  assert.equal(saved.videoUrl, beforeRemoval.videoUrl)
  fixtureManual = saved
  await page.reload(); await enterSteps()
  assert.equal(await library.locator('.video-source-item').count(), 2)
  await page.getByRole('tab', { name: 'フローチャート作成', exact: true }).click()
  await page.locator('#authoring-flow-panel').getByRole('button', { name: '作業: 既存作業', exact: true }).click()
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: /動画.*編集/ }).count(), 0)
  await page.getByRole('dialog').getByRole('button', { name: '戻す', exact: true }).click()
  await page.getByRole('button', { name: '運用マニュアル', exact: true }).first().click()
  await page.getByRole('link', { name: '動画の編集・手順への挿入', exact: true }).click()
  assert.ok((await page.locator('#guide-video-howto').innerText()).includes('素材一覧'))
  fixtureManual = { ...saved, status: 'published', decisionStartNodeId: saved.decisionNodes[1].id }
  await page.goto(base)
  await enterSteps()
  assert.equal(await upload.isEnabled(), false)
  await selectSource('second.webm')
  assert.equal(await editButton.isEnabled(), false)
  assert.equal(await library.getByRole('button', { name: '素材を削除: second.webm', exact: true }).isEnabled(), false)
  await page.goto(base + '?manual=' + manual.id)
  await page.locator('.manual-document-table .step-video-player').waitFor()
  await page.waitForFunction(() => document.querySelector('.manual-document-table video')?.readyState >= 2)
  assert.equal(await page.locator('.manual-document-table video').evaluate(video => video.currentTime), 1)
  assert.equal(await page.locator('.manual-document-table video').evaluate(video => video.playbackRate), .5)
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const player = page.locator('.decision-runner .step-video-player')
    await player.waitFor(); await player.scrollIntoViewIfNeeded()
    await page.waitForFunction(() => document.querySelector('.decision-runner video')?.readyState >= 2)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await player.getByRole('button', { name: '動画を再生', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.decision-runner video').currentTime > 1.1)
    await player.getByRole('button', { name: '動画を一時停止', exact: true }).click()
    await page.screenshot({ path: out + '/viewer-' + width + '.png' })
  }
  assert.deepEqual(errors, [])
  console.log('PASS multi-video library: batch upload, partial failures, save retry without reupload, reload, legacy preservation, single editing route, trim/effects, insertion/reedit, published lock, desktop/tablet/mobile; no production writes.')
} catch (error) {
  await page.screenshot({ path: out + '/failure.png' })
  console.error(await page.locator('video').evaluateAll(videos => videos.map(v => ({ src: v.currentSrc.slice(0, 120), time: v.currentTime, ready: v.readyState, network: v.networkState, error: v.error?.message }))))
  console.error(errors, await page.locator('dialog').count() ? await page.locator('dialog').innerText() : 'No dialog')
  throw error
} finally { await browser.close() }
