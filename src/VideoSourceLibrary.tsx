import { Film, Minimize2, RefreshCw, Scissors, Trash2, UploadCloud } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Manual, VideoSource } from './types'
import type { VideoWorkflowRequest } from './VideoWorkflowDialog'
import { uploadManualImage, uploadManualVideo } from './manualRepository'
import { getVideoSources, getVideoUses, inspectVideoSource, validateVideoSourceFile, VIDEO_SOURCE_MAX_BYTES, videoFileSize } from './videoLibrary'
import VideoCompressionDialog from './VideoCompressionDialog'
import { videoTime } from './videoWorkflow'
import './VideoSourceLibrary.css'

type UploadJob = { id: string; file: File; uploadFile?: File; state: 'queued' | 'uploading' | 'saving' | 'done' | 'error' | 'compress'; progress: number; error?: string; source?: VideoSource }

export default function VideoSourceLibrary({ manual, disabled, onRegister, onRemove, onEdit, onBusyChange }: {
  manual: Manual
  disabled: boolean
  onRegister: (manualId: string, source: VideoSource) => Promise<void>
  onRemove: (manualId: string, source: VideoSource) => Promise<void>
  onEdit: (request: VideoWorkflowRequest) => void
  onBusyChange: (busy: boolean) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const preview = useRef<HTMLVideoElement>(null)
  const processing = useRef(false)
  const alive = useRef(true)
  const callbacks = useRef({ onRegister, onBusyChange })
  callbacks.current = { onRegister, onBusyChange }
  const sources = useMemo(() => getVideoSources(manual), [manual])
  const [selectedUrl, setSelectedUrl] = useState('')
  const [useKey, setUseKey] = useState('new')
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [busy, setBusy] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [compressionJob, setCompressionJob] = useState<UploadJob | null>(null)
  const selected = sources.find(source => source.url === selectedUrl)
  const uses = selected ? getVideoUses(manual, selected) : []
  const use = uses.find(item => item.key === useKey)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const patchJob = (id: string, patch: Partial<UploadJob>) => {
    if (alive.current) setJobs(current => current.map(job => job.id === id ? { ...job, ...patch } : job))
  }
  async function process(batch: UploadJob[]) {
    if (disabled || processing.current) return
    processing.current = true; setBusy(true); callbacks.current.onBusyChange(true)
    try {
      for (const job of batch) {
        try {
          const file = job.uploadFile ?? job.file
          if (file.type.startsWith('video/') && file.size >= VIDEO_SOURCE_MAX_BYTES) {
            patchJob(job.id, { state: 'compress' }); continue
          }
          validateVideoSourceFile(file)
          let source = job.source
          if (!source) {
            patchJob(job.id, { state: 'uploading', error: undefined, progress: 0 })
            const metadata = await inspectVideoSource(file)
            const url = await uploadManualVideo(manual.id, file, progress => patchJob(job.id, { progress }))
            source = { id: job.id, name: file.name, url, uploadedAt: new Date().toISOString(), duration: metadata.duration }
            if (metadata.thumbnail) {
              try {
                const blob = await (await fetch(metadata.thumbnail)).blob()
                source.thumbnail = await uploadManualImage(manual.id, new File([blob], `${job.id}-thumbnail.jpg`, { type: 'image/jpeg' }))
              } catch { /* The video remains usable when its optional thumbnail cannot be saved. */ }
            }
          }
          // Keep uploaded URLs for save retries; successful files in a batch are never discarded.
          patchJob(job.id, { source, state: 'saving', error: undefined, progress: 100 })
          await callbacks.current.onRegister(manual.id, source)
          patchJob(job.id, { state: 'done' })
        } catch (reason) {
          patchJob(job.id, { state: 'error', error: reason instanceof Error ? reason.message : 'アップロードに失敗しました。' })
        }
      }
    } finally {
      processing.current = false; callbacks.current.onBusyChange(false)
      if (alive.current) setBusy(false)
    }
  }
  function upload(files: File[]) {
    if (!files.length || disabled || processing.current) return
    const batch: UploadJob[] = files.map(file => ({ id: crypto.randomUUID(), file, state: 'queued', progress: 0 }))
    setJobs(current => [...current.filter(job => job.state !== 'done'), ...batch])
    void process(batch)
  }
  function select(source: VideoSource) {
    preview.current?.pause(); setSelectedUrl(source.url); setUseKey('new'); setPreviewError('')
  }
  async function remove(source: VideoSource) {
    if (disabled || processing.current) return
    const used = getVideoUses(manual, source).length > 0 || manual.videoUrl === source.url || manual.videoClips?.some(clip => clip.url === source.url)
    if (!window.confirm(`「${source.name}」を素材一覧から削除しますか？\n${used ? 'この動画は使用中です。挿入済みの手順・カード・全体動画は残ります。\n' : ''}他の手順書を保護するため、動画ファイルそのものは削除しません。`)) return
    processing.current = true; setBusy(true); setDeleteError(''); callbacks.current.onBusyChange(true)
    if (selectedUrl === source.url) preview.current?.pause()
    try {
      await onRemove(manual.id, source)
      if (selectedUrl === source.url) { setSelectedUrl(''); setUseKey('new'); setPreviewError('') }
      setJobs(current => current.filter(job => job.source?.url !== source.url))
    } catch (reason) {
      setDeleteError(`削除できませんでした。${reason instanceof Error ? reason.message : '接続を確認して再試行してください。'}`)
    } finally {
      processing.current = false; callbacks.current.onBusyChange(false)
      if (alive.current) setBusy(false)
    }
  }
  return <section className="video-source-library" aria-labelledby="video-sources-title">
    <header className="video-source-header"><h2 id="video-sources-title">動画素材 <small>{sources.length} 本</small></h2><button type="button" disabled={disabled || busy} onClick={() => input.current?.click()}><UploadCloud size={18} />動画をアップロード</button></header>
    <input ref={input} type="file" aria-label="動画素材ファイル" accept="video/*" multiple hidden disabled={disabled || busy} onChange={event => { upload(Array.from(event.target.files ?? [])); event.target.value = '' }} />
    <div className="video-source-grid" aria-label="素材一覧" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); upload(Array.from(event.dataTransfer.files)) }}>
      {sources.map(source => <div className="video-source-entry" key={source.url}><button className="video-source-item" type="button" aria-pressed={selected?.url === source.url} aria-label={`素材を選択: ${source.name}`} onClick={() => select(source)}>
        <span className="video-source-thumb">{source.thumbnail ? <img src={source.thumbnail} alt="" /> : <Film size={30} />}<small>{source.duration ? videoTime(source.duration) : '動画'}</small></span><strong>{source.name}</strong>
      </button><button className="video-source-delete" type="button" disabled={disabled || busy} aria-label={`素材を削除: ${source.name}`} title="素材一覧から削除" onClick={() => void remove(source)}><Trash2 size={17} /></button></div>)}
      {!sources.length && <p className="video-source-empty">動画素材は未登録です</p>}
    </div>
    {deleteError && <p className="video-source-error" role="alert">{deleteError}</p>}
    {jobs.length > 0 && <ul className="video-source-queue" aria-label="アップロード状況" aria-live="polite">{jobs.map(job => <li key={job.id}><span>{job.file.name}</span><small>{job.state === 'done' ? '登録済み' : job.state === 'saving' ? '保存中' : job.state === 'queued' ? '待機中' : job.state === 'error' ? job.error : job.state === 'compress' ? `${videoFileSize(job.file.size)} / 圧縮が必要です` : `アップロード中 ${job.progress}%`}</small>{job.state === 'uploading' && <progress max="100" value={job.progress} />}{job.state === 'error' && <button type="button" disabled={disabled || busy} aria-label={`${job.file.name}を再試行`} onClick={() => void process([job])}><RefreshCw size={15} />再試行</button>}{job.state === 'compress' && <button type="button" disabled={disabled || busy} aria-label={`${job.file.name}を圧縮`} onClick={() => setCompressionJob(job)}><Minimize2 size={15} />圧縮</button>}</li>)}</ul>}
    {selected && <div className="video-source-selection">
      <h3>{selected.name}</h3>
      <video ref={preview} key={selected.url} src={selected.url} poster={selected.thumbnail} controls playsInline preload="metadata" aria-label="選択した動画素材" onError={() => setPreviewError('プレビューを読み込めません。接続や動画形式を確認してください。')} />
      {previewError && <p role="alert">{previewError}</p>}
      <div className="video-source-actions">
        <label>編集対象<select aria-label="編集対象" value={use ? useKey : 'new'} disabled={disabled || busy} onChange={event => setUseKey(event.target.value)}><option value="new">新しく手順に挿入</option>{uses.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <button type="button" disabled={disabled || busy} onClick={() => { preview.current?.pause(); onEdit({ source: selected, ...(use ? { target: use.target, media: use.media } : {}) }) }}><Scissors size={18} />選択した素材を編集</button>
      </div>
    </div>}
    {compressionJob && <VideoCompressionDialog file={compressionJob.file} onBusyChange={onBusyChange} onClose={() => setCompressionJob(null)} onConfirm={file => {
      const job = { ...compressionJob, uploadFile: file, state: 'queued' as const }
      patchJob(job.id, { uploadFile: file, state: 'queued' }); setCompressionJob(null); void process([job])
    }} />}
  </section>
}
