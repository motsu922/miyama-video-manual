import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planVideoCompression } from '../src/videoCompressionPlan.ts'
import { VIDEO_SOURCE_MAX_BYTES } from '../src/videoLibrary.ts'

test('compression budgets include audio and container headroom', () => {
  for (const duration of [5, 600, 1800, 7200, 18000]) {
    const plan = planVideoCompression(duration, 3840, 2160, true)
    assert.ok((plan.videoBitrate + plan.audioBitrate) * duration / 8 < VIDEO_SOURCE_MAX_BYTES * .86)
    assert.equal(plan.width, plan.videoBitrate < 500000 ? 640 : 1280)
    assert.ok(plan.videoBitrate > 0)
    assert.equal(plan.audioBitrate, 64000)
  }
})
test('portrait and small videos retain aspect ratio with even dimensions and no enlargement', () => {
  for (const [width, height] of [[2160, 3840], [640, 480], [1279, 719]]) {
    const plan = planVideoCompression(60, width, height, false)
    assert.ok(plan.width <= width && plan.height <= height)
    assert.equal(plan.width % 2, 0); assert.equal(plan.height % 2, 0)
    assert.ok(Math.abs(plan.width / plan.height - width / height) < .01)
    assert.equal(plan.audioBitrate, 0)
  }
})
test('retry reduces bitrate and invalid or impractically long videos are rejected', () => {
  assert.ok(planVideoCompression(100, 1920, 1080, true, 1).videoBitrate < planVideoCompression(100, 1920, 1080, true).videoBitrate)
  for (const duration of [0, -1, Infinity, NaN, 1e8]) assert.throws(() => planVideoCompression(duration, 1920, 1080, true))
})
