import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Clock3,
  Eye,
  FileVideo,
  Library,
  Languages,
  ListChecks,
  LockKeyhole,
  PlayCircle,
  Plus,
  Save,
  Search,
  Send,
  ShieldCheck,
  RotateCcw,
  Scissors,
  Sparkles,
  UploadCloud,
  Users,
  Trash2,
} from 'lucide-react'
import {
  type ChangeEvent,
  type PointerEvent,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import './App.css'
import miyamaLogo from './assets/miyama-logo.png'
import { isFirebaseConfigured } from './firebase'
import {
  deleteManual,
  ensureSignedIn,
  recordFlashTestResult,
  saveManual,
  recordManualView,
  subscribeFlashTestResults,
  subscribeManuals,
  uploadInspectionImage,
  uploadManualVideo,
} from './manualRepository'
import { translateManualContent } from './translationRepository'
import type { ApprovalEvent, ApprovalStatus, FlashTestResult, InspectionImage, InspectionImageKind, Manual, ManualLanguage, ReviewCheck, Step, VideoClip } from './types'

const initialManuals: Manual[] = [
  {
    id: 'M-1024',
    title: '塗装ライン立ち上げ手順',
    workName: '塗装ライン立ち上げ検査',
    controlNo: 'INS-2026-001',
    productName: 'コーティング部品A',
    department: '製造1課',
    owner: '杉本',
    status: 'review',
    version: 'v1.3',
    duration: '08:42',
    updatedAt: '2026-08-03',
    videoUrl: '',
    thumbnail:
      'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=80',
    tags: ['日常点検', '新入社員', '安全'],
    reviewers: ['班長', '品質保証'],
    checks: [
      { id: 'safety', label: '安全注意を冒頭に表示', checked: true },
      { id: 'viewer', label: '視聴確認を必須化', checked: true },
      { id: 'history', label: '改訂履歴を保存', checked: true },
    ],
    approvalHistory: [
      { id: 'created-1024', action: 'created', actor: '杉本', createdAt: '2026-08-01T09:00:00' },
      { id: 'submitted-1024', action: 'submitted', actor: '杉本', createdAt: '2026-08-03T10:30:00' },
    ],
    inspectionImages: [],
    steps: [
      {
        id: 1,
        time: '00:00',
        title: '保護具と周辺確認',
        detail: '手袋、保護メガネ、換気状態を確認してから開始します。',
      },
      {
        id: 2,
        time: '01:35',
        title: '設備電源投入',
        detail: '主電源、制御盤、非常停止解除の順で確認します。',
      },
      {
        id: 3,
        time: '04:20',
        title: '試し吹きと条件記録',
        detail: '圧力、粘度、ノズル距離を記録し、異常があれば停止します。',
      },
    ],
  },
  {
    id: 'M-0988',
    title: '異常発生時の初動連絡',
    workName: '外観異常の初動確認',
    controlNo: 'INS-2026-002',
    productName: '検査対象品',
    department: '品質保証',
    owner: '山田',
    status: 'published',
    version: 'v2.0',
    duration: '05:18',
    updatedAt: '2026-07-28',
    videoUrl: '',
    thumbnail:
      'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80',
    tags: ['異常対応', '報告', '承認済み'],
    reviewers: ['課長', '工場長'],
    checks: [
      { id: 'contacts', label: '連絡先の最新版反映', checked: true },
      { id: 'qr', label: 'QR閲覧に対応', checked: true },
      { id: 'log', label: '承認ログ保存', checked: true },
    ],
    approvalHistory: [
      { id: 'created-0988', action: 'created', actor: '山田', createdAt: '2026-07-22T09:00:00' },
      { id: 'approved-0988', action: 'approved', actor: '品質保証', createdAt: '2026-07-27T14:30:00' },
      { id: 'published-0988', action: 'published', actor: '品質保証', createdAt: '2026-07-28T08:15:00' },
    ],
    inspectionImages: [],
    steps: [
      {
        id: 1,
        time: '00:00',
        title: '現品を隔離',
        detail: '対象ロットと周辺在庫を識別して、使用停止ラベルを貼ります。',
      },
      {
        id: 2,
        time: '02:10',
        title: '一次報告',
        detail: '発見者、日時、現象、数量を異常履歴へ入力します。',
      },
    ],
  },
]

const statusLabels: Record<ApprovalStatus, string> = {
  draft: '下書き',
  review: '承認待ち',
  approved: '承認済み',
  published: '公開中',
}

const statusFlow: ApprovalStatus[] = ['draft', 'review', 'approved', 'published']

const imageKindLabels: Record<InspectionImageKind, string> = {
  ok: 'OK写真',
  ng: 'NG例写真',
  criteria: '判定基準',
}

const approvalActionLabels: Record<ApprovalEvent['action'], string> = {
  created: '作成',
  submitted: '承認依頼',
  approved: '承認',
  published: '公開',
  returned: '差戻し',
  revision: '改訂開始',
}

const clipFocusPoints = [
  { label: '左上', x: 20, y: 20 },
  { label: '上', x: 50, y: 20 },
  { label: '右上', x: 80, y: 20 },
  { label: '左', x: 20, y: 50 },
  { label: '中央', x: 50, y: 50 },
  { label: '右', x: 80, y: 50 },
  { label: '左下', x: 20, y: 80 },
  { label: '下', x: 50, y: 80 },
  { label: '右下', x: 80, y: 80 },
]

const getClipFocus = (clip: VideoClip) => ({
  x: clip.focusX ?? 50,
  y: clip.focusY ?? 50,
})

const getClipPlaybackRate = (clip: VideoClip) => clip.playbackRate ?? 1

const getClipVideoStyle = (clip: VideoClip) => {
  const focus = getClipFocus(clip)
  return {
    transform: `scale(${clip.zoom ?? 1})`,
    transformOrigin: `${focus.x}% ${focus.y}%`,
  }
}

const getSpotlightStyle = (clip: VideoClip) => {
  const focus = getClipFocus(clip)
  return {
    background: `radial-gradient(circle at ${focus.x}% ${focus.y}%, transparent 0 14%, rgba(15, 23, 42, 0.12) 22%, rgba(15, 23, 42, 0.68) 48%)`,
  }
}

function normalizeManual(manual: Manual): Manual {
  const checks = (manual.checks ?? []).map((check, index) =>
    typeof check === 'string'
      ? { id: `legacy-${index}`, label: check, checked: true }
      : check,
  ) as ReviewCheck[]

  return { ...manual, checks, approvalHistory: manual.approvalHistory ?? [] }
}

function nextMinorVersion(version: string) {
  const matched = /^v(\d+)\.(\d+)$/.exec(version)
  if (!matched) return 'v0.1'
  return `v${matched[1]}.${Number(matched[2]) + 1}`
}

type AnnotationKind = 'arrow' | 'rect' | 'circle'

type ImageAnnotation = {
  id: string
  kind: AnnotationKind
  x: number
  y: number
  width: number
  height: number
  color: string
}

type PendingInspectionImage = {
  stepId: number
  kind: InspectionImageKind
  file: File
  previewUrl: string
  annotations: ImageAnnotation[]
}

type FlashAnswer = 'ok' | 'ng'

type FlashTestCard = {
  image: InspectionImage
  step: Step
  stepNumber: number
}

function shuffleCards(cards: FlashTestCard[]) {
  const shuffled = [...cards]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function parseStepTime(time: string) {
  const parts = time.split(':').map((part) => Number(part))
  if (parts.some((part) => Number.isNaN(part))) return 0
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] ?? 0
}

function formatVideoTime(seconds: number) {
  const wholeSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(wholeSeconds / 60)
  const remainingSeconds = wholeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function getVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = objectUrl
    video.addEventListener('loadedmetadata', () => {
      URL.revokeObjectURL(objectUrl)
      resolve(Number.isFinite(video.duration) ? video.duration : 0)
    })
    video.addEventListener('error', () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('動画の長さを取得できません'))
    })
  })
}

function captureVideoFileThumbnail(file: File) {
  return new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const video = document.createElement('video')

    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = objectUrl

    const cleanup = () => URL.revokeObjectURL(objectUrl)

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(1, Math.max(0, video.duration / 4))
    })

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('サムネイル生成用のCanvasを作成できません')
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        cleanup()
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      } catch (error) {
        cleanup()
        reject(error)
      }
    })

    video.addEventListener('error', () => {
      cleanup()
      reject(new Error('動画からサムネイルを作成できません'))
    })
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('画像を読み込めません'))
    image.src = src
  })
}

async function composeAnnotatedImage(pending: PendingInspectionImage) {
  const image = await loadImage(pending.previewUrl)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('画像編集用のCanvasを作成できません')

  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  context.lineWidth = Math.max(8, canvas.width * 0.008)
  context.font = `${Math.max(22, canvas.width * 0.026)}px sans-serif`

  pending.annotations.forEach((annotation) => {
    const x = annotation.x * canvas.width
    const y = annotation.y * canvas.height
    const width = annotation.width * canvas.width
    const height = annotation.height * canvas.height
    context.strokeStyle = annotation.color
    context.fillStyle = annotation.color

    if (annotation.kind === 'rect') {
      context.strokeRect(x, y, width, height)
      return
    }

    if (annotation.kind === 'circle') {
      context.beginPath()
      context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
      context.stroke()
      return
    }

    const startX = x
    const startY = y + height / 2
    const endX = x + width
    const endY = y + height / 2
    const angle = Math.atan2(endY - startY, endX - startX)
    const headLength = Math.max(26, canvas.width * 0.035)
    context.beginPath()
    context.moveTo(startX, startY)
    context.lineTo(endX, endY)
    context.lineTo(endX - headLength * Math.cos(angle - Math.PI / 6), endY - headLength * Math.sin(angle - Math.PI / 6))
    context.moveTo(endX, endY)
    context.lineTo(endX - headLength * Math.cos(angle + Math.PI / 6), endY - headLength * Math.sin(angle + Math.PI / 6))
    context.stroke()
  })

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result)
      else reject(new Error('編集済み画像を作成できません'))
    }, 'image/jpeg', 0.9)
  })

  return new File([blob], pending.file.name.replace(/\.[^.]+$/, '-edited.jpg'), {
    type: 'image/jpeg',
  })
}

function App() {
  const [manuals, setManuals] = useState(initialManuals)
  const [selectedId, setSelectedId] = useState(initialManuals[0].id)
  const [view, setView] = useState<'edit' | 'approval' | 'library' | 'flash'>('edit')
  const [query, setQuery] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [pendingInspectionImage, setPendingInspectionImage] = useState<PendingInspectionImage | null>(null)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [draggingAnnotationId, setDraggingAnnotationId] = useState<string | null>(null)
  const [currentVideoTime, setCurrentVideoTime] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [reviewerName, setReviewerName] = useState('')
  const [viewerName, setViewerName] = useState('')
  const [viewerLanguage, setViewerLanguage] = useState<ManualLanguage>('ja')
  const [translatingLanguage, setTranslatingLanguage] = useState<Exclude<ManualLanguage, 'ja'> | null>(null)
  const [flashCard, setFlashCard] = useState<FlashTestCard | null>(null)
  const [flashQueue, setFlashQueue] = useState<FlashTestCard[]>([])
  const [flashWorker, setFlashWorker] = useState('')
  const [flashResults, setFlashResults] = useState<FlashTestResult[]>([])
  const [flashScore, setFlashScore] = useState(0)
  const [flashTotal, setFlashTotal] = useState(0)
  const [editorClipIndex, setEditorClipIndex] = useState(0)
  const [viewerClipIndex, setViewerClipIndex] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const viewerVideoRef = useRef<HTMLVideoElement | null>(null)
  const resumeEditorClipRef = useRef(false)
  const resumeViewerClipRef = useRef(false)
  const pendingEditorSeekRef = useRef<number | null>(null)
  const pendingViewerSeekRef = useRef<number | null>(null)
  const annotationSvgRef = useRef<SVGSVGElement | null>(null)
  const [firebaseMessage, setFirebaseMessage] = useState(
    isFirebaseConfigured
      ? 'Firebase接続を確認しています'
      : 'Firebase未設定: サンプルデータで表示しています',
  )

  const selectedManual = manuals.find((manual) => manual.id === selectedId) ?? manuals[0] ?? initialManuals[0]
  const isPublished = selectedManual.status === 'published'
  const isEditingLocked = selectedManual.status !== 'draft'
  const videoClips = useMemo<VideoClip[]>(() => {
    if (selectedManual.videoClips?.length) return selectedManual.videoClips
    if (!selectedManual.videoUrl) return []
    return [
      {
        id: 'primary-video',
        name: 'メイン動画',
        url: selectedManual.videoUrl,
        duration: 0,
        trimStart: 0,
        trimEnd: 0,
      },
    ]
  }, [selectedManual.videoClips, selectedManual.videoUrl])
  const editorClip = videoClips[editorClipIndex] ?? videoClips[0]
  const viewerClip = videoClips[viewerClipIndex] ?? videoClips[0]
  const viewerTranslation = viewerLanguage === 'ja' ? undefined : selectedManual.translations?.[viewerLanguage]
  const translatedSteps = useMemo(
    () => new Map(viewerTranslation?.steps.map((step) => [step.id, step])),
    [viewerTranslation?.steps],
  )

  useEffect(() => {
    if (editorClip && videoRef.current) {
      videoRef.current.playbackRate = getClipPlaybackRate(editorClip)
    }
  }, [editorClip])

  useEffect(() => {
    if (viewerClip && viewerVideoRef.current) {
      viewerVideoRef.current.playbackRate = getClipPlaybackRate(viewerClip)
    }
  }, [viewerClip])

  const flashCards = useMemo(
    () =>
      selectedManual.steps.flatMap((step, stepIndex) =>
        (step.inspectionImages ?? [])
          .filter((image) => image.kind === 'ok' || image.kind === 'ng')
          .map((image) => ({ image, step, stepNumber: stepIndex + 1 })),
      ),
    [selectedManual.steps],
  )
  const ngFlashCardCount = flashCards.filter((card) => card.image.kind === 'ng').length
  const flashImageAnalysis = useMemo(
    () =>
      flashCards
        .map((card) => {
          const responses = flashResults.filter((result) => result.imageId === card.image.id)
          const correct = responses.filter((result) => result.correct).length
          return {
            card,
            total: responses.length,
            correct,
            accuracy: responses.length === 0 ? null : Math.round((correct / responses.length) * 100),
          }
        })
        .sort((left, right) => (left.accuracy ?? -1) - (right.accuracy ?? -1)),
    [flashCards, flashResults],
  )
  const flashWorkerAnalysis = useMemo(() => {
    const workers = new Map<string, { total: number; correct: number; latest: string }>()
    flashResults.forEach((result) => {
      const current = workers.get(result.worker) ?? { total: 0, correct: 0, latest: result.answeredAt }
      current.total += 1
      current.correct += Number(result.correct)
      if (result.answeredAt > current.latest) current.latest = result.answeredAt
      workers.set(result.worker, current)
    })
    return [...workers.entries()]
      .map(([worker, result]) => ({
        worker,
        ...result,
        accuracy: Math.round((result.correct / result.total) * 100),
      }))
      .sort((left, right) => right.latest.localeCompare(left.latest))
  }, [flashResults])

  useEffect(() => {
    const unsubscribe = subscribeManuals(
      (cloudManuals) => {
        if (cloudManuals.length > 0) {
          setManuals(cloudManuals.map(normalizeManual))
          setSelectedId((current) =>
            cloudManuals.some((manual) => manual.id === current) ? current : cloudManuals[0].id,
          )
          setFirebaseMessage('Firebase接続中: videoManuals を参照しています')
          return
        }
        setFirebaseMessage('Firebase接続中: videoManuals は空のためサンプルを表示しています')
      },
      (message) => setFirebaseMessage(message),
    )

    return unsubscribe
  }, [])

  useEffect(() => {
    setFlashCard(null)
    setFlashQueue([])
    setFlashScore(0)
    setFlashTotal(0)
    setEditorClipIndex(0)
    setViewerClipIndex(0)
    setViewerLanguage('ja')
  }, [selectedManual.id])

  useEffect(() => {
    let active = true
    let unsubscribe: () => void = () => {}
    setFlashResults([])

    void ensureSignedIn()
      .then(() => {
        if (!active) return
        unsubscribe = subscribeFlashTestResults(
          selectedManual.id,
          (results) =>
            active &&
            setFlashResults([...results].sort((left, right) => right.answeredAt.localeCompare(left.answeredAt))),
          (message) => active && setFirebaseMessage(message),
        )
      })
      .catch(() => active && setFlashResults([]))

    return () => {
      active = false
      unsubscribe()
    }
  }, [selectedManual.id])

  const filteredManuals = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return manuals
    return manuals.filter((manual) =>
      [
        manual.title,
        manual.workName ?? '',
        manual.controlNo ?? '',
        manual.productName ?? '',
        manual.department,
        manual.owner,
        ...manual.tags,
      ].some((value) =>
        value.toLowerCase().includes(keyword),
      ),
    )
  }, [manuals, query])

  const activeStep = useMemo(() => {
    return selectedManual.steps.reduce((active, step) => {
      return parseStepTime(step.time) <= currentVideoTime ? step : active
    }, selectedManual.steps[0])
  }, [currentVideoTime, selectedManual.steps])

  const getComposedPosition = (seconds: number) => {
    let elapsed = 0
    for (const [index, clip] of videoClips.entries()) {
      const clipEnd = clip.trimEnd > clip.trimStart ? clip.trimEnd : clip.duration
      const playableDuration = Math.max(0, clipEnd - clip.trimStart)
      const isLastClip = index === videoClips.length - 1
      if (playableDuration === 0 && isLastClip) {
        return { index, time: clip.trimStart + Math.max(0, seconds - elapsed) }
      }
      if (seconds <= elapsed + playableDurati…15231 tokens truncated…認・改訂履歴</h2>
                <ol>
                  {[...(selectedManual.approvalHistory ?? [])].reverse().map((event) => (
                    <li key={event.id}>
                      <strong>{approvalActionLabels[event.action]}</strong>
                      <span>{event.actor} / {new Date(event.createdAt).toLocaleString('ja-JP')}</span>
                      {event.comment && <p>{event.comment}</p>}
                    </li>
                  ))}
                </ol>
              </section>
            </section>
          </div>
        )}

        {view === 'library' && (
          <div className="library-view">
            <section className="viewer-panel">
              <div className="viewer-header">
                <div>
                  <p className="eyebrow">公開ビュー</p>
                  <h2>{viewerTranslation?.title ?? selectedManual.title}</h2>
                </div>
                <div className="viewer-header-actions">
                  <label className="language-select">
                    <Languages size={16} aria-hidden="true" />
                    <select
                      value={viewerLanguage}
                      onChange={(event) => setViewerLanguage(event.target.value as ManualLanguage)}
                    >
                      <option value="ja">日本語</option>
                      <option value="th" disabled={!selectedManual.translations?.th}>ไทย</option>
                      <option value="pt" disabled={!selectedManual.translations?.pt}>Português</option>
                    </select>
                  </label>
                  <span className={`status-badge ${selectedManual.status}`}>
                    {statusLabels[selectedManual.status]}
                  </span>
                </div>
              </div>
              <div className="viewer-body">
                {viewerClip ? (
                  <div className="viewer-video-stage video-effect-stage">
                    <video
                      key={viewerClip.id}
                      ref={viewerVideoRef}
                      controls
                      onLoadedMetadata={handleViewerClipLoaded}
                      onTimeUpdate={(event) =>
                        handleClipTimeUpdate(event, viewerClip, viewerClipIndex, 'viewer')
                      }
                      poster={selectedManual.thumbnail}
                      src={viewerClip.url}
                      style={getClipVideoStyle(viewerClip)}
                    >
                      動画を再生できません
                    </video>
                    {viewerClip.spotlight && (
                      <div aria-hidden="true" className="video-spotlight" style={getSpotlightStyle(viewerClip)} />
                    )}
                    {viewerClip.caption && (
                      <div className={`video-caption ${viewerClip.captionPosition ?? 'bottom'}`}>
                        {viewerClip.caption}
                      </div>
                    )}
                  </div>
                ) : (
                  <img src={selectedManual.thumbnail} alt="" />
                )}
                <div>
                  <p>
                    {viewerTranslation?.workName ?? selectedManual.workName ?? selectedManual.title} / 整理No:{' '}
                    {selectedManual.controlNo ?? '未設定'} / 品名:{' '}
                    {viewerTranslation?.productName ?? selectedManual.productName ?? '未設定'}
                  </p>
                  <p>
                    {viewerTranslation?.department ?? selectedManual.department} / {selectedManual.owner} / {selectedManual.version}
                  </p>
                  <div className="tag-row">
                    {(viewerTranslation?.tags ?? selectedManual.tags).map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={startViewing}
                    disabled={!isPublished || !viewerClip}
                  >
                    <BookOpen size={18} aria-hidden="true" />
                    {viewerClip
                      ? isPublished ? '動画を視聴' : '公開前のため閲覧不可'
                      : '動画未登録'}
                  </button>
                  <div className="view-confirmation">
                    <input
                      value={viewerName}
                      onChange={(event) => setViewerName(event.target.value)}
                      placeholder="閲覧者名（任意）"
                      disabled={!isPublished}
                    />
                    <button type="button" onClick={completeViewing} disabled={!isPublished}>
                      <ClipboardCheck size={18} aria-hidden="true" />
                      閲覧完了を記録
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <aside className="library-step-panel">
              <header className="step-panel-header">
                <div>
                  <p className="eyebrow">作業手順</p>
                  <h2>動画に合わせて確認</h2>
                </div>
                <span>{selectedManual.steps.length} 手順</span>
              </header>
              <div className="viewer-steps">
                {selectedManual.steps.map((step, index) => (
                  <section
                    className={activeStep?.id === step.id ? 'active-viewer-step' : ''}
                    key={step.id}
                  >
                    <button type="button" onClick={() => seekViewerStep(step)}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <span>{step.time}</span>
                      <strong>{translatedSteps.get(step.id)?.title ?? step.title}</strong>
                    </button>
                    <p>{translatedSteps.get(step.id)?.detail ?? step.detail}</p>
                    <div className="inspection-gallery viewer-gallery">
                      {(step.inspectionImages ?? []).map((image) => (
                        <article className={`inspection-image ${image.kind}`} key={image.id}>
                          <img src={image.url} alt={image.name} />
                          <span>{imageKindLabels[image.kind]}</span>
                          <strong>{image.name}</strong>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <section className="qr-panel viewer-log-panel">
                <LockKeyhole size={28} aria-hidden="true" />
                <h2>現場閲覧記録</h2>
                <p>
                  閲覧完了を記録すると、Firebaseの閲覧ログとマニュアルの閲覧履歴に保存されます。
                </p>
                <div className="metric-grid">
                  <span>
                    <strong>{selectedManual.viewConfirmations?.length ?? 0}</strong>
                    閲覧完了
                  </span>
                  <span>
                    <strong>{selectedManual.steps.length}</strong>
                    手順数
                  </span>
                  <span>
                    <strong>{selectedManual.steps.flatMap((step) => step.inspectionImages ?? []).length}</strong>
                    判定資料
                  </span>
                </div>
              </section>
            </aside>
          </div>
        )}

        {view === 'flash' && (
          <div className="flash-test-view">
            <aside className="flash-test-summary">
              <div>
                <p className="eyebrow">検査判定トレーニング</p>
                <h2>フラッシュテスト</h2>
              </div>
              <label className="flash-worker-field">
                作業者
                <input
                  value={flashWorker}
                  onChange={(event) => setFlashWorker(event.target.value)}
                  placeholder="作業者名を入力"
                  disabled={Boolean(flashCard)}
                />
              </label>
              <div className="flash-score">
                <span>
                  <strong>{flashScore}</strong>
                  正解
                </span>
                <span>
                  <strong>{flashTotal}</strong>
                  回答
                </span>
                <span>
                  <strong>{ngFlashCardCount}</strong>
                  NG写真
                </span>
              </div>
              <button type="button" onClick={startFlashTest} disabled={flashCards.length === 0}>
                <Sparkles size={18} aria-hidden="true" />
                新しい出題を開始
              </button>
            </aside>

            <section className="flash-test-stage">
              {flashCard ? (
                <>
                  <header>
                    <p className="eyebrow">写真を見て判定</p>
                    <span>残り {flashQueue.length + 1} / {flashCards.length}</span>
                  </header>
                  <img
                    src={flashCard.image.originalUrl ?? flashCard.image.url}
                    alt="判定トレーニング用の検査写真"
                  />
                  <div className="flash-answer-actions">
                    <button
                      className="ok-answer"
                      type="button"
                      onClick={() => answerFlashTest('ok')}
                    >
                      <CheckCircle2 size={22} aria-hidden="true" />
                      OK
                    </button>
                    <button
                      className="ng-answer"
                      type="button"
                      onClick={() => answerFlashTest('ng')}
                    >
                      <LockKeyhole size={22} aria-hidden="true" />
                      NG
                    </button>
                  </div>
                </>
              ) : (
                <div className="flash-empty">
                  <Sparkles size={42} aria-hidden="true" />
                  <h2>{flashCards.length > 0 ? '判定を始めましょう' : '出題用の写真がありません'}</h2>
                  <p>
                    {flashCards.length > 0
                      ? '写真が表示されたら、OKかNGかを選択してください。'
                      : '各手順にOK写真またはNG例写真を登録すると、ここからランダム出題できます。'}
                  </p>
                  {flashCards.length > 0 && (
                    <button type="button" onClick={startFlashTest}>
                      <Sparkles size={18} aria-hidden="true" />
                      出題を開始
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="flash-analysis" aria-label="フラッシュテスト分析">
              <header>
                <div>
                  <p className="eyebrow">記録分析</p>
                  <h2>写真別の正解率</h2>
                </div>
                <span>{flashResults.length} 件の回答</span>
              </header>
              {flashImageAnalysis.length > 0 ? (
                <div className="flash-analysis-table" role="table" aria-label="写真別の正解率">
                  <div className="flash-analysis-row table-heading" role="row">
                    <span role="columnheader">写真</span>
                    <span role="columnheader">判定</span>
                    <span role="columnheader">正解 / 回答</span>
                    <span role="columnheader">正解率</span>
                  </div>
                  {flashImageAnalysis.map(({ card, correct, total, accuracy }) => (
                    <div className="flash-analysis-row" key={card.image.id} role="row">
                      <span role="cell">{card.image.name}</span>
                      <span className={card.image.kind} role="cell">
                        {imageKindLabels[card.image.kind]}
                      </span>
                      <span role="cell">{correct} / {total}</span>
                      <strong role="cell">{accuracy === null ? '-' : `${accuracy}%`}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="flash-analysis-empty">回答を記録すると、写真ごとの正解率を確認できます。</p>
              )}
              <div className="worker-analysis">
                <h3>作業者別の結果</h3>
                {flashWorkerAnalysis.length > 0 ? (
                  <div className="worker-analysis-list">
                    {flashWorkerAnalysis.map((result) => (
                      <div key={result.worker}>
                        <strong>{result.worker}</strong>
                        <span>{result.correct} / {result.total} 正解</span>
                        <b>{result.accuracy}%</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="flash-analysis-empty">まだ記録がありません。</p>
                )}
              </div>
            </section>
          </div>
        )}

        <footer className="firebase-note">
          <ListChecks size={18} aria-hidden="true" />
          {firebaseMessage}
        </footer>
      </section>
      {pendingInspectionImage && (
        <div className="image-editor-backdrop" role="dialog" aria-modal="true">
          <section className="image-editor">
            <header className="image-editor-header">
              <div>
                <p className="eyebrow">{imageKindLabels[pendingInspectionImage.kind]}</p>
                <h2>写真に注記を追加</h2>
              </div>
              <div className="annotation-tools">
                <button type="button" onClick={() => addAnnotation('arrow')}>
                  矢印
                </button>
                <button type="button" onClick={() => addAnnotation('rect')}>
                  四角
                </button>
                <button type="button" onClick={() => addAnnotation('circle')}>
                  丸
                </button>
                <button
                  disabled={!selectedAnnotationId}
                  type="button"
                  onClick={() => resizeSelectedAnnotation(1.18)}
                >
                  大きく
                </button>
                <button
                  disabled={!selectedAnnotationId}
                  type="button"
                  onClick={() => resizeSelectedAnnotation(0.84)}
                >
                  小さく
                </button>
                <button
                  disabled={!selectedAnnotationId}
                  type="button"
                  onClick={() => stretchSelectedAnnotation('vertical')}
                >
                  縦に伸ばす
                </button>
                <button
                  disabled={!selectedAnnotationId}
                  type="button"
                  onClick={() => shrinkSelectedAnnotation('vertical')}
                >
                  縦に縮める
                </button>
                <button
                  disabled={!selectedAnnotationId}
                  type="button"
                  onClick={() => stretchSelectedAnnotation('horizontal')}
                >
                  横に伸ばす
                </button>
                <button
                  disabled={!selectedAnnotationId}
                  type="button"
                  onClick={() => shrinkSelectedAnnotation('horizontal')}
                >
                  横に縮める
                </button>
                <button disabled={!selectedAnnotationId} type="button" onClick={deleteSelectedAnnotation}>
                  削除
                </button>
              </div>
            </header>

            <div className="annotation-canvas">
              <img src={pendingInspectionImage.previewUrl} alt="編集中の検査画像" />
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                ref={annotationSvgRef}
                onPointerLeave={stopAnnotationDrag}
                onPointerMove={dragAnnotation}
                onPointerUp={stopAnnotationDrag}
              >
                {pendingInspectionImage.annotations.map((annotation) => {
                  const x = annotation.x * 100
                  const y = annotation.y * 100
                  const width = annotation.width * 100
                  const height = annotation.height * 100
                  const selectedClass =
                    selectedAnnotationId === annotation.id ? ' selected-annotation' : ''

                  if (annotation.kind === 'rect') {
                    return (
                      <rect
                        className={`annotation-shape${selectedClass}`}
                        fill="none"
                        height={height}
                        key={annotation.id}
                        onPointerDown={(event) => startAnnotationDrag(annotation.id, event)}
                        stroke={annotation.color}
                        strokeWidth="1.2"
                        width={width}
                        x={x}
                        y={y}
                      />
                    )
                  }

                  if (annotation.kind === 'circle') {
                    return (
                      <ellipse
                        className={`annotation-shape${selectedClass}`}
                        cx={x + width / 2}
                        cy={y + height / 2}
                        fill="none"
                        key={annotation.id}
                        onPointerDown={(event) => startAnnotationDrag(annotation.id, event)}
                        rx={width / 2}
                        ry={height / 2}
                        stroke={annotation.color}
                        strokeWidth="1.2"
                      />
                    )
                  }

                  return (
                    <g
                      className={`annotation-shape${selectedClass}`}
                      key={annotation.id}
                      onPointerDown={(event) => startAnnotationDrag(annotation.id, event)}
                    >
                      <line
                        stroke={annotation.color}
                        strokeLinecap="round"
                        strokeWidth="1.4"
                        x1={x}
                        x2={x + width}
                        y1={y + height / 2}
                        y2={y + height / 2}
                      />
                      <polyline
                        fill="none"
                        points={`${x + width - 6},${y + height / 2 - 4} ${x + width},${y + height / 2} ${x + width - 6},${y + height / 2 + 4}`}
                        stroke={annotation.color}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.4"
                      />
                    </g>
                  )
                })}
              </svg>
            </div>

            <footer className="image-editor-actions">
              <button type="button" onClick={cancelInspectionImageEdit}>
                キャンセル
              </button>
              <button type="button" onClick={saveEditedInspectionImage}>
                編集済み画像を保存
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  )
}

export default App

