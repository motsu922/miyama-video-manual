import type { DecisionNodeType } from './types'

export function getFlowCardLayout(title: string, type: DecisionNodeType) {
  const lines = (title.trim() || '名称未設定').split(/\r?\n/).flatMap((paragraph) => {
    const characters = Array.from(paragraph)
    if (!characters.length) return ['']
    const result: string[] = []
    for (let i = 0; i < characters.length; i += 12) result.push(characters.slice(i, i + 12).join(''))
    return result
  })
  const textHeight = 32 + lines.length * 18
  if (type === 'question') return { lines, width: 210, height: Math.max(110, 50 + lines.length * 18), textX: 13 }
  if (type === 'end') return { lines, width: 250, height: Math.max(110, Math.ceil(textHeight * 1.5 + 30)), textX: 47 }
  return { lines, width: 210, height: Math.max(94, 50 + lines.length * 18), textX: 13 }
}

export function getFlowCardTextLayout(layout: ReturnType<typeof getFlowCardLayout>, type: DecisionNodeType) {
  const { width, height, lines, textX } = layout
  if (type === 'question') {
    const titleY = height / 2 - (lines.length - 1) * 9
    return {
      kindX: width / 2, kindY: titleY - 20,
      titleX: width / 2, titleY,
      anchor: 'middle' as const, baseline: 'central' as const,
      markX: width - 52, markY: 4, markHeight: 20,
    }
  }
  const kindY = type === 'action' ? 21 : (height - (32 + lines.length * 18)) / 2 + 12
  return {
    kindX: textX, kindY, titleX: textX, titleY: kindY + 27,
    anchor: 'start' as const, baseline: 'auto' as const,
    markX: textX + (type === 'action' ? 184 : 156) - 42,
    markY: kindY - 16, markHeight: 24,
  }
}

// Expand only the space needed by larger shapes; keep the order of existing rows and columns.
export function expandFlowCardPositions<T extends { x: number; y: number; width: number; height: number }>(items: T[]): T[] {
  let result = items.map((item) => ({ ...item }))
  for (const [axis, size, baseline] of [['x', 'width', 210], ['y', 'height', 94]] as const) {
    const coordinates = [...new Set(items.map((item) => item[axis]))].sort((a, b) => a - b)
    let extra = 0
    const positions = new Map<number, number>()
    for (const value of coordinates) {
      for (const item of items) {
        if (item[axis] + baseline > value) continue
        const prior = positions.get(item[axis]) ?? item[axis]
        const gap = Math.min(24, value - item[axis] - baseline)
        extra = Math.max(extra, prior + item[size] + gap - value)
      }
      positions.set(value, value + extra)
    }
    result = result.map((item) => ({ ...item, [axis]: positions.get(item[axis]) ?? item[axis] }))
  }
  return result
}

export function getFlowCardCornerRadius(width: number, height: number) {
  return Math.min(20, width / 2, height / 2)
}

export function getFlowCardPort(type: DecisionNodeType, box: { x: number; y: number; width: number; height: number }, side: 'left' | 'right', offset = 0) {
  const dy = Math.max(-box.height / 2, Math.min(box.height / 2, offset))
  const ratio = Math.abs(dy) / (box.height / 2)
  let radius = box.width / 2
  if (type === 'question') radius *= 1 - ratio
  else if (type === 'end') {
    const corner = getFlowCardCornerRadius(box.width, box.height)
    const cornerOffset = Math.max(0, Math.abs(dy) - (box.height / 2 - corner))
    radius -= corner - Math.sqrt(Math.max(0, corner * corner - cornerOffset * cornerOffset))
  }
  return { x: box.x + box.width / 2 + (side === 'right' ? radius : -radius), y: box.y + box.height / 2 + dy }
}

