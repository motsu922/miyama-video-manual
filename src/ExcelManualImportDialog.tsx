import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileSpreadsheet, UploadCloud, X } from 'lucide-react'
import { readExcelManual, buildImportedManual, type ExcelManualDraft } from './excelManualImport'
import { saveManual, uploadManualImage } from './manualRepository'
import type { Manual } from './types'
import './ExcelManualImportDialog.css'

export default function ExcelManualImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (manual: Manual) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [draft, setDraft] = useState<ExcelManualDraft | null>(null)
  const [sheets, setSheets] = useState<string[]>([])
  const [excluded, setExcluded] = useState<string[]>([])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const session = useRef({ id: `M-${crypto.randomUUID()}`, uploaded: new Map<string, string>() })
  const inFlight = useRef(false)
  const previewPhotos = draft?.photos
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => {
    if (!previewPhotos) return
    const previews = new Map(previewPhotos.map((photo) => [photo.id, URL.createObjectURL(photo.file)]))
    setUrls(previews)
    return () => previews.forEach((url) => URL.revokeObjectURL(url))
  }, [previewPhotos])
  useEffect(() => {
    if (!busy) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [busy])

  async function read(file: File) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true); setError(''); setProgress('Excelを読み込み中…')
    setDraft(null); setFile(null); setConfirmed(false)
    try {
      const parsed = await readExcelManual(file)
      session.current = { id: `M-${crypto.randomUUID()}`, uploaded: new Map() }
      setDraft(parsed); setSheets(parsed.sheets); setExcluded([]); setFile(file)
    } catch (error) { setError(error instanceof Error ? error.message : '読み込みに失敗しました。') }
    finally { inFlight.current = false; setBusy(false); setProgress('') }
  }
  const steps = draft?.steps.filter((step) => sheets.includes(step.sheet) && !excluded.includes(step.id)) || []
  const photos = draft?.photos.filter((photo) => sheets.includes(photo.sheet) && steps.some((step) => step.id === photo.stepId)) || []
  const close = () => {
    if (inFlight.current) return
    if (session.current.uploaded.size && !window.confirm('登録が完了していない可能性があります。閉じますか？再試行すると同じ下書きとして保存されます。')) return
    onClose()
  }
  async function register() {
    if (!draft || !file || !confirmed || inFlight.current || !steps.length) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const assets = [{ id: '__source', file }, ...photos]
      for (const [index, asset] of assets.entries()) {
        setProgress(`ファイルを保存中 ${index + 1} / ${assets.length}`)
        if (!session.current.uploaded.has(asset.id)) session.current.uploaded.set(asset.id, await uploadManualImage(session.current.id, asset.file))
      }
      const manual = buildImportedManual({ ...draft, steps, photos }, session.current.id, session.current.uploaded,
        session.current.uploaded.get('__source')!, file.name)
      setProgress('手順書を下書きとして保存中…')
      await saveManual(manual)
      onImported(manual)
    } catch (error) {
      setError(`登録を完了できませんでした。再試行しても手順書は重複しません。${error instanceof Error ? error.message : ''}`)
    } finally { inFlight.current = false; setBusy(false); setProgress('') }
  }
  function field(name: 'title' | 'department' | 'owner' | 'controlNo' | 'productName', label: string) {
    return <label>{label}<input value={draft?.[name] || ''} required={name === 'title'}
      onChange={(event) => { setConfirmed(false); setDraft((current) => current && { ...current, [name]: event.target.value }) }} /></label>
  }

  return createPortal(<dialog ref={dialog} className="excel-import-dialog" aria-labelledby="excel-import-title"
    onCancel={(event) => { event.preventDefault(); close() }}>
    <header><h2 id="excel-import-title"><FileSpreadsheet size={22} />Excel手順書を取り込む</h2>
      <button type="button" aria-label="閉じる" title="閉じる" disabled={busy} onClick={close}><X size={20} /></button></header>
    <div className="excel-import-body"><fieldset disabled={busy}>
      <label>Excelファイル（.xlsx・25MB以内）<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onClick={(event) => { event.currentTarget.value = '' }}
        onChange={(event) => { const selected = event.target.files?.[0]; if (selected) void read(selected) }} /></label>
      {file && <p className="excel-import-filename">{file.name}</p>}
      {draft && <>
        <div className="excel-import-info">{field('title', '手順書名')}{field('department', '部署')}{field('owner', '作成者')}{field('controlNo', '整理No')}{field('productName', '品名')}</div>
        <section><h3>取り込むシート</h3><div className="excel-import-sheets">{draft.sheets.map((sheet) => <label key={sheet}>
          <input type="checkbox" checked={sheets.includes(sheet)} onChange={(event) => { setConfirmed(false); setSheets((current) => event.target.checked ? [...current, sheet] : current.filter((value) => value !== sheet)) }} />{sheet}
        </label>)}</div></section>
        <div className="excel-import-notice">
          <p>新しい下書きとして登録します。既存手順書は変更しません。元Excelも参照用に保存します。</p>
          <p>手順は順番につながる作業カードとチャプターに変換します。条件分岐・動画の開始時刻は取り込み後に設定してください。</p>
          {draft.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
        <section><h3>手順の確認（{steps.length}件）</h3>
          {draft.steps.filter((step) => sheets.includes(step.sheet)).map((step, index) => <details key={step.id} className="excel-import-step" open={index === 0 ? true : undefined}>
            <summary>{index + 1}. {step.title.replace(/\n/g, ' ')}<small>シート {step.sheet}・{step.row}行</small></summary>
            <label className="excel-import-check"><input type="checkbox" checked={!excluded.includes(step.id)} onChange={(event) => {
              setConfirmed(false); setExcluded((current) => event.target.checked ? current.filter((id) => id !== step.id) : [...current, step.id])
            }} />この手順を取り込む</label>
            <label>作業内容<textarea rows={3} value={step.title} onChange={(event) => {
              setConfirmed(false); setDraft({ ...draft, steps: draft.steps.map((item) => item.id === step.id ? { ...item, title: event.target.value } : item) })
            }} /></label>
            <label>確認ポイント・注記<textarea rows={5} value={step.detail} onChange={(event) => {
              setConfirmed(false); setDraft({ ...draft, steps: draft.steps.map((item) => item.id === step.id ? { ...item, detail: event.target.value } : item) })
            }} /></label>
          </details>)}
        </section>
        <section><h3>写真の割り当て（{photos.length}枚を登録）</h3>
          <div className="excel-import-photos">{draft.photos.filter((photo) => sheets.includes(photo.sheet)).map((photo) => <figure key={photo.id}>
            <a href={urls.get(photo.id)} target="_blank" rel="noreferrer" title="元画像を拡大"><img src={urls.get(photo.id)} alt={photo.name} loading="lazy" /></a>
            <figcaption>{photo.name}</figcaption>
            <label>取り込み先<select aria-label={`${photo.name} の取り込み先`} value={steps.some((step) => step.id === photo.stepId) ? photo.stepId : ''} onChange={(event) => {
              setConfirmed(false); setDraft({ ...draft, photos: draft.photos.map((item) => item.id === photo.id ? { ...item, stepId: event.target.value } : item) })
            }}><option value="">取り込まない</option>{steps.map((step, index) => <option key={step.id} value={step.id}>{index + 1}. {step.title}</option>)}</select></label>
          </figure>)}</div>
        </section>
        <label className="excel-import-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />文章・写真の割り当てと、再現されない図形の注意事項を確認しました</label>
      </>}
    </fieldset>
    {error && <p role="alert" className="excel-import-error">{error}</p>}
    <p role="status" className="excel-import-progress">{progress}</p></div>
    <footer><span>{draft ? `${steps.length}手順 / ${photos.length}枚` : ''}</span>
      <button type="button" disabled={busy} onClick={close}>キャンセル</button>
      <button type="button" className="excel-import-save" disabled={busy || !confirmed || !steps.length || !draft?.title.trim() || steps.some((step) => !step.title.trim())} onClick={() => void register()}>
        <UploadCloud size={18} />下書きとして登録</button>
    </footer>
  </dialog>, document.body)
}

