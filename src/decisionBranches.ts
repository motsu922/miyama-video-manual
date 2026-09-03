import type { DecisionBranch, DecisionNode } from './types'

export type DecisionBranchDraft = DecisionBranch & {
  newNode?: { id: string; type: 'action' | 'end'; title: string }
}

export function getDecisionBranches(node: DecisionNode): DecisionBranch[] {
  if (node.branches?.length) return node.branches
  return [
    { id: 'yes', label: 'YES', nextNodeId: node.yesNodeId },
    { id: 'no', label: 'NO', nextNodeId: node.noNodeId },
  ]
}

// Build all destinations and edges together; the editor can discard its draft without changing the graph.
export function applyDecisionBranchDrafts(
  nodes: DecisionNode[],
  sourceId: string,
  drafts: DecisionBranchDraft[],
  layout: { x: number; y: number; width: number; height: number },
): DecisionNode[] {
  const source = nodes.find((node) => node.id === sourceId)
  if (!source) throw new Error('編集するカードが見つかりません。')
  if (drafts.length < 2) throw new Error('選択肢を2つ以上設定してください。')
  const ids = new Set(nodes.map((node) => node.id))
  const branchIds = new Set<string>()
  const created: DecisionNode[] = []
  const branches: DecisionBranch[] = drafts.map((draft, index) => {
    if (!draft.label.trim()) throw new Error(`選択肢 ${index + 1} の名前を入力してください。`)
    if (branchIds.has(draft.id)) throw new Error('選択肢の識別子が重複しています。')
    branchIds.add(draft.id)
    let nextNodeId = draft.nextNodeId
    if (draft.newNode) {
      if (!draft.newNode.title.trim()) throw new Error(`選択肢 ${index + 1} の次のカード名を入力してください。`)
      if (ids.has(draft.newNode.id)) throw new Error('新しいカードの識別子が重複しています。')
      const x = layout.x + layout.width + 170
      let y = layout.y + index * (layout.height + 40)
      const occupied = [...nodes, ...created]
      while (occupied.some((node) => {
        const point = node.flowPosition
        return point && Math.abs(point.x - x) < layout.width + 24 && Math.abs(point.y - y) < layout.height + 24
      })) y += layout.height + 40
      created.push({
        id: draft.newNode.id,
        type: draft.newNode.type,
        title: draft.newNode.title.trim(),
        detail: '',
        flowPosition: { x, y },
      })
      ids.add(draft.newNode.id)
      nextNodeId = draft.newNode.id
    } else if (nextNodeId && (nextNodeId === sourceId || !nodes.some((node) => node.id === nextNodeId))) {
      throw new Error(`選択肢 ${index + 1} の接続先を選び直してください。`)
    }
    return { id: draft.id, label: draft.label.trim(), ...(nextNodeId ? { nextNodeId } : {}) }
  })
  const removedIds = new Set(getDecisionBranches(source).filter((branch) => !branchIds.has(branch.id)).map((branch) => branch.id))
  // Legacy YES/NO identifiers can be shared by other questions; keep their conditional routes intact.
  nodes.filter((node) => node.id !== sourceId && node.type === 'question').forEach((node) => {
    getDecisionBranches(node).forEach((branch) => removedIds.delete(branch.id))
  })
  return nodes.map((node) => {
    const updated = node.id === sourceId ? { ...node, branches, yesNodeId: undefined, noNodeId: undefined } : node
    return updated.conditionalNext && removedIds.size
      ? { ...updated, conditionalNext: updated.conditionalNext.filter((condition) => !removedIds.has(condition.branchId)) }
      : updated
  }).concat(created)
}

