import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendVideoSource, getVideoSources, getVideoUses, removeVideoSource, validateVideoSourceFile } from '../src/videoLibrary.ts'

const source = { id: 's', name: 'Source', url: 'original', uploadedAt: '' }
const media = { ...source, kind: 'video', videoEdit: { duration: 30, trimStart: 3, trimEnd: 10 } }
const manual = { id: 'm', status: 'draft', videoUrl: 'main', thumbnail: 'photo', videoClips: [{ id: 'clip', name: 'Existing clip', url: 'original', duration: 30, trimStart: 3, trimEnd: 10 }], steps: [{ id: 7, title: 'A', time: '00:03', detail: 'Keep', videos: [media] }], decisionNodes: [{ id: 'n', title: 'A', sourceStepId: 7, media: [media] }, { id: 'b', title: 'Other', media: [{ ...media, id: 'other' }] }] }

test('legacy clips, main videos and attachments are available without changing playback or originals', () => {
  const before = JSON.stringify(manual)
  assert.deepEqual(getVideoSources(manual).map(item => item.url), ['original', 'main'])
  assert.equal(getVideoSources(manual)[0].trimStart, undefined)
  assert.equal(JSON.stringify(manual), before)
})
test('batch additions and save retries preserve all existing sources, text, clips and media', () => {
  const first = appendVideoSource(manual, source)
  const second = appendVideoSource(first, { ...source, id: 'two', url: 'second' })
  const retry = appendVideoSource(second, source)
  assert.equal(retry.videoSources.length, 2)
  assert.equal(getVideoSources(retry).length, 3)
  assert.deepEqual(retry.steps, manual.steps)
  assert.deepEqual(retry.decisionNodes, manual.decisionNodes)
  assert.deepEqual(retry.videoClips, manual.videoClips)
  assert.equal(retry.videoUrl, 'main')
  assert.equal(manual.videoSources, undefined)
  assert.throws(() => appendVideoSource({ ...manual, status: 'published' }, source))
})
test('reediting includes independent uses and avoids duplicate linked card entries', () => {
  const uses = getVideoUses(manual, source)
  assert.equal(uses.length, 2)
  assert.deepEqual(uses.map(use => use.target), [{ kind: 'step', id: 7 }, { kind: 'node', id: 'b' }])
  assert.equal(uses[0].media.videoEdit.trimStart, 3)
})
test('file validation rejects non-videos and oversized files', () => {
  assert.throws(() => validateVideoSourceFile({ type: 'image/png', size: 12 }))
  assert.throws(() => validateVideoSourceFile({ type: 'video/mp4', size: 500 * 1024 * 1024 + 1 }))
  assert.throws(() => validateVideoSourceFile({ type: 'video/mp4', size: 500 * 1024 * 1024 }))
  assert.doesNotThrow(() => validateVideoSourceFile({ type: 'video/mp4', size: 500 * 1024 * 1024 - 1 }))
})

test('removing used and legacy sources persists without deleting playback or referenced files', () => {
  const original = appendVideoSource(manual, source)
  const removed = removeVideoSource(original, source)
  assert.equal(removed.videoSources.length, 0)
  assert.deepEqual(getVideoSources(removed).map(item => item.url), ['main'])
  assert.deepEqual(getVideoSources(JSON.parse(JSON.stringify(removed))).map(item => item.url), ['main'])
  assert.deepEqual(removed.steps, original.steps)
  assert.deepEqual(removed.decisionNodes, original.decisionNodes)
  assert.deepEqual(removed.videoClips, original.videoClips)
  assert.equal(removed.videoUrl, original.videoUrl)
  assert.deepEqual(removeVideoSource(removed, source).removedVideoSourceUrls, ['original'])
  assert.equal(getVideoSources(appendVideoSource(removed, source)).length, 2)
  assert.throws(() => removeVideoSource({ ...original, status: 'published' }, source))
})
