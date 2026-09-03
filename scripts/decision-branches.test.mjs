import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyDecisionBranchDrafts, getDecisionBranches } from '../src/decisionBranches.ts'

const layout = { x: 30, y: 30, width: 180, height: 80 }
const action = { id: 'a', title: 'Record', detail: '', type: 'action', flowPosition: { x: 500, y: 30 } }
const question = { id: 'q', title: 'Result?', detail: '', type: 'question', yesNodeId: 'a', noNodeId: 'a' }

test('legacy YES/NO routes and shared destinations survive editing', () => {
  const rows = getDecisionBranches(question)
  assert.equal(rows[0].nextNodeId, 'a')
  const nodes = [question, action]
  const before = JSON.stringify(nodes)
  const result = applyDecisionBranchDrafts(nodes, 'q', [...rows, { id: 'other', label: 'Other', nextNodeId: 'a' }], layout)
  assert.equal(result.length, 2)
  assert.deepEqual(result[0].branches.map((row) => row.nextNodeId), ['a', 'a', 'a'])
  assert.deepEqual(result[0].branches.map((row) => row.id), ['yes', 'no', 'other'])
  assert.equal(JSON.stringify(nodes), before)
  assert.equal(result[0].yesNodeId, undefined)
})

test('new action and end destinations are connected atomically without moving old cards', () => {
  const obstacle = { ...action, id: 'obstacle', flowPosition: { x: 380, y: 30 } }
  const result = applyDecisionBranchDrafts([question, obstacle], 'q', [
    { id: 'yes', label: ' OK ', newNode: { id: 'new-a', title: ' Record ', type: 'action' } },
    { id: 'no', label: 'NG', newNode: { id: 'new-end', title: 'Done', type: 'end' } },
  ], layout)
  assert.equal(result.length, 4)
  assert.equal(result[0].branches[0].label, 'OK')
  assert.equal(result[0].branches[0].nextNodeId, 'new-a')
  assert.equal(result[0].branches[1].nextNodeId, 'new-end')
  assert.equal(result[2].title, 'Record')
  assert.equal(result[3].type, 'end')
  assert.deepEqual(result[1].flowPosition, obstacle.flowPosition)
  assert.ok(result[2].flowPosition.y >= 150)
  assert.ok(result[3].flowPosition.y > result[2].flowPosition.y)
  assert.ok(!('newNode' in result[0].branches[0]))
})

test('invalid draft fails without mutating any saved nodes', () => {
  const nodes = [question, action]
  const before = JSON.stringify(nodes)
  for (const bad of [
    [{ id: 'yes', label: '' }, { id: 'no', label: 'NO' }],
    [{ id: 'yes', label: 'YES', nextNodeId: 'q' }, { id: 'no', label: 'NO' }],
    [{ id: 'yes', label: 'YES', nextNodeId: 'missing' }, { id: 'no', label: 'NO' }],
    [{ id: 'yes', label: 'YES', newNode: { id: 'new', title: '', type: 'action' } }, { id: 'no', label: 'NO' }],
    [{ id: 'yes', label: 'YES' }],
  ]) assert.throws(() => applyDecisionBranchDrafts(nodes, 'q', bad, layout))
  assert.equal(JSON.stringify(nodes), before)
})

test('deleting a branch cleans conditional routes but keeps destination cards', () => {
  const q = { ...question, branches: [{ id: 'keep1', label: 'OK' }, { id: 'keep2', label: 'NG' }, { id: 'remove', label: 'Other', nextNodeId: 'a' }] }
  const linked = { ...action, conditionalNext: [{ branchId: 'remove', nextNodeId: 'a' }, { branchId: 'keep1', nextNodeId: 'a' }] }
  const result = applyDecisionBranchDrafts([q, linked], 'q', q.branches.slice(0, 2), layout)
  assert.equal(result.length, 2)
  assert.deepEqual(result[1].conditionalNext, [{ branchId: 'keep1', nextNodeId: 'a' }])
})

test('editing one question never changes a second question with the same title', () => {
  const other = { ...question, id: 'q2' }
  const result = applyDecisionBranchDrafts([question, other, action], 'q', [{ id: 'custom', label: 'OK' }, { id: 'no', label: 'NO' }], layout)
  assert.deepEqual(result[1], other)
})

test('deleting a legacy shared branch ID retains other questions conditional routes', () => {
  const other = { ...question, id: 'q2' }
  const linked = { ...action, conditionalNext: [{ branchId: 'yes', nextNodeId: 'a' }] }
  const result = applyDecisionBranchDrafts([question, other, linked], 'q', [{ id: 'new', label: 'New' }, { id: 'no', label: 'NO' }], layout)
  assert.deepEqual(result[2].conditionalNext, linked.conditionalNext)
})

test('blank destinations are allowed in a draft and IDs remain stable', () => {
  const rows = [{ id: 'one', label: 'YES' }, { id: 'two', label: 'NO' }]
  const result = applyDecisionBranchDrafts([question, action], 'q', rows, layout)
  assert.deepEqual(result[0].branches, rows)
})

