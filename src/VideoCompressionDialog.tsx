import { Minimize2, UploadCloud, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { VIDEO_SOURCE_MAX_BYTES, videoFileSize } from './videoLibrary'
import './VideoCompressionDialog.css'

export default function VideoCompressionDialog({ file, onClose, onConfirm, onBusyChange }: {
  file: File
  onClose: () => void
  onConfirm: (file: File) => void
  onBusyChange: (busy: boolean) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const controller = useRef<AbortController | null>(null)
  const callbacks = useRef({ onBusyChange })
  callbacks.current = { onBusyChange }
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ percent: 0, attempt: 1 })
  const [result, setResult] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { dialog.current?.showModal(); return () => { if (controller.current) { controller.current.abort(); callbacks.current.onBusyChange(false) } } }, [])
  useEffect(() => {
    if (!result) return
    const url = URL.createObjectURL(result); setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [result])
  async function start() {
    if (controller.current) return
    const abort = new AbortController(); controller.current = abort
    setRunning(true); setError(''); callbacks.current.onBusyChange(true)
    try {
      const { compressVideoFile } = await import('./videoCompression')
      const output = await compressVideoFile(file, abort.signal, setProgress)
      if (output.size >= VIDEO_SOURCE_MAX_BYTES) throw new Error('圧縮後も500MB以上あります。')
      setResult(output)
    } catch (reason) {
      setError(abort.signal.aborted ? '圧縮を中止しました。元の動画は変更されていません。' : `圧縮できませんでした。${reason instanceof Error ? reason.message : '端末の空きメモリや動画形式を確認してください。'}`)
    } finally {
      controller.current = null; setRunning(false); callbacks.current.onBusyChange(false)
    }
  }
  const close = () => { if (running) controller.current?.abort(); else onClose() }
  return <dialog ref={dialog} className="video-compression-dialog" aria-labelledby="video-compression-title" onCancel={event => { event.preventDefault(); close() }}>
    <header><h2 id="video-compression-title">動画を圧縮</h2><button type="button" title={running ? '圧縮を中止' : '閉じる'} aria-label={running ? '圧縮を中止' : '圧縮画面を閉じる'} onClick={close}><X size={20} /></button></header>
    <div className="video-compression-body">
      <h3>{file.name}</h3><dl><dt>元のサイズ</dt><dd>{videoFileSize(file.size)}</dd><dt>上限</dt><dd>500 MB未満</dd>{result && <><dt>圧縮後</dt><dd>{videoFileSize(result.size)}</dd></>}</dl>
      <p>画質・解像度を下げて圧縮します。元ファイルは変更されません。</p>
      {running && <div role="status"><progress max="100" value={progress.percent} /><span>{progress.attempt > 1 ? `サイズ再調整 ${progress.attempt}回目 / ` : ''}圧縮中 {progress.percent}%</span></div>}
      {previewUrl && <video src={previewUrl} controls playsInline aria-label="圧縮後の動画" />}
      {result && <p>映像・音声と、細かい文字や検査箇所の見え方を確認してください。</p>}
      {error && <p className="video-source-error" role="alert">{error}</p>}
    </div>
    <footer><button type="button" onClick={close}><X size={17} />{running ? '圧縮を中止' : 'キャンセル'}</button>{result ? <button type="button" className="primary" onClick={() => onConfirm(result)}><UploadCloud size={17} />この動画をアップロード</button> : <button type="button" className="primary" disabled={running} onClick={() => void start()}><Minimize2 size={17} />圧縮を開始</button>}</footer>
  </dialog>
}
