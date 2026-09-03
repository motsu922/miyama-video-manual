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

export function getFlowCardPort(type: DecisionNodeType, box: { x: number; y: number; width: number; height: number }, side: 'left' | 'right', offset = 0) {
  const dy = Math.max(-box.height / 2, Math.min(box.height / 2, offset))
  const ratio = Math.abs(dy) / (box.height / 2)
  const radius = box.width / 2 * (type === 'question' ? 1 - ratio : type === 'end' ? Math.sqrt(1 - ratio * ratio) : 1)
  return { x: box.x + box.width / 2 + (side === 'right' ? radius : -radius), y: box.y + box.height / 2 + dy }
}

