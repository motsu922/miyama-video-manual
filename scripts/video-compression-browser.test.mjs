import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { unlockViewer } from './viewer-login.mjs'
const { chromium } = createRequire(import.meta.url)('playwright')
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5176/'
const out = 'node_modules/.tmp/video-compression'
await fs.mkdir(out, { recursive: true })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  const manual = { id: 'compression-test', title: 'Compression test', workName: '', controlNo: '', productName: '', department: '', owner: '', status: 'draft', version: 'v1.0', duration: '00:00', updatedAt: '2026-10-29', videoUrl: '', thumbnail: '', tags: [], reviewers: [], checks: [], approvalHistory: [], steps: [], decisionNodes: [] }
  await page.route('**/src/manualRepository.ts*', route => route.fulfill({ contentType: 'text/javascript', body: [
    'window.testSaves=[];window.testUploads=[];',
    'export const subscribeManuals=cb=>{cb(' + JSON.stringify([manual]) + ');return()=>{}};',
    'export const subscribeFlashTestResults=(id,cb)=>{cb([]);return()=>{}};',
    'export const ensureSignedIn=async()=>{};',
    'export const saveManual=async manual=>{window.testSaves.push(manual);};',
    'export const uploadManualVideo=async(id,file,progress)=>{window.testUploads.push({name:file.name,size:file.size,type:file.type});progress?.(100);return URL.createObjectURL(file);};',
    'export const uploadManualImage=async(id,file)=>URL.createObjectURL(file);',
    'const prohibited=async()=>{throw Error("Unexpected write")};export const uploadInspectionImage=prohibited,deleteManual=prohibited,recordManualView=prohibited,recordFlashTestResult=prohibited;',
  ].join('\n') }))
  await page.route(/https:\/\/.*(googleapis|firebasestorage)\.com\/.*/, route => route.abort())
  await page.goto(base); await unlockViewer(page)
  // Synthesize moving frames and an audible tone, then actually encode/decode them in Chrome.
  const encoded = await page.evaluate(async () => {
    const { Input, BlobSource, ALL_FORMATS, Output, BufferTarget, WebMOutputFormat, CanvasSource, AudioBufferSource, Quality } = await import('/node_modules/mediabunny/dist/modules/src/index.js')
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360
    const ctx = canvas.getContext('2d')
    const target = new BufferTarget(); const output = new Output({ format: new WebMOutputFormat(), target })
    const videoSource = new CanvasSource(canvas, { codec: 'vp8', quality: new Quality({ bitrate: 2000000 }) })
    const audioSource = new AudioBufferSource({ codec: 'opus', quality: new Quality({ bitrate: 64000 }) })
    output.addVideoTrack(videoSource, { frameRate: 30 }); output.addAudioTrack(audioSource); await output.start()
    const audio = new AudioBuffer({ numberOfChannels: 1, sampleRate: 48000, length: 105600 })
    const samples = audio.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i * 440 * 2 * Math.PI / 48000) * .05
    await audioSource.add(audio)
    for (let frame = 0; frame < 66; frame++) {
      ctx.fillStyle = '#edf5f1'; ctx.fillRect(0, 0, 640, 360); ctx.fillStyle = '#098678'; ctx.fillRect((frame * 9) % 550, 70, 80, 80); ctx.font = '32px sans-serif'; ctx.fillText('Compression test ' + frame, 30, 230)
      await videoSource.add(frame / 30, 1 / 30)
    }
    await output.finalize()
    const file = new File([target.buffer], 'synthetic.webm', { type: 'video/webm' })
    const { compressVideoFile } = await import('/src/videoCompression.ts')
    const progress = []
    const compressed = await compressVideoFile(file, new AbortController().signal, value => progress.push(value))
    const input = new Input({ source: new BlobSource(compressed), formats: ALL_FORMATS })
    const video = await input.getPrimaryVideoTrack()
    const info = { audio: (await input.getAudioTracks()).length, duration: await input.computeDuration(), width: await video.getDisplayWidth(), height: await video.getDisplayHeight() }; input.dispose()
    const controller = new AbortController()
    let canceled = false
    try { await compressVideoFile(file, controller.signal, () => controller.abort()) } catch (error) { canceled = error.name === 'AbortError' }
    let invalid = false
    try { await compressVideoFile(new File(['invalid'], 'bad.mp4', { type: 'video/mp4' }), new AbortController().signal, () => {}) } catch { invalid = true }
    return { bytes: [...new Uint8Array(await compressed.arrayBuffer())], name: compressed.name, type: compressed.type, progress, info, canceled, invalid }
  })
  assert.ok(['video/mp4', 'video/webm'].includes(encoded.type))
  assert.equal(encoded.info.audio, 1); assert.ok(encoded.info.duration > 2 && encoded.info.duration < 3)
  assert.equal(encoded.info.width, 640); assert.equal(encoded.info.height, 360)
  assert.equal(encoded.progress.at(-1).percent, 100); assert.ok(encoded.canceled); assert.ok(encoded.invalid)
  // Valid container padding >500 MiB exercises the real file-size boundary without real/private footage.
  // This does not substitute for a long-duration/high-resolution memory stress test.
  const extension = encoded.type === 'video/mp4' ? 'mp4' : 'webm'
  const filename = 'oversized.' + extension
  const fixture = path.resolve(out, filename)
  const bytes = Buffer.from(encoded.bytes); const targetSize = 501 * 1024 * 1024
  const header = Buffer.alloc(extension === 'mp4' ? 8 : 9)
  if (extension === 'mp4') { header.writeUInt32BE(targetSize - bytes.length); header.write('free', 4) }
  else { header[0] = 0xec; header.writeBigUInt64BE(0x0100000000000000n | BigInt(targetSize - bytes.length - 9), 1) }
  const handle = await fs.open(fixture, 'w')
  try { await handle.write(bytes); await handle.write(header); await handle.truncate(targetSize) } finally { await handle.close() }
  await page.locator('.manual-list').getByRole('button', { name: '編集', exact: true }).click()
  await page.getByRole('tab', { name: '手順作成', exact: true }).click()
  await page.getByLabel('動画素材ファイル', { exact: true }).setInputFiles(fixture)
  const openCompression = page.getByRole('button', { name: filename + 'を圧縮', exact: true })
  await openCompression.waitFor(); assert.equal(await page.evaluate(() => window.testUploads.length), 0)
  await openCompression.click()
  const dialog = page.locator('dialog.video-compression-dialog')
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click()
  assert.equal(await page.evaluate(() => window.testUploads.length), 0)
  await openCompression.click()
  await dialog.getByRole('button', { name: '圧縮を開始', exact: true }).click()
  const confirm = dialog.getByRole('button', { name: 'この動画をアップロード', exact: true })
  await confirm.waitFor({ timeout: 60000 })
  assert.equal(await page.evaluate(() => window.testUploads.length), 0)
  await page.waitForFunction(() => document.querySelector('.video-compression-dialog video')?.readyState >= 2)
  await dialog.locator('video').evaluate(video => video.play())
  await page.waitForFunction(() => document.querySelector('.video-compression-dialog video').currentTime > .2)
  await dialog.locator('video').evaluate(video => video.pause())
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 844 })
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1))
    const footer = await dialog.locator('footer').boundingBox(); assert.ok(footer.y + footer.height <= 844)
    await dialog.screenshot({ path: `${out}/preview-${width}.png` })
  }
  await confirm.click(); await dialog.waitFor({ state: 'hidden' })
  await page.waitForFunction(() => window.testSaves.length === 1)
  const uploaded = await page.evaluate(() => window.testUploads)
  assert.equal(uploaded.length, 1); assert.ok(uploaded[0].size < 500 * 1024 * 1024); assert.match(uploaded[0].name, /^oversized-compressed\.(mp4|webm)$/)
  assert.equal(await page.evaluate(() => window.testSaves[0].videoSources.length), 1)
  assert.deepEqual(errors, [])
  console.log('PASS actual video/audio compression, decode/playback, cancellation, invalid input, >500MiB boundary, explicit upload only, responsive preview. Synthetic sparse fixture; no production writes.', { info: encoded.info, uploaded })
} catch (error) {
  await page.screenshot({ path: out + '/failure.png' })
  console.error(errors, await page.locator('dialog').count() ? await page.locator('dialog').innerText() : 'No dialog')
  throw error
} finally { await browser.close() }
