import assert from 'node:assert/strict'
import { test } from 'node:test'
import { insertVideoIntoManual, validateVideoEdit } from '../src/videoWorkflow.ts'

const edit = { duration: 30, trimStart: 10, trimEnd: 18, playbackRate: .5, zoom: 1.5, caption: 'Insert fully' }
const media = { id: 'v', kind: 'video', url: 'https://example.invalid/video', name: 'Test', uploadedAt: '', videoEdit: edit }
const manual = { id: 'm', status: 'draft', title: 'Existing', videoUrl: 'original', videoClips: [{ id: 'original' }], steps: [{ id: 7, title: 'A', time: '00:03', detail: 'Keep' }], decisionNodes: [{ id: 'a', sourceStepId: 7, type: 'action', title: 'A', detail: 'Keep', nextNodeId: 'b', media: [{ id: 'photo', kind: 'image' }] }, { id: 'b', title: 'B', type: 'end' }], decisionStartNodeId: 'a' }
test('new steps preserve existing content, routes and video playlist; retries are idempotent', () => {
  const before = JSON.stringify(manual)
  const request = { media, target: { kind: 'new', title: 'New', detail: 'Details' } }
  const result = insertVideoIntoManual(manual, request)
  assert.equal(result.steps.length, 2)
  assert.equal(result.decisionNodes.length, 3)
  assert.equal(result.steps[1].id, 8)
  assert.equal(result.decisionNodes[2].sourceStepId, 8)
  assert.equal(result.decisionStartNodeId, 'a')
  assert.deepEqual(result.decisionNodes[0], manual.decisionNodes[0])
  assert.deepEqual(result.videoClips, manual.videoClips)
  assert.equal(result.videoUrl, manual.videoUrl)
  assert.equal(insertVideoIntoManual(result, request), result)
  assert.equal(JSON.stringify(manual), before)
})
test('chapter insertion updates linked node, preserves photos and reedit upserts', () => {
  const result = insertVideoIntoManual(manual, { media, target: { kind: 'step', id: 7 } })
  assert.equal(result.decisionNodes[0].media.length, 2)
  const edited = insertVideoIntoManual(result, { media: { ...media, videoEdit: { ...edit, trimStart: 12 } }, target: { kind: 'node', id: 'a' } })
  assert.equal(edited.decisionNodes[0].media.length, 2)
  assert.equal(edited.steps[0].videos.length, 1)
  assert.equal(edited.steps[0].videos[0].videoEdit.trimStart, 12)
})
test('propagation is opt in and invalid targets or published manuals are rejected', () => {
  const single = insertVideoIntoManual(manual, { media, target: { kind: 'node', id: 'a' } })
  assert.equal(single.decisionNodes[1].media, undefined)
  const multiple = insertVideoIntoManual(manual, { media, target: { kind: 'node', id: 'a' }, copyNodeIds: ['b'] })
  assert.equal(multiple.decisionNodes[1].media.length, 1)
  assert.throws(() => insertVideoIntoManual(manual, { media, target: { kind: 'node', id: 'missing' } }))
  assert.throws(() => insertVideoIntoManual(manual, { media, target: { kind: 'step', id: 999 } }))
  assert.throws(() => insertVideoIntoManual({ ...manual, status: 'published' }, { media, target: { kind: 'new', title: 'X', detail: '' } }))
})
test('invalid trim and effects are rejected', () => {
  for (const patch of [{ trimStart: -1 }, { trimEnd: 31 }, { trimEnd: 10 }, { duration: Infinity }, { trimStart: NaN }, { zoom: 10 }, { playbackRate: 0 }]) assert.throws(() => validateVideoEdit({ ...edit, ...patch }))
  assert.doesNotThrow(() => validateVideoEdit(edit))
})
