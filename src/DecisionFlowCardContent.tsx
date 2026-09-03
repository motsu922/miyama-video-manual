import { Paperclip } from 'lucide-react'
import type { DecisionNode } from './types'
import { getFlowCardCornerRadius, getFlowCardLayout, getFlowCardTextLayout } from './decisionFlowCards'

export default function DecisionFlowCardContent({ node, x, y }: { node: DecisionNode; x: number; y: number }) {
  const layout = getFlowCardLayout(node.title, node.type)
  const { lines, width, height } = layout
  const text = getFlowCardTextLayout(layout, node.type)
  const attachmentCount = node.media?.length ?? 0
  const markX = x + text.markX
  const markY = y + text.markY
  return <>
    {node.type === 'question' ? (
      <polygon className="decision-flow-shape" points={`${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}`} />
    ) : node.type === 'end' ? (
      <rect className="decision-flow-shape" x={x} y={y} width={width} height={height} rx={getFlowCardCornerRadius(width, height)} />
    ) : <rect className="decision-flow-shape" x={x} y={y} width={width} height={height} />}
    <text className="decision-flow-kind" x={x + text.kindX} y={y + text.kindY} textAnchor={text.anchor} dominantBaseline={text.baseline}>
      {node.type === 'question' ? '判断' : node.type === 'action' ? '作業' : '完了'}
    </text>
    {lines.map((line, index) => <text className="decision-flow-title" key={index} x={x + text.titleX} y={y + text.titleY + index * 18} textAnchor={text.anchor} dominantBaseline={text.baseline}>{line}</text>)}
    {attachmentCount > 0 && <g className="decision-flow-attachment-mark">
      <title>{`資料 ${attachmentCount}件`}</title>
      <rect height={text.markHeight} rx="5" width="42" x={markX} y={markY} />
      <Paperclip aria-hidden="true" height="14" width="14" x={markX + 6} y={markY + (text.markHeight - 14) / 2} />
      <text className="decision-flow-attachment-count" x={markX + 36} y={markY + text.markHeight / 2 + 5}>{attachmentCount}</text>
    </g>}
  </>
}

