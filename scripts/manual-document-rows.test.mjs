import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Compile the small dependency graph with the project's TypeScript compiler for Node ESM.
import ts from 'typescript'
const out = path.resolve('node_modules/.tmp/manual-document-unit')
await fs.mkdir(out, { recursive: true })
for (const name of ['manualDocumentRows', 'decisionBranches']) {
  const source = await fs.readFile(`src/${name}.ts`, 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  await fs.writeFile(path.join(out, `${name}.mjs`), output.replace("'./decisionBranches'", "'./decisionBranches.mjs'"))
}
const { getManualDocumentRows } = await import(pathToFileURL(path.join(out, 'manualDocumentRows.mjs')))
test('flow ordering handles branches, shared nodes, cycles, disconnected cards and unlinked chapters without mutating the manual', () => {
  const manual = { steps: [{ id: 1 }, { id: 2 }], decisionStartNodeId: 'q', decisionNodes: [
    { id: 'isolated', type: 'action' },
    { id: 'q', type: 'question', branches: [{ id: 'yes', nextNodeId: 'a' }, { id: 'no', nextNodeId: 'b' }] },
    { id: 'a', type: 'action', sourceStepId: 1, nextNodeId: 'end', conditionalNext: [{ branchId: 'yes', nextNodeId: 'b' }] },
    { id: 'b', type: 'action', nextNodeId: 'a' }, { id: 'end', type: 'end' },
  ] }
  const before = JSON.stringify(manual)
  const rows = getManualDocumentRows(manual)
  assert.deepEqual(rows.map(row => row.key), ['node-q', 'node-a', 'node-end', 'node-b', 'node-isolated', 'step-2'])
  assert.equal(rows[1].step.id, 1)
  assert.equal(JSON.stringify(manual), before)
})
test('chapter-only and empty manuals are supported', () => {
  assert.deepEqual(getManualDocumentRows({ steps: [{ id: 3 }, { id: 7 }] }).map(row => row.key), ['step-3', 'step-7'])
  assert.deepEqual(getManualDocumentRows({ steps: [] }), [])
})

