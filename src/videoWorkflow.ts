import type { DecisionNodeMedia, Manual, VideoClip } from './types'

export type VideoTarget = { kind: 'new'; title: string; detail: string } | { kind: 'node'; id: string } | { kind: 'step'; id: number }
export type VideoInsert = { media: DecisionNodeMedia; target: VideoTarget; copyNodeIds?: string[] }
export const videoTime = (seconds: number) => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${(safe % 60).toFixed(1).padStart(4, '0')}`
}
export function validateVideoEdit(edit: VideoClip | NonNullable<DecisionNodeMedia['videoEdit']>) {
  if (![edit.duration, edit.trimStart, edit.trimEnd].every(Number.isFinite) || edit.duration <= 0 || edit.trimStart < 0 || edit.trimEnd > edit.duration + 0.01 || edit.trimEnd - edit.trimStart < 0.09) throw new Error('開始と終了を動画の範囲内で指定してください。')
  if (edit.zoom !== undefined && (!Number.isFinite(edit.zoom) || edit.zoom < 1 || edit.zoom > 3)) throw new Error('拡大率を1〜3倍で指定してください。')
  if (edit.playbackRate !== undefined && ![0.25, 0.5, 0.75, 1, 1.5, 2].includes(edit.playbackRate)) throw new Error('再生速度を選び直してください。')
}

export function insertVideoIntoManual(manual: Manual, request: VideoInsert): Manual {
  if (manual.status !== 'draft') throw new Error('改訂を開始してから動画を追加してください。')
  const { media, target } = request
  if (!media.url || media.kind !== 'video' || !media.videoEdit) throw new Error('動画を選び直してください。')
  validateVideoEdit(media.videoEdit)
  const upsert = (items: DecisionNodeMedia[] = []) => items.some(item => item.id === media.id)
    ? items.map(item => item.id === media.id ? media : item) : [...items, media]
  let steps = manual.steps
  let nodes = manual.decisionNodes ?? []
  let start = manual.decisionStartNodeId
  if (target.kind === 'new') {
    if (!target.title.trim()) throw new Error('手順名を入力してください。')
    const stepId = Math.max(0, ...steps.map(step => step.id)) + 1
    const nodeId = `video-step-${media.id}`
    if (nodes.some(node => node.id === nodeId)) return manual
    steps = [...steps, { id: stepId, time: '00:00', title: target.title.trim(), detail: target.detail.trim(), videos: [media] }]
    nodes = [...nodes, { id: nodeId, type: 'action', title: target.title.trim(), detail: target.detail.trim(), sourceStepId: stepId, media: [media], flowPosition: { x: 38, y: Math.max(0, ...nodes.map(node => node.flowPosition?.y ?? 0)) + 180 } }]
    start ||= nodeId
  } else if (target.kind === 'step') {
    if (!steps.some(step => step.id === target.id)) throw new Error('挿入先の手順が見つかりません。選び直してください。')
    steps = steps.map(step => step.id === target.id ? { ...step, videos: upsert(step.videos) } : step)
    nodes = nodes.map(node => node.sourceStepId === target.id ? { ...node, media: upsert(node.media) } : node)
  } else {
    const node = nodes.find(node => node.id === target.id)
    if (!node) throw new Error('挿入先のカードが見つかりません。選び直してください。')
    const ids = new Set([target.id, ...(request.copyNodeIds ?? [])])
    nodes = nodes.map(node => ids.has(node.id) ? { ...node, media: upsert(node.media) } : node)
    const linked = new Set(nodes.filter(node => ids.has(node.id)).map(node => node.sourceStepId))
    steps = steps.map(step => linked.has(step.id) ? { ...step, videos: upsert(step.videos) } : step)
  }
  return { ...manual, steps, decisionNodes: nodes, ...(start ? { decisionStartNodeId: start } : {}), updatedAt: new Date().toISOString().slice(0, 10) }
}
