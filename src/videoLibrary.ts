import type { DecisionNodeMedia, Manual, VideoSource } from './types'
import type { VideoTarget } from './videoWorkflow'

export const VIDEO_SOURCE_MAX_BYTES = 500 * 1024 * 1024
export const videoFileSize = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

export function getVideoSources(manual: Manual): VideoSource[] {
  const clips = (manual.videoClips ?? []).map(clip => ({ id: clip.id, name: clip.name, url: clip.url, duration: clip.duration, uploadedAt: '' }))
  const media = [...manual.steps.flatMap(step => step.videos ?? []), ...(manual.decisionNodes ?? []).flatMap(node => node.media ?? [])]
    .filter(item => item.kind === 'video')
    .map(item => ({ id: item.id, name: item.name, url: item.url, uploadedAt: item.uploadedAt, duration: item.videoEdit?.duration }))
  const sources = [...(manual.videoSources ?? []), ...clips, ...(manual.videoUrl ? [{ id: 'legacy-main', name: '全体動画', url: manual.videoUrl, uploadedAt: '', thumbnail: manual.thumbnail }] : []), ...media]
  // Older manuals keep their playback and edit settings; only original URLs become library items.
  return sources.filter((source, index) => source.url && !manual.removedVideoSourceUrls?.includes(source.url) && sources.findIndex(item => item.url === source.url) === index)
}

export function appendVideoSource(manual: Manual, source: VideoSource): Manual {
  if (manual.status !== 'draft') throw new Error('改訂を開始してから動画素材を追加してください。')
  if (!source.id || !source.url) throw new Error('動画素材を読み込めません。')
  const sources = manual.videoSources ?? []
  return { ...manual, videoSources: sources.some(item => item.id === source.id) ? sources.map(item => item.id === source.id ? source : item) : [...sources, source], removedVideoSourceUrls: (manual.removedVideoSourceUrls ?? []).filter(url => url !== source.url), updatedAt: new Date().toISOString().slice(0, 10) }
}

export function removeVideoSource(manual: Manual, source: VideoSource): Manual {
  if (manual.status !== 'draft') throw new Error('改訂を開始してから動画素材を削除してください。')
  if (!source.url) throw new Error('削除する素材が見つかりません。')
  // Keep shared files and inserted media intact; prevent legacy sources reappearing after reload.
  return { ...manual, videoSources: (manual.videoSources ?? []).filter(item => item.url !== source.url), removedVideoSourceUrls: [...new Set([...(manual.removedVideoSourceUrls ?? []), source.url])], updatedAt: new Date().toISOString().slice(0, 10) }
}

export function getVideoUses(manual: Manual, source: VideoSource) {
  const uses: { key: string; label: string; target: VideoTarget; media: DecisionNodeMedia }[] = []
  for (const step of manual.steps) for (const media of step.videos ?? []) {
    if (media.url === source.url) uses.push({ key: `step:${step.id}:${media.id}`, label: `手順: ${step.title} / ${media.name}`, target: { kind: 'step', id: step.id }, media })
  }
  for (const node of manual.decisionNodes ?? []) for (const media of node.media ?? []) {
    if (media.kind !== 'video' || media.url !== source.url) continue
    if (uses.some(use => use.target.kind === 'step' && use.target.id === node.sourceStepId && use.media.id === media.id)) continue
    uses.push({ key: `node:${node.id}:${media.id}`, label: `カード: ${node.title} / ${media.name}`, target: { kind: 'node', id: node.id }, media })
  }
  return uses
}

export function validateVideoSourceFile(file: Pick<File, 'type' | 'size'>) {
  if (!file.type.startsWith('video/')) throw new Error('動画ファイルを選んでください。')
  if (file.size >= VIDEO_SOURCE_MAX_BYTES) throw new Error('500MB未満に圧縮してからアップロードしてください。')
}

export function inspectVideoSource(file: File): Promise<Pick<VideoSource, 'duration' | 'thumbnail'>> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    const cleanup = () => { clearTimeout(timer); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url) }
    const fail = () => { cleanup(); reject(new Error('動画を読み込めません。再生できるMP4などを選んでください。')) }
    const timer = window.setTimeout(fail, 30000)
    video.preload = 'auto'; video.muted = true; video.playsInline = true
    video.onerror = fail
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration < .1) { fail(); return }
      video.currentTime = Math.min(.1, video.duration / 2)
    }
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = Math.min(320, video.videoWidth)
        canvas.height = Math.max(1, Math.round(video.videoHeight * canvas.width / video.videoWidth))
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
        const result = { duration: video.duration, thumbnail: canvas.toDataURL('image/jpeg', .7) }
        cleanup(); resolve(result)
      } catch { fail() }
    }
    video.src = url
  })
}
