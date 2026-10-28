import { Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { DecisionNodeMedia } from './types'
import { videoTime } from './videoWorkflow'
import './StepVideoPlayer.css'

export default function StepVideoPlayer({ media }: { media: DecisionNodeMedia }) {
  const video = useRef<HTMLVideoElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const edit = media.videoEdit
  const start = edit?.trimStart ?? 0
  const end = edit?.trimEnd || duration
  useEffect(() => {
    const element = video.current
    if (!element) return
    element.playbackRate = edit?.playbackRate ?? 1
    if (element.readyState > 0 && (element.currentTime < start || element.currentTime >= end)) element.currentTime = start
  }, [edit?.playbackRate, start, end])
  const togglePlay = async () => {
    const element = video.current
    if (!element) return
    if (!element.paused) { element.pause(); return }
    if (element.currentTime >= end - 0.04 || element.currentTime < start) element.currentTime = start
    try { await element.play(); setError('') } catch { setError('再生できません。動画の形式と接続を確認してください。') }
  }
  return <div className="step-video-player" ref={container}>
    <div className="step-video-picture">
      <video ref={video} src={media.url} muted={muted} playsInline preload="metadata" aria-label={media.name}
        style={{ transform: `scale(${edit?.zoom ?? 1})`, transformOrigin: `${edit?.focusX ?? 50}% ${edit?.focusY ?? 50}%` }}
        onLoadedMetadata={event => {
          const element = event.currentTarget
          setDuration(element.duration); element.playbackRate = edit?.playbackRate ?? 1
          element.currentTime = start; setTime(start)
        }} onTimeUpdate={event => {
          const element = event.currentTarget
          if (end > start && element.currentTime >= end) { element.pause(); if (element.currentTime > end + 0.02) element.currentTime = end }
          setTime(element.currentTime)
        }} onSeeking={event => {
          const element = event.currentTarget
          if (element.currentTime < start) element.currentTime = start
          if (end > start && element.currentTime > end + 0.02) element.currentTime = end
        }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onError={() => setError('動画を読み込めません。接続・形式を確認してください。')} />
      {edit?.spotlight && <div className="step-video-spotlight" style={{ background: `radial-gradient(circle at ${edit.focusX ?? 50}% ${edit.focusY ?? 50}%, transparent 0 16%, rgba(0,0,0,.65) 35%)` }} />}
      {edit?.caption && <div className={`step-video-caption ${edit.captionPosition ?? 'bottom'}`}>{edit.caption}</div>}
    </div>
    <div className="step-video-controls">
      <button type="button" aria-label={playing ? '動画を一時停止' : '動画を再生'} title={playing ? '一時停止' : '再生'} onClick={() => void togglePlay()}><span>{playing ? <Pause size={18} /> : <Play size={18} />}</span></button>
      <input aria-label="動画の再生位置" type="range" min={start} max={end || start + 1} step="0.01" value={Math.max(start, Math.min(time, end || start))} disabled={!duration || Boolean(error)} onChange={event => { if (video.current) video.current.currentTime = Number(event.target.value) }} />
      <output>{videoTime(time - start)} / {videoTime(end - start)}</output>
      <button type="button" title={muted ? '音声をオン' : '消音'} aria-label={muted ? '音声をオン' : '消音'} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
      <button type="button" title="全画面表示" aria-label="動画を全画面表示" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else if (container.current?.requestFullscreen) void container.current.requestFullscreen().catch(() => setError('このブラウザでは全画面表示できません。')); else setError('このブラウザでは全画面表示できません。') }}><Maximize2 size={18} /></button>
    </div>
    {error && <p className="step-video-error" role="alert">{error}</p>}
  </div>
}
