import test from 'node:test'
import assert from 'node:assert/strict'
import { getFlowCardCornerRadius, getFlowCardLayout, getFlowCardTextLayout, getFlowCardPort, expandFlowCardPositions } from '../src/decisionFlowCards.ts'

test('every card wraps the complete title without ellipsis', () => {
  const title = 'かんばん同士の品番が一致することを確認してから製品を取り出し、完成品シュートに流して記録を残す'
  for (const type of ['action', 'question', 'end']) {
    const box = getFlowCardLayout(title, type)
    assert.equal(box.lines.join(''), title)
    assert.ok(box.lines.every((line) => Array.from(line).length <= 12))
    assert.ok(box.height > getFlowCardLayout('確認', type).height)
    assert.ok(box.textX + 12 * 12 < box.width)
  }
  assert.deepEqual(getFlowCardLayout('最初の作業\n\n次の作業', 'action').lines, ['最初の作業', '', '次の作業'])
})

test('diamond text uses its bounding box without making the card excessively wide', () => {
  const box = getFlowCardLayout('品番を確認し、異常があるかを判断する', 'question')
  assert.equal(box.width, 210)
  assert.ok(48 + (box.lines.length - 1) * 18 < box.height)
  assert.ok(box.height <= 130)
})

test('diamond titles are centered for short and wrapped text, clear of the caption and attachment', () => {
  for (const title of ['異常内容を確認', '異常内容を確認し、製品と品番を照合してから次の作業に進んでください'.repeat(5)]) {
    const box = getFlowCardLayout(title, 'question')
    const text = getFlowCardTextLayout(box, 'question')
    assert.equal(text.anchor, 'middle')
    assert.equal(text.baseline, 'central')
    assert.equal(text.titleX, box.width / 2)
    assert.equal(text.kindX, box.width / 2)
    assert.equal((text.titleY + text.titleY + (box.lines.length - 1) * 18) / 2, box.height / 2)
    assert.ok(text.titleY - 7 > text.kindY + 6)
    assert.ok(text.titleY - 7 > text.markY + text.markHeight)
    assert.ok(text.kindY - 6 >= 0)
    assert.ok(text.markX + 42 <= box.width)
    assert.ok(text.titleY + (box.lines.length - 1) * 18 + 7 <= box.height)
  }
})

test('process and end cards retain their existing text alignment', () => {
  for (const type of ['action', 'end']) {
    const box = getFlowCardLayout('作業を確認する', type)
    const text = getFlowCardTextLayout(box, type)
    assert.equal(text.anchor, 'start')
    assert.equal(text.titleX, box.textX)
    assert.equal(text.titleY, text.kindY + 27)
    assert.equal(text.markHeight, 24)
  }
})

test('ports connect to the actual rectangle, diamond and rounded rectangle boundaries', () => {
  const box = { x: 10, y: 20, width: 210, height: 110 }
  assert.deepEqual(getFlowCardPort('action', box, 'right', 18), { x: 220, y: 93 })
  assert.deepEqual(getFlowCardPort('question', box, 'right'), { x: 220, y: 75 })
  const diamond = getFlowCardPort('question', box, 'left', 20)
  assert.ok(Math.abs(Math.abs(diamond.x - 115) / 105 + Math.abs(diamond.y - 75) / 55 - 1) < 1e-10)
  assert.deepEqual(getFlowCardPort('end', box, 'left', 20), { x: 10, y: 95 })
  const cornerRadius = getFlowCardCornerRadius(box.width, box.height)
  assert.equal(cornerRadius, 20)
  const cornerPort = getFlowCardPort('end', box, 'left', 45)
  const cornerCenter = { x: box.x + cornerRadius, y: box.y + box.height - cornerRadius }
  assert.ok(Math.abs(Math.hypot(cornerPort.x - cornerCenter.x, cornerPort.y - cornerCenter.y) - cornerRadius) < 1e-10)
  assert.equal(getFlowCardCornerRadius(10, 10), 5)
})

test('growing cards preserve ordering and expand only needed space without changing saved input', () => {
  const original = [{ x: 30, y: 30, width: 210, height: 200 }, { x: 30, y: 166, width: 210, height: 94 }, { x: 332, y: 166, width: 250, height: 110 }]
  const snapshot = JSON.stringify(original)
  const result = expandFlowCardPositions(original)
  assert.equal(JSON.stringify(original), snapshot)
  assert.equal(result[0].x, 30)
  assert.equal(result[1].x, 30)
  assert.equal(result[2].x, 332)
  assert.ok(result[1].y >= result[0].y + result[0].height)
  assert.equal(result[1].y, result[2].y)
  assert.deepEqual(expandFlowCardPositions(result), result)
})

