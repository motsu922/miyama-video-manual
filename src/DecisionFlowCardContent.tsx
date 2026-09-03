import { Paperclip } from 'lucide-react'
import type { DecisionNode } from './types'
import { getFlowCardLayout } from './decisionFlowCards'

export default function DecisionFlowCardContent({ node, x, y }: { node: DecisionNode; x: number; y: number }) {
  const { lines, width, height, textX } = getFlowCardLayout(node.title, node.type)
  const kindY = node.type !== 'end' ? 21 : (height - (32 + lines.length * 18)) / 2 + 12
  const attachmentCount = node.media?.length ?? 0
  const markX = x + textX + (node.type !== 'end' ? 184 : 156) - 42
  return <>
    {node.type === 'question' ? (
      <polygon className="decision-flow-shape" points={`${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`} />
    ) : node.type === 'end' ? (
      <ellipse className="decision-flow-shape" cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} />
    ) : <rect className="decision-flow-shape" x={x} y={y} width={width} height={height} />}
    <text className="decision-flow-kind" x={x + textX} y={y + kindY}>
      {node.type === 'question' ? '判断' : node.type === 'action' ? '作業' : '完了'}
    </text>
    {lines.map((line, index) => <text className="decision-flow-title" key={index} x={x + textX} y={y + kindY + 27 + index * 18}>{line}</text>)}
    {attachmentCount > 0 && <g className="decision-flow-attachment-mark">
      <title>{`資料 ${attachmentCount}件`}</title>
      <rect height="24" rx="5" width="42" x={markX} y={y + kindY - 16} />
      <Paperclip aria-hidden="true" height="14" width="14" x={markX + 6} y={y + kindY - 11} />
      <text className="decision-flow-attachment-count" x={markX + 36} y={y + kindY + 1}>{attachmentCount}</text>
    </g>}
  </>
}

