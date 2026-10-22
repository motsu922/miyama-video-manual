import { getDecisionBranches } from './decisionBranches'
import type { DecisionNode, Manual, Step } from './types'

export type ManualDocumentRow = { key: string; node?: DecisionNode; step?: Step }

export function getManualDocumentRows(manual: Manual): ManualDocumentRow[] {
  const nodes = manual.decisionNodes ?? []
  const byId = new Map(nodes.map(node => [node.id, node]))
  const visited = new Set<string>()
  const rows: ManualDocumentRow[] = []
  function visit(id: string | undefined) {
    if (!id || visited.has(id)) return
    const node = byId.get(id)
    if (!node) return
    visited.add(id)
    rows.push({ key: `node-${node.id}`, node, step: manual.steps.find(step => step.id === node.sourceStepId) })
    if (node.type === 'question') getDecisionBranches(node).forEach(branch => visit(branch.nextNodeId))
    else if (node.type === 'action') {
      visit(node.nextNodeId)
      node.conditionalNext?.forEach(route => visit(route.nextNodeId))
    }
  }
  visit(manual.decisionStartNodeId || nodes[0]?.id)
  nodes.forEach(node => visit(node.id))
  const linked = new Set(nodes.map(node => node.sourceStepId))
  manual.steps.filter(step => !linked.has(step.id)).forEach(step => rows.push({ key: `step-${step.id}`, step }))
  return rows
}

