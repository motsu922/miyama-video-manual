import test from 'node:test'
import assert from 'node:assert/strict'
import { getFlowLabelBox, getFlowLabelKey, getFlowLabelSize, moveFlowLabel, splitDecisionFlowEdgeLabel } from '../src/decisionFlowLabels.ts'
import { applyDecisionBranchDrafts } from '../src/decisionBranches.ts'

const geometry = { turnX: 300, endX: 360, endY: 150, goesForward: true }

test('long Japanese labels wrap without losing characters and fit the background', () => {
  const label = 'かんばん同士の品番が一致しない場合は確認する'
  const lines = splitDecisionFlowEdgeLabel(label, 2, 3)
  assert.equal(lines.join(''), `3. ${label}`)
  assert.ok(lines.every((line) => Array.from(line).length <= 16))
  assert.ok(getFlowLabelSize(lines).width >= Math.max(...lines.map((line) => Array.from(line).length * 12)) + 16)
  assert.deepEqual(splitDecisionFlowEdgeLabel('  '), [])
})

test('saved offsets round-trip and follow the edge when cards move', () => {
  const lines = ['品番が不一致']
  const base = getFlowLabelBox(lines, geometry)
  const target = moveFlowLabel(base, { x: 50, y: 50 }, { x: 5, y: 100 })
  const offset = JSON.parse(JSON.stringify({ x: target.x - base.x, y: target.y - base.y }))
  const restored = getFlowLabelBox(lines, geometry, offset)
  assert.equal(restored.x, target.x)
  assert.equal(restored.y, target.y)
  const movedEdge = getFlowLabelBox(lines, { ...geometry, turnX: 400, endX: 460, endY: 250 }, offset)
  assert.equal(movedEdge.x, restored.x + 100)
  assert.equal(movedEdge.y, restored.y + 100)
})

test('backward edges, long labels and top-left dragging stay within printable bounds', () => {
  const lines = splitDecisionFlowEdgeLabel('長い条件'.repeat(20))
  const base = getFlowLabelBox(lines, { turnX: 10, endX: 0, endY: 5, goesForward: false })
  assert.equal(base.x, 8)
  assert.equal(base.y, 8)
  const moved = getFlowLabelBox(lines, { turnX: 10, endX: 0, endY: 5, goesForward: false }, { x: 30, y: 40 })
  assert.equal(moved.x, 38)
  assert.equal(moved.y, 48)
  assert.deepEqual(moveFlowLabel(base, { x: 100, y: 100 }, { x: -400, y: -500 }), { x: 8, y: 8 })
  assert.deepEqual(getFlowLabelBox(['YES'], geometry, { x: NaN, y: Infinity }), getFlowLabelBox(['YES'], geometry))
})

test('same destinations have independent positions and branch edits preserve saved offsets', () => {
  const yesKey = getFlowLabelKey('branch', 'yes')
  const noKey = getFlowLabelKey('branch', 'no')
  assert.notEqual(yesKey, noKey)
  assert.notEqual(yesKey, getFlowLabelKey('conditional', 'yes'))
  const nodes = [
    { id: 'q', type: 'question', title: '確認', detail: '', yesNodeId: 'a', noNodeId: 'a', flowLabelOffsets: { [yesKey]: { x: 20, y: 40 }, [noKey]: { x: 10, y: 80 } } },
    { id: 'a', type: 'action', title: '作業', detail: '' },
  ]
  const result = applyDecisionBranchDrafts(nodes, 'q', [
    { id: 'yes', label: '一致', nextNodeId: 'a' },
    { id: 'no', label: '不一致', nextNodeId: 'a' },
  ], { x: 20, y: 20, width: 210, height: 94 })
  assert.deepEqual(result[0].flowLabelOffsets, nodes[0].flowLabelOffsets)
})

