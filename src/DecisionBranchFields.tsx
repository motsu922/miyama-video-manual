import { ArrowRight, Link2, Plus, Trash2 } from 'lucide-react'
import type { DecisionNode } from './types'
import type { DecisionBranchDraft } from './decisionBranches'

type Props = {
  sourceId: string
  rows: DecisionBranchDraft[]
  nodes: DecisionNode[]
  disabled: boolean
  connectionTargetId: string | null
  onChange: (rows: DecisionBranchDraft[]) => void
  onConnectionChosen: () => void
}

export default function DecisionBranchFields({ sourceId, rows, nodes, disabled, connectionTargetId, onChange, onConnectionChosen }: Props) {
  const targets = nodes.filter((node) => node.id !== sourceId)
  const update = (id: string, patch: Partial<DecisionBranchDraft>) => {
    onChange(rows.map((row) => row.id === id ? { ...row, ...patch } : row))
  }
  return (
    <section className="branch-editor" aria-labelledby="branch-editor-title">
      <header>
        <h3 id="branch-editor-title">選択肢と次のカード</h3>
        <button type="button" disabled={disabled} onClick={() => onChange([...rows, {
          id: `branch-${crypto.randomUUID()}`, label: `選択肢 ${rows.length + 1}`,
        }])}>
          <Plus size={16} aria-hidden="true" />選択肢を追加
        </button>
      </header>
      {connectionTargetId && <p className="branch-connection-target" role="status">接続先: {nodes.find((node) => node.id === connectionTargetId)?.title || '名称未設定'}</p>}
      <div className="branch-editor-rows">
        {rows.map((row, index) => (
          <div className="branch-editor-row" key={row.id}>
            <label>
              選択肢 {index + 1}
              <input disabled={disabled} value={row.label} onChange={(event) => update(row.id, { label: event.target.value })} />
            </label>
            <ArrowRight className="branch-editor-arrow" size={18} aria-hidden="true" />
            <div className="branch-editor-destination">
              <label>
                次のカード {index + 1}
                <select disabled={disabled} value={row.newNode ? `new:${row.newNode.type}` : row.nextNodeId || ''} onChange={(event) => {
                  const value = event.target.value
                  if (value === 'new:action' || value === 'new:end') {
                    update(row.id, { nextNodeId: undefined, newNode: {
                      id: row.newNode?.id || `decision-${crypto.randomUUID()}`,
                      type: value === 'new:action' ? 'action' : 'end',
                      title: row.newNode?.title || (value === 'new:end' ? '確認完了' : ''),
                    } })
                  } else update(row.id, { nextNodeId: value || undefined, newNode: undefined })
                }}>
                  <option value="">未接続</option>
                  <optgroup label="新しいカード">
                    <option value="new:action">新しい作業を作成</option>
                    <option value="new:end">新しい完了を作成</option>
                  </optgroup>
                  <optgroup label="既存のカード">
                    {targets.map((node, targetIndex) => <option key={node.id} value={node.id}>{targetIndex + 1}. {node.title || '名称未設定'} ({node.type === 'question' ? '判断' : node.type === 'action' ? '作業' : '完了'})</option>)}
                  </optgroup>
                  {row.nextNodeId && !targets.some((node) => node.id === row.nextNodeId) && <option value={row.nextNodeId}>接続先が見つかりません</option>}
                </select>
              </label>
              {row.newNode && <label>
                新しいカード名 {index + 1}
                <input disabled={disabled} value={row.newNode.title} onChange={(event) => update(row.id, { newNode: { ...row.newNode!, title: event.target.value } })} />
              </label>}
              {connectionTargetId && <button className="branch-connect-choice" disabled={disabled} type="button" onClick={() => {
                update(row.id, { nextNodeId: connectionTargetId, newNode: undefined })
                onConnectionChosen()
              }}><Link2 size={16} aria-hidden="true" />この分岐につなぐ</button>}
            </div>
            <button className="branch-editor-remove" type="button" disabled={disabled || rows.length <= 2} title={`選択肢 ${index + 1} を削除`} aria-label={`選択肢 ${index + 1} を削除`} onClick={() => onChange(rows.filter((item) => item.id !== row.id))}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

