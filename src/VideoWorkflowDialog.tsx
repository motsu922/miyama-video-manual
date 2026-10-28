import { ArrowLeft, ArrowRight, Check, Film, Save, Scissors, UploadCloud, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DecisionNodeMedia, Manual } from './types'
import { uploadManualVideo } from './manualRepository'
import StepVideoPlayer from './StepVideoPlayer'
import { validateVideoEdit, videoTime, type VideoInsert, type VideoTarget } from './videoWorkflow'
import './VideoWorkflowDialog.css'

type Edit = NonNullable<DecisionNodeMedia['videoEdit']>
export type VideoWorkflowRequest = { target?: VideoTarget; media?: DecisionNodeMedia }

export default function VideoWorkflowDialog({ manual, request, onClose, onInsert }: {
  manual: Manual
  request: VideoWorkflowRequest
  onClose: () => void
  onInsert: (insert: VideoInsert) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const sourceVideo = useRef<HTMLVideoElement>(null)
  const [stage, setStage] = useState(request.media ? 1 : 0)
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState(request.media?.url ?? '')
  const [name, setName] = useState(request.media?.name ?? '')
  const [edit, setEdit] = useState<Edit | null>(request.media?.videoEdit ?? null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadedUrl, setUploadedUrl] = useState('')
  const [target, setTarget] = useState<VideoTarget>(request.target ?? { kind: 'new', title: '', detail: '' })
  const [mediaId] = useState(() => request.media?.id ?? crypto.randomUUID())
  const heading = useRef<HTMLHeadingElement>(null)
  const steps = ['動画を選ぶ', '切り取る', '編集する', '手順に挿入']
  const sources = useMemo(() => {
    const clips: DecisionNodeMedia[] = (manual.videoClips ?? []).map(clip => ({ id: clip.id, kind: 'video', name: clip.name, url: clip.url, uploadedAt: '', videoEdit: clip }))
    if (manual.videoUrl && !clips.some(clip => clip.url === manual.videoUrl)) clips.push({ id: 'main', kind: 'video', name: 'マニュアルの動画', url: manual.videoUrl, uploadedAt: '' })
    const all = [...clips, ...(manual.decisionNodes ?? []).flatMap(node => node.media ?? []), ...manual.steps.flatMap(step => step.videos ?? [])].filter(media => media.kind === 'video')
    return all.filter((media, index) => all.findIndex(item => item.url === media.url) === index)
  }, [manual])
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => { heading.current?.focus() }, [stage])
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  useEffect(() => {
    if (!source || ready) return
    const timer = window.setTimeout(() => setError('動画の読み込みに時間がかかっています。接続を確認するか、別の動画を選んでください。'), 30000)
    return () => window.clearTimeout(timer)
  }, [source, ready])

  function chooseFile(next?: File) {
    if (!next) return
    if (!next.type.startsWith('video/')) { setError('動画ファイルを選んでください。'); return }
    if (next.size > 500 * 1024 * 1024) { setError('500MB以下の動画を選んでください。'); return }
    setSource(''); setReady(false); setEdit(null); setError(''); setUploadedUrl('')
    setFile(next); setName(next.name)
  }
  function chooseSource(media: DecisionNodeMedia) {
    setFile(null); setReady(false); setEdit(null); setError(''); setUploadedUrl('')
    setSource(media.url); setName(media.name)
  }
  function patch(values: Partial<Edit>) { setEdit(current => current ? { ...current, ...values } : current); setError('') }
  const close = () => { if (!saving && (!source || window.confirm('動画の編集を閉じますか？未保存の設定は破棄されます。'))) onClose() }
  let validation = ''
  try { if (edit) validateVideoEdit(edit); else validation = '動画を選んでください。' } catch (reason) { validation = (reason as Error).message }
  const media: DecisionNodeMedia = { id: mediaId, kind: 'video', name, url: source, uploadedAt: request.media?.uploadedAt ?? new Date().toISOString(), ...(edit ? { videoEdit: edit } : {}) }

  async function save() {
    if (saving || !edit || validation) return
    if (target.kind === 'new' && !target.title.trim()) { setError('作業名を入力してください。'); return }
    setSaving(true); setError('')
    try {
      let url = uploadedUrl || source
      if (file && !uploadedUrl) {
        url = await uploadManualVideo(manual.id, file, setProgress)
        setUploadedUrl(url)
      }
      await onInsert({ media: { ...media, url }, target })
      onClose()
    } catch (reason) {
      setError(`保存できませんでした。${reason instanceof Error ? reason.message : '接続を確認して再試行してください。'}`)
    } finally { setSaving(false) }
  }

  return <dialog className="video-workflow" ref={dialog} aria-labelledby="video-workflow-title" onCancel={event => { event.preventDefault(); close() }}>
    <header className="vw-header"><h2 id="video-workflow-title">動画を手順に追加</h2><a href="?guide=1#guide-video-howto" target="_blank" rel="noreferrer">操作マニュアル</a><button type="button" aria-label="動画編集を閉じる" title="閉じる" disabled={saving} onClick={close}><X size={22} /></button></header>
    <ol className="vw-stages">{steps.map((label, index) => <li key={label} aria-current={index === stage ? 'step' : undefined} className={index <= stage ? 'active' : ''}><span>{index < stage ? <Check size={16} /> : index + 1}</span>{label}</li>)}</ol>
    <div className="vw-body" inert={saving}>
      <h3 ref={heading} tabIndex={-1}>{stage + 1}. {steps[stage]}</h3>
      {stage === 0 && <div className="vw-source-select">
        <label className="vw-drop" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); chooseFile(event.dataTransfer.files[0]) }}><UploadCloud size={30} /><strong>動画ファイルを選ぶ</strong><span>または、ここにドロップ（500MBまで）</span><input aria-label="動画ファイル" type="file" accept="video/*" onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = '' }} /></label>
        {sources.length > 0 && <label>登録済みの動画<select aria-label="登録済みの動画" value={file ? '' : source} onChange={event => { const chosen = sources.find(item => item.url === event.target.value); if (chosen) chooseSource(chosen) }}><option value="">選択してください</option>{sources.map(item => <option key={item.url} value={item.url}>{item.name}</option>)}</select></label>}
      </div>}
      {source && stage < 2 && <div className="vw-source-preview">
        <video key={source} ref={sourceVideo} src={source} controls playsInline preload="metadata" aria-label="切り取り元の動画" onLoadedMetadata={event => {
          const duration = event.currentTarget.duration
          if (!Number.isFinite(duration) || duration < .1) { setError('動画の長さを取得できません。MP4など別の形式を選んでください。'); return }
          setEdit(current => current ? { ...current, duration, trimEnd: Math.min(current.trimEnd, duration) } : { duration, trimStart: 0, trimEnd: duration, zoom: 1, focusX: 50, focusY: 50, playbackRate: 1, spotlight: false, caption: '', captionPosition: 'bottom' })
          setReady(true); setError('')
        }} onError={() => { setReady(false); setError('動画を読み込めません。MP4など再生できる形式で選び直してください。') }} />
        <p><Film size={16} /><span>{name}</span><strong>{edit ? videoTime(edit.duration) : '読み込み中…'}</strong></p>
      </div>}
      {edit && stage === 1 && <div className="vw-trim">
        {(['trimStart', 'trimEnd'] as const).map(field => <div className="vw-trim-row" key={field}>
          <label>{field === 'trimStart' ? '開始（秒）' : '終了（秒）'}<input aria-label={field === 'trimStart' ? '開始秒' : '終了秒'} type="number" min="0" max={edit.duration} step="0.1" value={Number(edit[field].toFixed(2))} onChange={event => patch({ [field]: Number(event.target.value) })} /></label>
          <input aria-label={field === 'trimStart' ? '開始位置' : '終了位置'} type="range" min="0" max={edit.duration} step="0.01" value={edit[field]} onChange={event => { patch({ [field]: Number(event.target.value) }); if (sourceVideo.current) sourceVideo.current.currentTime = Number(event.target.value) }} />
          <button type="button" onClick={() => patch({ [field]: sourceVideo.current?.currentTime ?? 0 })}><Scissors size={16} />ここを{field === 'trimStart' ? '開始' : '終了'}</button>
        </div>)}
        <div className="vw-range-summary"><strong>選択範囲 {videoTime(edit.trimStart)} ～ {videoTime(edit.trimEnd)}</strong><span>{videoTime(edit.trimEnd - edit.trimStart)}</span><button type="button" onClick={() => patch({ trimStart: 0, trimEnd: edit.duration })}>全範囲に戻す</button></div>
        {validation && <p role="alert" className="vw-error">{validation}</p>}
      </div>}
      {edit && stage >= 2 && <div className={`vw-edit-layout ${stage === 3 ? 'vw-confirm-layout' : ''}`}>
        <div className="vw-preview"><StepVideoPlayer key={`${stage}:${edit.trimStart}:${edit.trimEnd}`} media={media} /><p>{name} / {videoTime((edit.trimEnd - edit.trimStart) / (edit.playbackRate || 1))}</p></div>
        {stage === 2 ? <div className="vw-effects">
          <label>再生速度<select aria-label="再生速度" value={edit.playbackRate ?? 1} onChange={event => patch({ playbackRate: Number(event.target.value) })}><option value="1">標準（1倍）</option><option value="0.75">ゆっくり（0.75倍）</option><option value="0.5">スロー（0.5倍）</option><option value="0.25">スロー（0.25倍）</option><option value="1.5">速く（1.5倍）</option><option value="2">速く（2倍）</option></select></label>
          <label>拡大 {edit.zoom ?? 1}倍<input aria-label="拡大率" type="range" min="1" max="3" step="0.1" value={edit.zoom ?? 1} onChange={event => patch({ zoom: Number(event.target.value) })} /></label>
          <label className="vw-checkbox"><input type="checkbox" checked={edit.spotlight ?? false} onChange={event => patch({ spotlight: event.target.checked })} />スポットを当てる</label>
          {((edit.zoom ?? 1) > 1 || edit.spotlight) && <><label>注目位置・左右<input aria-label="注目位置・左右" type="range" min="0" max="100" value={edit.focusX ?? 50} onChange={event => patch({ focusX: Number(event.target.value) })} /></label><label>注目位置・上下<input aria-label="注目位置・上下" type="range" min="0" max="100" value={edit.focusY ?? 50} onChange={event => patch({ focusY: Number(event.target.value) })} /></label></>}
          <label>挿入する文字<textarea rows={2} maxLength={160} value={edit.caption ?? ''} onChange={event => patch({ caption: event.target.value })} /></label>
          <label>文字の位置<select aria-label="文字の位置" value={edit.captionPosition ?? 'bottom'} onChange={event => patch({ captionPosition: event.target.value as Edit['captionPosition'] })}><option value="top">上</option><option value="center">中央</option><option value="bottom">下</option></select></label>
          <button type="button" onClick={() => patch({ zoom: 1, focusX: 50, focusY: 50, playbackRate: 1, spotlight: false, caption: '', captionPosition: 'bottom' })}>編集効果をリセット</button>
        </div> : <div className="vw-target">
          <label>挿入先<select aria-label="挿入先" disabled={Boolean(request.media)} value={target.kind === 'new' ? 'new' : `${target.kind}:${target.id}`} onChange={event => {
            const [kind, ...id] = event.target.value.split(':')
            setTarget(kind === 'new' ? { kind: 'new', title: '', detail: '' } : kind === 'step' ? { kind: 'step', id: Number(id.join(':')) } : { kind: 'node', id: id.join(':') })
          }}><option value="new">新しい手順を作成</option><optgroup label="フローチャートのカード">{(manual.decisionNodes ?? []).map(node => <option key={node.id} value={`node:${node.id}`}>{node.title || '名称未設定'}</option>)}</optgroup><optgroup label="チャプター手順">{manual.steps.map(step => <option key={step.id} value={`step:${step.id}`}>{step.title || '名称未設定'}</option>)}</optgroup></select></label>
          {target.kind === 'new' && <><label>作業名<input maxLength={200} value={target.title} onChange={event => setTarget({ ...target, title: event.target.value })} /></label><label>作業指示<textarea rows={4} value={target.detail} onChange={event => setTarget({ ...target, detail: event.target.value })} /></label></>}
          <dl><dt>使用範囲</dt><dd>{videoTime(edit.trimStart)} ～ {videoTime(edit.trimEnd)}</dd><dt>再生速度</dt><dd>{edit.playbackRate ?? 1}倍</dd><dt>保存先</dt><dd>{manual.title}</dd></dl>
        </div>}
      </div>}
      {error && <p role="alert" className="vw-error">{error}</p>}
      {saving && <div className="vw-progress" role="status"><progress max="100" value={progress} /><span>{file && !uploadedUrl ? `アップロード中 ${progress}%` : '手順を保存中…'}</span></div>}
    </div>
    <footer className="vw-footer"><button type="button" disabled={saving} onClick={stage ? () => { sourceVideo.current?.pause(); setStage(stage - 1); setError('') } : close}><ArrowLeft size={18} />{stage ? '戻る' : 'キャンセル'}</button>
      {stage < 3 ? <button className="vw-primary" type="button" disabled={!ready || Boolean(validation)} onClick={() => { sourceVideo.current?.pause(); setStage(stage + 1); setError('') }}>{steps[stage + 1]}<ArrowRight size={18} /></button> : <button className="vw-primary" type="button" disabled={saving || Boolean(validation) || (target.kind === 'new' && !target.title.trim())} onClick={() => void save()}><Save size={18} />{saving ? '保存中…' : request.media ? '編集を保存' : '手順に挿入して保存'}</button>}
    </footer>
  </dialog>
}
