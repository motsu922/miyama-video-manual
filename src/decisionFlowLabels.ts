export type FlowLabelPoint = { x: number; y: number }

export function getFlowLabelKey(connectionKind: string, branchId?: string) {
  return `${connectionKind}:${branchId ?? ''}`
}

export function splitDecisionFlowEdgeLabel(label: string, sourceIndex = 0, sourceCount = 1) {
  const normalized = label.trim()
  if (!normalized) return []
  const characters = Array.from(sourceCount > 2 ? `${sourceIndex + 1}. ${normalized}` : normalized)
  const lines: string[] = []
  for (let index = 0; index < characters.length; index += 16) {
    lines.push(characters.slice(index, index + 16).join(''))
  }
  return lines
}

export function getFlowLabelSize(lines: string[]) {
  return {
    width: Math.max(48, ...lines.map((line) => Array.from(line).length * 12 + 16)),
    height: lines.length * 18 + 4,
  }
}

export function getFlowLabelBox(
  lines: string[],
  geometry: { turnX: number; endX: number; endY: number; goesForward: boolean },
  offset?: FlowLabelPoint,
) {
  const { width, height } = getFlowLabelSize(lines)
  const baseX = geometry.goesForward
    ? Math.max(geometry.turnX + 6, geometry.endX - width - 10)
    : Math.min(geometry.turnX - width - 6, geometry.endX + 10)
  return {
    x: Math.max(8, Math.max(8, baseX) + (Number.isFinite(offset?.x) ? offset!.x : 0)),
    y: Math.max(8, Math.max(8, geometry.endY - height - 5) + (Number.isFinite(offset?.y) ? offset!.y : 0)),
    width,
    height,
  }
}

export function moveFlowLabel(origin: FlowLabelPoint, start: FlowLabelPoint, current: FlowLabelPoint) {
  return {
    x: Math.max(8, Math.round(origin.x + current.x - start.x)),
    y: Math.max(8, Math.round(origin.y + current.y - start.y)),
  }
}

