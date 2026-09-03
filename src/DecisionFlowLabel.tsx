import { useRef, useState, type MouseEvent, type PointerEvent } from 'react'
import { moveFlowLabel, type FlowLabelPoint } from './decisionFlowLabels'

type Props = {
  label: string
  lines: string[]
  box: FlowLabelPoint & { width: number; height: number }
  disabled: boolean
  onDragStart: () => void
  onMove: (position: FlowLabelPoint) => void
  onOpen: (event: Pick<MouseEvent<SVGGElement>, 'clientX' | 'clientY' | 'stopPropagation'>) => void
}

export default function DecisionFlowLabel({ label, lines, box, disabled, onDragStart, onMove, onOpen }: Props) {
  const [preview, setPreview] = useState<FlowLabelPoint | null>(null)
  const dragRef = useRef<{
    pointerId: number
    start: FlowLabelPoint
    origin: FlowLabelPoint
    current: FlowLabelPoint
    inverse: DOMMatrix
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)
  const position = preview ?? box

  const updateDrag = (event: PointerEvent<SVGGElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(drag.inverse)
    if (!drag.moved && Math.hypot(point.x - drag.start.x, point.y - drag.start.y) < 4) return
    if (!drag.moved) onDragStart()
    drag.moved = true
    suppressClick.current = true
    drag.current = moveFlowLabel(drag.origin, drag.start, point)
    setPreview(drag.current)
  }

  const finishDrag = (event: PointerEvent<SVGGElement>, cancel = false) => {
    event.stopPropagation()
    if (!cancel) updateDrag(event)
    const drag = dragRef.current
    dragRef.current = null
    setPreview(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (drag?.moved && !cancel && !disabled) onMove(drag.current)
  }

  return (
    <g
      className={`decision-flow-edge-label ${label.toLowerCase() === 'yes' ? 'yes' : label.toLowerCase() === 'no' ? 'no' : ''} ${preview ? 'dragging' : ''}`}
      aria-label={`分岐条件: ${label}`}
      aria-disabled={disabled}
      role="button"
      tabIndex={disabled ? -1 : 0}
      transform={`translate(${position.x} ${position.y})`}
      onPointerDown={(event) => {
        event.stopPropagation()
        if (disabled || event.button !== 0) return
        const matrix = event.currentTarget.ownerSVGElement?.getScreenCTM()
        if (!matrix) return
        const inverse = matrix.inverse()
        suppressClick.current = false
        dragRef.current = {
          pointerId: event.pointerId,
          start: new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse),
          origin: { x: box.x, y: box.y },
          current: { x: box.x, y: box.y },
          inverse,
          moved: false,
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => { event.stopPropagation(); updateDrag(event) }}
      onPointerUp={(event) => finishDrag(event)}
      onPointerCancel={(event) => finishDrag(event, true)}
      onLostPointerCapture={() => { dragRef.current = null; setPreview(null) }}
      onClick={(event) => {
        event.stopPropagation()
        if (suppressClick.current) { suppressClick.current = false; return }
        if (!disabled) onOpen(event)
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!disabled) onOpen(event)
      }}
      onKeyDown={(event) => {
        if (disabled) return
        const delta = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key]
        if (delta) {
          event.preventDefault()
          event.stopPropagation()
          const step = event.shiftKey ? 1 : 10
          onMove(moveFlowLabel(box, { x: 0, y: 0 }, { x: delta[0] * step, y: delta[1] * step }))
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          const bounds = event.currentTarget.getBoundingClientRect()
          onOpen({ clientX: bounds.x, clientY: bounds.bottom, stopPropagation: () => event.stopPropagation() })
        }
      }}
    >
      <title>{label}</title>
      <rect height={box.height} rx="4" width={box.width} />
      <text x="8" y="15">
        {lines.map((line, index) => <tspan key={index} x="8" dy={index === 0 ? 0 : 18}>{line}</tspan>)}
      </text>
    </g>
  )
}

