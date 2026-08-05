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
      if (seconds <= elapsed + playableDuration || isLastClip) {
        return { index, time: Math.min(clipEnd, clip.trimStart + Math.max(0, seconds - elapsed)) }
      }
      elapsed += playableDuration
    }
    return { index: 0, time: 0 }
  }

  const seekToStep = (step: Step) => {
    const seconds = parseStepTime(step.time)
    setCurrentVideoTime(seconds)
    const position = getComposedPosition(seconds)
    if (position.index !== editorClipIndex) {
      pendingEditorSeekRef.current = position.time
      setEditorClipIndex(position.index)
      return
    }
    if (videoRef.current) {
      videoRef.current.currentTime = position.time
      void videoRef.current.play()
    }
  }

  const handleEditorClipLoaded = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (!editorClip) return
    event.currentTarget.currentTime = pendingEditorSeekRef.current ?? editorClip.trimStart
    pendingEditorSeekRef.current = null
    if (resumeEditorClipRef.current) {
      resumeEditorClipRef.current = false
      void event.currentTarget.play()
    }
  }

  const handleViewerClipLoaded = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (!viewerClip) return
    event.currentTarget.currentTime = pendingViewerSeekRef.current ?? viewerClip.trimStart
    pendingViewerSeekRef.current = null
    if (resumeViewerClipRef.current) {
      resumeViewerClipRef.current = false
      void event.currentTarget.play()
    }
  }

  const handleClipTimeUpdate = (
    event: SyntheticEvent<HTMLVideoElement>,
    clip: VideoClip | undefined,
    clipIndex: number,
    target: 'editor' | 'viewer',
  ) => {
    const video = event.currentTarget
    const elapsedBeforeClip = videoClips.slice(0, clipIndex).reduce((total, item) => {
      const clipEnd = item.trimEnd > item.trimStart ? item.trimEnd : item.duration
      return total + Math.max(0, clipEnd - item.trimStart)
    }, 0)
    setCurrentVideoTime(elapsedBeforeClip + Math.max(0, video.currentTime - (clip?.trimStart ?? 0)))
    if (!clip || clip.trimEnd <= clip.trimStart || video.currentTime < clip.trimEnd) return

    if (clipIndex < videoClips.length - 1) {
      video.pause()
      if (target === 'editor') {
        resumeEditorClipRef.current = true
        setEditorClipIndex(clipIndex + 1)
      } else {
        resumeViewerClipRef.current = true
        setViewerClipIndex(clipIndex + 1)
      }
      return
    }

    video.pause()
    video.currentTime = clip.trimEnd
  }

  const updateManual = (patch: Partial<Manual>) => {
    setManuals((current) =>
      current.map((manual) =>
        manual.id === selectedManual.id
          ? { ...manual, ...patch, updatedAt: new Date().toISOString().slice(0, 10) }
          : manual,
      ),
    )
  }

  const persistSelectedManual = async () => {
    const latest = manuals.find((manual) => manual.id === selectedManual.id)
    if (!latest) return

    try {
      await saveManual(latest)
      setFirebaseMessage(`Firebase保存完了: ${latest.id}`)
    } catch (error) {
      setFirebaseMessage(error instanceof Error ? error.message : 'Firebase保存に失敗しました')
    }
  }

  const handleVideoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('video/')) {
      setFirebaseMessage('動画ファイルを選択してください')
      return
    }

    setIsUploading(true)
    setFirebaseMessage(`動画アップロード中: ${file.name}`)

    try {
      const [thumbnail, videoUrl, duration] = await Promise.all([
        captureVideoFileThumbnail(file),
        uploadManualVideo(selectedManual.id, file),
        getVideoDuration(file),
      ])
      const clip: VideoClip = {
        id: `clip-${Date.now()}`,
        name: file.name,
        url: videoUrl,
        duration,
        trimStart: 0,
        trimEnd: duration,
      }
      const updatedManual = {
        ...selectedManual,
        thumbnail,
        videoUrl,
        videoClips: [clip],
        duration: formatVideoTime(duration),
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      setManuals((current) =>
        current.map((manual) => (manual.id === selectedManual.id ? updatedManual : manual)),
      )
      await saveManual(updatedManual)
      setFirebaseMessage(`動画アップロード完了: ${file.name}`)
    } catch (error) {
      setFirebaseMessage(
        error instanceof Error
          ? `動画アップロード失敗: ${error.message}`
          : '動画アップロードに失敗しました',
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handleClipUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('video/'))
    event.target.value = ''
    if (files.length === 0) {
      setFirebaseMessage('動画ファイルを選択してください')
      return
    }

    setIsUploading(true)
    setFirebaseMessage(`${files.length}本の動画をアップロード中`)

    try {
      const uploadedClips = await Promise.all(
        files.map(async (file, index): Promise<VideoClip> => {
          const [url, duration] = await Promise.all([
            uploadManualVideo(selectedManual.id, file),
            getVideoDuration(file),
          ])
          return {
            id: `clip-${Date.now()}-${index}`,
            name: file.name,
            url,
            duration,
            trimStart: 0,
            trimEnd: duration,
          }
        }),
      )
      const existingClips = selectedManual.videoClips?.length
        ? selectedManual.videoClips
        : selectedManual.videoUrl
          ? [
              {
                id: 'primary-video',
                name: 'メイン動画',
                url: selectedManual.videoUrl,
                duration: 0,
                trimStart: 0,
                trimEnd: 0,
              },
            ]
          : []
      const clips = [...existingClips, ...uploadedClips]
      const updatedManual = {
        ...selectedManual,
        videoUrl: selectedManual.videoUrl || uploadedClips[0].url,
        videoClips: clips,
        duration: formatVideoTime(
          clips.reduce((total, clip) => total + Math.max(0, clip.trimEnd - clip.trimStart), 0),
        ),
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      setManuals((current) =>
        current.map((manual) => (manual.id === selectedManual.id ? updatedManual : manual)),
      )
      await saveManual(updatedManual)
      setEditorClipIndex(Math.max(0, clips.length - uploadedClips.length))
      setFirebaseMessage(`${uploadedClips.length}本を動画構成へ追加しました`)
    } catch (error) {
      setFirebaseMessage(error instanceof Error ? error.message : '動画構成の追加に失敗しました')
    } finally {
      setIsUploading(false)
    }
  }

  const updateClip = (clipId: string, patch: Partial<VideoClip>) => {
    const clips = videoClips.map((clip) => (clip.id === clipId ? { ...clip, ...patch } : clip))
    updateManual({
      videoClips: clips,
      duration: formatVideoTime(
        clips.reduce((total, clip) => total + Math.max(0, clip.trimEnd - clip.trimStart), 0),
      ),
    })
  }

  const moveClip = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= videoClips.length) return
    const clips = [...videoClips]
    ;[clips[index], clips[nextIndex]] = [clips[nextIndex], clips[index]]
    updateManual({ videoClips: clips })
    setEditorClipIndex(nextIndex)
  }

  const removeClip = (clipId: string) => {
    const clips = videoClips.filter((clip) => clip.id !== clipId)
    updateManual({
      videoClips: clips,
      videoUrl: clips[0]?.url ?? '',
      duration: formatVideoTime(
        clips.reduce((total, clip) => total + Math.max(0, clip.trimEnd - clip.trimStart), 0),
      ),
    })
    setEditorClipIndex(0)
    setViewerClipIndex(0)
  }

  const handleInspectionImageUpload =
    (kind: InspectionImageKind, stepId = activeStep?.id ?? selectedManual.steps[0]?.id ?? 1) => async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return

      if (!file.type.startsWith('image/')) {
        setFirebaseMessage('画像ファイルを選択してください')
        return
      }

      setPendingInspectionImage({
        stepId,
        kind,
        file,
        previewUrl: URL.createObjectURL(file),
        annotations: [],
      })
      setFirebaseMessage(`${imageKindLabels[kind]}を編集中: ${file.name}`)
    }

  const addAnnotation = (kind: AnnotationKind) => {
    const id = `${kind}-${Date.now()}`
    setPendingInspectionImage((current) => {
      if (!current) return current
      return {
        ...current,
        annotations: [
          ...current.annotations,
          {
            id,
            kind,
            x: kind === 'arrow' ? 0.22 : 0.34,
            y: kind === 'arrow' ? 0.42 : 0.28,
            width: kind === 'arrow' ? 0.44 : 0.28,
            height: kind === 'arrow' ? 0.08 : 0.3,
            color: '#ef4444',
          },
        ],
      }
    })
    setSelectedAnnotationId(id)
  }

  const getAnnotationPoint = (event: PointerEvent<SVGElement>) => {
    const rect = annotationSvgRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const moveAnnotation = (id: string, x: number, y: number) => {
    setPendingInspectionImage((current) => {
      if (!current) return current
      return {
        ...current,
        annotations: current.annotations.map((annotation) =>
          annotation.id === id
            ? {
                ...annotation,
                x: Math.min(1 - annotation.width, Math.max(0, x - annotation.width / 2)),
                y: Math.min(1 - annotation.height, Math.max(0, y - annotation.height / 2)),
              }
            : annotation,
        ),
      }
    })
  }

  const startAnnotationDrag = (id: string, event: PointerEvent<SVGElement>) => {
    event.preventDefault()
    setSelectedAnnotationId(id)
    setDraggingAnnotationId(id)
    const point = getAnnotationPoint(event)
    if (point) moveAnnotation(id, point.x, point.y)
  }

  const dragAnnotation = (event: PointerEvent<SVGElement>) => {
    if (!draggingAnnotationId) return
    const point = getAnnotationPoint(event)
    if (point) moveAnnotation(draggingAnnotationId, point.x, point.y)
  }

  const stopAnnotationDrag = () => {
    setDraggingAnnotationId(null)
  }

  const resizeSelectedAnnotation = (scale: number) => {
    if (!selectedAnnotationId) return
    setPendingInspectionImage((current) => {
      if (!current) return current
      return {
        ...current,
        annotations: current.annotations.map((annotation) => {
          if (annotation.id !== selectedAnnotationId) return annotation
          const width = Math.min(0.85, Math.max(0.06, annotation.width * scale))
          const height = Math.min(0.85, Math.max(0.04, annotation.height * scale))
          return {
            ...annotation,
            width,
            height,
            x: Math.min(1 - width, annotation.x),
            y: Math.min(1 - height, annotation.y),
          }
        }),
      }
    })
  }

  const stretchSelectedAnnotation = (direction: 'vertical' | 'horizontal') => {
    if (!selectedAnnotationId) return
    setPendingInspectionImage((current) => {
      if (!current) return current
      return {
        ...current,
        annotations: current.annotations.map((annotation) => {
          if (annotation.id !== selectedAnnotationId) return annotation

          if (direction === 'horizontal') {
            const width = Math.min(0.92, annotation.width * 1.18)
            const x = Math.min(1 - width, Math.max(0, annotation.x - (width - annotation.width) / 2))
            return { ...annotation, x, width }
          }

          const height = Math.min(0.92, annotation.height * 1.18)
          const y = Math.min(1 - height, Math.max(0, annotation.y - (height - annotation.height) / 2))
          return {
            ...annotation,
            y,
            height,
          }
        }),
      }
    })
  }

  const shrinkSelectedAnnotation = (direction: 'vertical' | 'horizontal') => {
    if (!selectedAnnotationId) return
    setPendingInspectionImage((current) => {
      if (!current) return current
      return {
        ...current,
        annotations: current.annotations.map((annotation) => {
          if (annotation.id !== selectedAnnotationId) return annotation

          if (direction === 'horizontal') {
            const width = Math.max(0.05, annotation.width * 0.84)
            return {
              ...annotation,
              x: Math.min(1 - width, annotation.x + (annotation.width - width) / 2),
              width,
            }
          }

          const height = Math.max(0.04, annotation.height * 0.84)
            return {
              ...annotation,
              y: Math.min(1 - height, annotation.y + (annotation.height - height) / 2),
              height,
            }
        }),
      }
    })
  }

  const deleteSelectedAnnotation = () => {
    if (!selectedAnnotationId) return
    setPendingInspectionImage((current) => {
      if (!current) return current
      return {
        ...current,
        annotations: current.annotations.filter(
          (annotation) => annotation.id !== selectedAnnotationId,
        ),
      }
    })
    setSelectedAnnotationId(null)
  }

  const cancelInspectionImageEdit = () => {
    if (pendingInspectionImage) {
      URL.revokeObjectURL(pendingInspectionImage.previewUrl)
    }
    setPendingInspectionImage(null)
    setSelectedAnnotationId(null)
    setDraggingAnnotationId(null)
    setFirebaseMessage('検査画像の編集をキャンセルしました')
  }

  const saveEditedInspectionImage = async () => {
    if (!pendingInspectionImage) return

    setFirebaseMessage(`${imageKindLabels[pendingInspectionImage.kind]}をFirebaseへ保存中`)

    try {
      const editedFile = await composeAnnotatedImage(pendingInspectionImage)
      const [url, originalUrl] = await Promise.all([
        uploadInspectionImage(
          selectedManual.id,
          pendingInspectionImage.stepId,
          pendingInspectionImage.kind,
          editedFile,
          'annotated',
        ),
        uploadInspectionImage(
          selectedManual.id,
          pendingInspectionImage.stepId,
          pendingInspectionImage.kind,
          pendingInspectionImage.file,
          'original',
        ),
      ])
      const inspectionImage = {
        id: `${pendingInspectionImage.kind}-${Date.now()}`,
        kind: pendingInspectionImage.kind,
        name: editedFile.name,
        url,
        originalUrl,
        uploadedAt: new Date().toISOString().slice(0, 10),
      }
      const updatedManual = {
        ...selectedManual,
        steps: selectedManual.steps.map((step) =>
          step.id === pendingInspectionImage.stepId
            ? { ...step, inspectionImages: [...(step.inspectionImages ?? []), inspectionImage] }
            : step,
        ),
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      setManuals((current) =>
        current.map((manual) => (manual.id === selectedManual.id ? updatedManual : manual)),
      )
      await saveManual(updatedManual)
      URL.revokeObjectURL(pendingInspectionImage.previewUrl)
      setPendingInspectionImage(null)
      setFirebaseMessage(`${imageKindLabels[inspectionImage.kind]}を手順に登録しました`)
    } catch (error) {
      setFirebaseMessage(
        error instanceof Error
          ? `編集済み画像の保存失敗: ${error.message}`
          : '編集済み画像の保存に失敗しました',
      )
    }
  }

  const captureCurrentFrame = async () => {
    const video = videoRef.current
    if (!video) {
      setFirebaseMessage('サムネイルにする動画がありません')
      return
    }

    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('サムネイル生成用のCanvasを作成できません')
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      const thumbnail = canvas.toDataURL('image/jpeg', 0.82)
      const updatedManual = {
        ...selectedManual,
        thumbnail,
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      setManuals((current) =>
        current.map((manual) => (manual.id === selectedManual.id ? updatedManual : manual)),
      )
      await saveManual(updatedManual)
      setFirebaseMessage('現在の動画フレームをサムネイルに設定しました')
    } catch (error) {
      setFirebaseMessage(
        error instanceof Error
          ? `サムネイル設定失敗: ${error.message}`
          : 'サムネイル設定に失敗しました',
      )
    }
  }

  const getEditorTimelineTime = () => {
    const clip = videoClips[editorClipIndex]
    const video = videoRef.current
    if (!clip || !video || !Number.isFinite(video.currentTime)) return currentVideoTime

    const elapsedBeforeClip = videoClips.slice(0, editorClipIndex).reduce((total, item) => {
      const clipEnd = item.trimEnd > item.trimStart ? item.trimEnd : item.duration
      return total + Math.max(0, clipEnd - item.trimStart)
    }, 0)
    return elapsedBeforeClip + Math.max(0, video.currentTime - clip.trimStart)
  }

  const addStep = () => {
    const timelineTime = getEditorTimelineTime()
    const nextStep: Step = {
      id: Math.max(0, ...selectedManual.steps.map((step) => step.id)) + 1,
      time: formatVideoTime(timelineTime),
      title: '新しい手順',
      detail: '作業のポイント、確認事項、NG例を入力します。',
    }
    updateManual({
      steps: [...selectedManual.steps, nextStep].sort(
        (left, right) => parseStepTime(left.time) - parseStepTime(right.time),
      ),
    })
  }

  const saveWorkflowManual = async (manual: Manual, message: string) => {
    setManuals((current) => current.map((item) => (item.id === manual.id ? manual : item)))
    try {
      await saveManual(manual)
      setFirebaseMessage(message)
    } catch (error) {
      setFirebaseMessage(error instanceof Error ? error.message : 'ワークフローの保存に失敗しました')
    }
  }

  const translateManual = async (targetLanguage: Exclude<ManualLanguage, 'ja'>) => {
    if (isEditingLocked) return

    setTranslatingLanguage(targetLanguage)
    try {
      const translation = await translateManualContent(selectedManual, targetLanguage)
      const updatedManual: Manual = {
        ...selectedManual,
        translations: {
          ...selectedManual.translations,
          [targetLanguage]: translation,
        },
      }
      await saveWorkflowManual(
        updatedManual,
        `${targetLanguage === 'th' ? 'タイ語' : 'ポルトガル語'}のAI翻訳を保存しました`,
      )
    } catch (error) {
      setFirebaseMessage(
        error instanceof Error ? `AI翻訳に失敗しました: ${error.message}` : 'AI翻訳に失敗しました',
      )
    } finally {
      setTranslatingLanguage(null)
    }
  }

  const createApprovalEvent = (action: ApprovalEvent['action'], actor: string): ApprovalEvent => ({
    id: `${action}-${Date.now()}`,
    action,
    actor,
    comment: reviewComment.trim() || undefined,
    createdAt: new Date().toISOString(),
  })

  const submitForReview = async () => {
    const missingFields = [
      !selectedManual.workName && '作業名',
      !selectedManual.controlNo && '整理No',
      !selectedManual.productName && '品名',
      !selectedManual.owner && '作成者',
      !selectedManual.videoUrl && '動画',
      selectedManual.steps.length === 0 && '手順',
    ].filter(Boolean)

    if (missingFields.length > 0) {
      setFirebaseMessage(`承認依頼前に入力してください: ${missingFields.join('、')}`)
      return
    }

    const event = createApprovalEvent('submitted', selectedManual.owner)
    await saveWorkflowManual(
      {
        ...selectedManual,
        status: 'review',
        updatedAt: new Date().toISOString().slice(0, 10),
        approvalHistory: [...(selectedManual.approvalHistory ?? []), event],
      },
      '承認依頼を送信しました',
    )
    setReviewComment('')
  }

  const approveManual = async () => {
    if (selectedManual.status !== 'review') {
      setFirebaseMessage('承認は「承認待ち」のマニュアルに対して実行してください')
      return
    }
    if (!selectedManual.checks.every((check) => check.checked)) {
      setFirebaseMessage('レビュー項目をすべて確認してから承認してください')
      return
    }

    const event = createApprovalEvent('approved', selectedManual.reviewers[0] ?? '承認者')
    await saveWorkflowManual(
      {
        ...selectedManual,
        status: 'approved',
        updatedAt: new Date().toISOString().slice(0, 10),
        approvalHistory: [...(selectedManual.approvalHistory ?? []), event],
      },
      'マニュアルを承認しました',
    )
    setReviewComment('')
  }

  const publishManual = async () => {
    if (selectedManual.status !== 'approved') {
      setFirebaseMessage('公開するには、先に承認を完了してください')
      return
    }

    const event = createApprovalEvent('published', selectedManual.reviewers[0] ?? '承認者')
    await saveWorkflowManual(
      {
        ...selectedManual,
        status: 'published',
        updatedAt: new Date().toISOString().slice(0, 10),
        approvalHistory: [...(selectedManual.approvalHistory ?? []), event],
      },
      '現場閲覧用に公開しました',
    )
    setReviewComment('')
  }

  const returnToDraft = async () => {
    if (!reviewComment.trim()) {
      setFirebaseMessage('差戻し理由を入力してください')
      return
    }
    const event = createApprovalEvent('returned', selectedManual.reviewers[0] ?? '承認者')
    await saveWorkflowManual(
      {
        ...selectedManual,
        status: 'draft',
        updatedAt: new Date().toISOString().slice(0, 10),
        approvalHistory: [...(selectedManual.approvalHistory ?? []), event],
      },
      '下書きへ差し戻しました',
    )
    setReviewComment('')
  }

  const beginRevision = async () => {
    const event = createApprovalEvent('revision', selectedManual.owner)
    await saveWorkflowManual(
      {
        ...selectedManual,
        status: 'draft',
        version: nextMinorVersion(selectedManual.version),
        updatedAt: new Date().toISOString().slice(0, 10),
        approvalHistory: [...(selectedManual.approvalHistory ?? []), event],
      },
      '改訂版を下書きとして作成しました',
    )
  }

  const resumeEditing = async () => {
    if (selectedManual.status === 'draft') return

    const event: ApprovalEvent = {
      id: `returned-${Date.now()}`,
      action: 'returned',
      actor: selectedManual.owner,
      comment: '作成者が編集を再開',
      createdAt: new Date().toISOString(),
    }
    await saveWorkflowManual(
      {
        ...selectedManual,
        status: 'draft',
        updatedAt: new Date().toISOString().slice(0, 10),
        approvalHistory: [...(selectedManual.approvalHistory ?? []), event],
      },
      '下書きへ戻しました。編集とテストを再開できます',
    )
  }

  const toggleReviewCheck = (checkId: string) => {
    updateManual({
      checks: selectedManual.checks.map((check) =>
        check.id === checkId ? { ...check, checked: !check.checked } : check,
      ),
    })
  }

  const addReviewer = async () => {
    const name = reviewerName.trim()
    if (!name || selectedManual.reviewers.includes(name)) return
    const updatedManual = {
      ...selectedManual,
      reviewers: [...selectedManual.reviewers, name],
      updatedAt: new Date().toISOString().slice(0, 10),
    }
    await saveWorkflowManual(updatedManual, `${name}を承認者に追加しました`)
    setReviewerName('')
  }

  const completeViewing = async () => {
    if (selectedManual.status !== 'published') {
      setFirebaseMessage('閲覧記録は公開済みのマニュアルで利用できます')
      return
    }
    const viewer = viewerName.trim() || '現場閲覧者'
    try {
      await recordManualView(selectedManual, viewer)
      const updatedManual = {
        ...selectedManual,
        viewConfirmations: [
          ...(selectedManual.viewConfirmations ?? []),
          { id: `view-${Date.now()}`, viewer, completedAt: new Date().toISOString() },
        ],
      }
      await saveWorkflowManual(updatedManual, '閲覧完了を記録しました')
      setViewerName('')
    } catch (error) {
      setFirebaseMessage(error instanceof Error ? error.message : '閲覧記録の保存に失敗しました')
    }
  }

  const startViewing = async () => {
    if (!isPublished || !viewerClip) return
    const video = viewerVideoRef.current
    if (!video) return

    if (video.currentTime < viewerClip.trimStart) {
      video.currentTime = viewerClip.trimStart
    }
    video.scrollIntoView({ behavior: 'smooth', block: 'center' })
    try {
      await video.play()
    } catch {
      setFirebaseMessage('再生ボタンを押して動画を開始してください')
    }
  }

  const startFlashTest = () => {
    const worker = flashWorker.trim()
    if (!worker) {
      setFirebaseMessage('フラッシュテストを始める前に作業者名を入力してください')
      return
    }
    if (flashCards.length === 0) {
      setFirebaseMessage('フラッシュテストには、手順ごとにOK写真またはNG例写真を登録してください')
      return
    }
    const queue = shuffleCards(flashCards)
    setFlashScore(0)
    setFlashTotal(0)
    setFlashCard(queue[0] ?? null)
    setFlashQueue(queue.slice(1))
  }

  const answerFlashTest = (answer: FlashAnswer) => {
    if (!flashCard) return
    const correct = answer === flashCard.image.kind
    setFlashTotal((current) => current + 1)
    if (correct) {
      setFlashScore((current) => current + 1)
    }
    const nextCard = flashQueue[0] ?? null
    setFlashQueue((current) => current.slice(1))
    setFlashCard(nextCard)
    if (!nextCard) {
      setFirebaseMessage('今回の出題を完了しました。すべてのNG写真を1回以上出題しています')
    }

    void recordFlashTestResult({
      manualId: selectedManual.id,
      worker: flashWorker.trim(),
      imageId: flashCard.image.id,
      imageName: flashCard.image.name,
      imageKind: flashCard.image.kind as FlashAnswer,
      stepId: flashCard.step.id,
      stepTitle: flashCard.step.title,
      answer,
      correct,
      answeredAt: new Date().toISOString(),
    }).catch((error) =>
      setFirebaseMessage(error instanceof Error ? error.message : 'フラッシュテスト結果の保存に失敗しました'),
    )
  }

  const seekViewerStep = async (step: Step) => {
    const video = viewerVideoRef.current
    if (!video || !viewerClip) {
      setFirebaseMessage('動画を登録してから手順ジャンプを利用してください')
      return
    }

    const seconds = parseStepTime(step.time)
    setCurrentVideoTime(seconds)
    const position = getComposedPosition(seconds)
    if (position.index !== viewerClipIndex) {
      pendingViewerSeekRef.current = position.time
      resumeViewerClipRef.current = true
      setViewerClipIndex(position.index)
      return
    }
    video.currentTime = position.time
    video.scrollIntoView({ behavior: 'smooth', block: 'center' })
    try {
      await video.play()
    } catch {
      setFirebaseMessage('動画の再生ボタンを押して開始してください')
    }
  }

  const createManual = () => {
    const id = `M-${Math.floor(1000 + Math.random() * 8999)}`
    const manual: Manual = {
      id,
      title: '新規動画マニュアル',
      workName: '新規検査作業',
      controlNo: `INS-${new Date().getFullYear()}-${id.replace('M-', '')}`,
      productName: '品名未設定',
      department: '未設定',
      owner: '作成者',
      status: 'draft',
      version: 'v0.1',
      duration: '00:00',
      updatedAt: new Date().toISOString().slice(0, 10),
      videoUrl: '',
      thumbnail:
        'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
      tags: ['未分類'],
      reviewers: ['承認者を追加'],
      checks: [{ id: 'content', label: '動画と手順の整合性を確認', checked: false }],
      approvalHistory: [
        { id: `created-${id}`, action: 'created', actor: '作成者', createdAt: new Date().toISOString() },
      ],
      inspectionImages: [],
      steps: [
        {
          id: 1,
          time: '00:00',
          title: '手順タイトル',
          detail: '現場で迷わないように、短い文章で入力します。',
        },
      ],
    }
    void saveWorkflowManual(manual, '新規マニュアルをFirebaseへ保存しました')
    setSelectedId(id)
    setView('edit')
  }

  const duplicateManual = async () => {
    const id = `M-${Math.floor(1000 + Math.random() * 8999)}`
    const copiedManual: Manual = {
      ...selectedManual,
      id,
      title: `${selectedManual.title}（複製）`,
      status: 'draft',
      version: 'v0.1',
      updatedAt: new Date().toISOString().slice(0, 10),
      checks: selectedManual.checks.map((check) => ({ ...check, checked: false })),
      steps: selectedManual.steps.map((step) => ({
        ...step,
        inspectionImages: step.inspectionImages?.map((image) => ({ ...image })),
      })),
      videoClips: selectedManual.videoClips?.map((clip) => ({ ...clip })),
      approvalHistory: [
        {
          id: `created-${id}`,
          action: 'created',
          actor: selectedManual.owner,
          comment: `複製元: ${selectedManual.id}`,
          createdAt: new Date().toISOString(),
        },
      ],
      viewConfirmations: [],
    }

    setManuals((current) => [copiedManual, ...current])
    setSelectedId(id)
    setView('edit')
    try {
      await saveManual(copiedManual)
      setFirebaseMessage(`複製した下書きを作成しました: ${id}`)
    } catch (error) {
      setFirebaseMessage(error instanceof Error ? error.message : '複製したマニュアルの保存に失敗しました')
    }
  }

  const removeManual = async () => {
    const shouldDelete = window.confirm(`「${selectedManual.title}」を削除します。元に戻せません。`)
    if (!shouldDelete) return

    try {
      await deleteManual(selectedManual.id)
      const remainingManuals = manuals.filter((manual) => manual.id !== selectedManual.id)
      setManuals(remainingManuals)
      setSelectedId(remainingManuals[0]?.id ?? initialManuals[0].id)
      setView('edit')
      setFirebaseMessage(`マニュアルを削除しました: ${selectedManual.id}`)
    } catch (error) {
      setFirebaseMessage(error instanceof Error ? error.message : 'マニュアルの削除に失敗しました')
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="動画マニュアル一覧">
        <div className="brand">
          <img src={miyamaLogo} alt="MIYAMA" />
          <span>動画マニュアル</span>
        </div>

        <button className="primary-action" type="button" onClick={createManual}>
          <Plus size={18} aria-hidden="true" />
          新規マニュアル
        </button>

        <label className="search-box">
          <Search size={17} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="部署、タグ、タイトルで検索"
          />
        </label>

        <div className="manual-list">
          {filteredManuals.map((manual) => (
            <button
              className={`manual-item ${manual.id === selectedManual.id ? 'active' : ''}`}
              key={manual.id}
              type="button"
              onClick={() => setSelectedId(manual.id)}
            >
              <img src={manual.thumbnail} alt="" />
              <span>
                <strong>{manual.title}</strong>
                <small>
                  {manual.department} / {statusLabels[manual.status]}
                </small>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Firebase project: miyamaunitec-fb87a</p>
            <h1>{selectedManual.title}</h1>
          </div>
          <div className="manual-actions">
            {isPublished && (
              <button className="revision-button" type="button" onClick={beginRevision}>
                <RotateCcw size={17} aria-hidden="true" />
                改訂を開始
              </button>
            )}
            <button className="duplicate-button" type="button" onClick={duplicateManual}>
              <Copy size={17} aria-hidden="true" />
              複製
            </button>
            <button className="delete-button" type="button" onClick={removeManual}>
              <Trash2 size={17} aria-hidden="true" />
              削除
            </button>
          </div>
          <nav className="view-tabs" aria-label="表示切り替え">
            <button className={view === 'edit' ? 'selected' : ''} onClick={() => setView('edit')}>
              <FileVideo size={17} aria-hidden="true" />
              作成
            </button>
            <button
              className={view === 'approval' ? 'selected' : ''}
              onClick={() => setView('approval')}
            >
              <ShieldCheck size={17} aria-hidden="true" />
              承認
            </button>
            <button
              className={view === 'library' ? 'selected' : ''}
              onClick={() => setView('library')}
            >
              <Library size={17} aria-hidden="true" />
              閲覧
            </button>
            <button
              className={view === 'flash' ? 'selected' : ''}
              onClick={() => setView('flash')}
            >
              <Sparkles size={17} aria-hidden="true" />
              フラッシュテスト
            </button>
          </nav>
        </header>

        {view === 'edit' && (
          <div className="editor-grid">
            <section className="video-panel">
              <div className="video-frame">
                {editorClip ? (
                  <video
                    key={editorClip.id}
                    controls
                    onLoadedMetadata={handleEditorClipLoaded}
                    onTimeUpdate={(event) =>
                      handleClipTimeUpdate(event, editorClip, editorClipIndex, 'editor')
                    }
                    poster={selectedManual.thumbnail}
                    ref={videoRef}
                    src={editorClip.url}
                  >
                    動画を再生できません
                  </video>
                ) : (
                  <>
                    <img
                      src={selectedManual.thumbnail}
                      alt={`${selectedManual.title}のサムネイル`}
                    />
                    <button type="button" className="play-button" aria-label="動画を再生">
                      <PlayCircle size={54} aria-hidden="true" />
                    </button>
                  </>
                )}
                {activeStep && (
                  <div className="step-overlay">
                    <small>{activeStep.time}</small>
                    <strong>{activeStep.title}</strong>
                    <p>{activeStep.detail}</p>
                  </div>
                )}
                <span>{selectedManual.duration}</span>
              </div>
              <div className="upload-row">
                <label className="upload-control">
                  <UploadCloud size={18} aria-hidden="true" />
                  {isUploading ? 'アップロード中' : '動画アップロード'}
                  <input
                    accept="video/*"
                    disabled={isUploading || isEditingLocked}
                    onChange={handleVideoUpload}
                    type="file"
                  />
                </label>
                <label className="upload-control secondary-upload">
                  <Plus size={18} aria-hidden="true" />
                  動画を追加
                  <input
                    accept="video/*"
                    disabled={isUploading || isEditingLocked}
                    multiple
                    onChange={handleClipUpload}
                    type="file"
                  />
                </label>
                <button
                  disabled={!editorClip || isEditingLocked}
                  type="button"
                  onClick={captureCurrentFrame}
                >
                  <FileVideo size={18} aria-hidden="true" />
                  現在フレームをサムネイル
                </button>
                <button disabled={isEditingLocked} type="button" onClick={persistSelectedManual}>
                  <Save size={18} aria-hidden="true" />
                  Firebaseへ保存
                </button>
              </div>
              {videoClips.length > 0 && (
                <section className="clip-editor">
                  <div className="section-heading compact-heading">
                    <h2>動画構成</h2>
                    <span>{videoClips.length} 本</span>
                  </div>
                  <div className="clip-list">
                    {videoClips.map((clip, index) => (
                      <article className={editorClip?.id === clip.id ? 'active-clip' : ''} key={clip.id}>
                        <button
                          className="clip-preview"
                          type="button"
                          onClick={() => setEditorClipIndex(index)}
                        >
                          <span>{String(index + 1).padStart(2, '0')}</span>
                          <strong>{clip.name}</strong>
                          <small>{formatVideoTime(Math.max(0, clip.trimEnd - clip.trimStart))}</small>
                        </button>
                        <div className="clip-trim-fields">
                          <label>
                            <Scissors size={14} aria-hidden="true" />
                            開始（秒）
                            <input
                              disabled={isEditingLocked}
                              min="0"
                              max={Math.max(0, clip.trimEnd - 0.1)}
                              step="0.1"
                              type="number"
                              value={clip.trimStart}
                              onChange={(event) =>
                                updateClip(clip.id, {
                                  trimStart: Math.min(
                                    Math.max(0, Number(event.target.value)),
                                    Math.max(0, clip.trimEnd - 0.1),
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            <Scissors size={14} aria-hidden="true" />
                            終了（秒）
                            <input
                              disabled={isEditingLocked}
                              min={Math.min(clip.duration || 0, clip.trimStart + 0.1)}
                              max={clip.duration || undefined}
                              step="0.1"
                              type="number"
                              value={clip.trimEnd}
                              onChange={(event) =>
                                updateClip(clip.id, {
                                  trimEnd: Math.max(
                                    clip.trimStart + 0.1,
                                    Math.min(clip.duration || Number(event.target.value), Number(event.target.value)),
                                  ),
                                })
                              }
                            />
                          </label>
                        </div>
                        <div className="clip-actions">
                          <button
                            aria-label="動画を上へ移動"
                            disabled={isEditingLocked || index === 0}
                            type="button"
                            onClick={() => moveClip(index, -1)}
                          >
                            <ArrowUp size={17} aria-hidden="true" />
                          </button>
                          <button
                            aria-label="動画を下へ移動"
                            disabled={isEditingLocked || index === videoClips.length - 1}
                            type="button"
                            onClick={() => moveClip(index, 1)}
                          >
                            <ArrowDown size={17} aria-hidden="true" />
                          </button>
                          <button
                            aria-label="動画を構成から外す"
                            disabled={isEditingLocked}
                            type="button"
                            onClick={() => removeClip(clip.id)}
                          >
                            <Trash2 size={17} aria-hidden="true" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </section>

            <section className={`form-panel ${isEditingLocked ? 'locked-panel' : ''}`}>
              {isEditingLocked && (
                <div className="locked-note">
                  <span>
                    {isPublished
                      ? '公開版は編集できません。改訂を開始すると下書き版を作成します。'
                      : '承認中の内容は固定されています。下書きへ戻すと編集とテストを再開できます。'}
                  </span>
                  {!isPublished && (
                    <button type="button" onClick={resumeEditing}>
                      <RotateCcw size={16} aria-hidden="true" />
                      下書きへ戻す
                    </button>
                  )}
                </div>
              )}
              <fieldset className="editor-fieldset" disabled={isEditingLocked}>
              <div className="section-heading">
                <h2>検査基本情報</h2>
              </div>
              <div className="field-row three-fields">
                <label>
                  作業名
                  <input
                    value={selectedManual.workName ?? selectedManual.title}
                    onChange={(event) =>
                      updateManual({ workName: event.target.value, title: event.target.value })
                    }
                  />
                </label>
                <label>
                  整理No
                  <input
                    value={selectedManual.controlNo ?? ''}
                    onChange={(event) => updateManual({ controlNo: event.target.value })}
                  />
                </label>
                <label>
                  品名
                  <input
                    value={selectedManual.productName ?? ''}
                    onChange={(event) => updateManual({ productName: event.target.value })}
                  />
                </label>
              </div>
              <div className="field-row three-fields">
                <label>
                  タイトル
                  <input
                    value={selectedManual.title}
                    onChange={(event) => updateManual({ title: event.target.value })}
                  />
                </label>
                <label>
                  部署
                  <input
                    value={selectedManual.department}
                    onChange={(event) => updateManual({ department: event.target.value })}
                  />
                </label>
                <label>
                  作成者
                  <input
                    value={selectedManual.owner}
                    onChange={(event) => updateManual({ owner: event.target.value })}
                  />
                </label>
              </div>
              <label>
                タグ
                <input
                  value={selectedManual.tags.join(', ')}
                  onChange={(event) =>
                    updateManual({
                      tags: event.target.value
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <section className="translation-panel">
                <div>
                  <p className="eyebrow">AI翻訳</p>
                  <h2>多言語の閲覧用テキスト</h2>
                </div>
                <div className="translation-actions">
                  <button
                    type="button"
                    onClick={() => translateManual('th')}
                    disabled={translatingLanguage !== null}
                  >
                    <Languages size={17} aria-hidden="true" />
                    {translatingLanguage === 'th' ? 'タイ語を翻訳中' : 'タイ語へ翻訳'}
                  </button>
                  <button
                    type="button"
                    onClick={() => translateManual('pt')}
                    disabled={translatingLanguage !== null}
                  >
                    <Languages size={17} aria-hidden="true" />
                    {translatingLanguage === 'pt' ? 'ポルトガル語を翻訳中' : 'ポルトガル語へ翻訳'}
                  </button>
                </div>
                <div className="translation-status" aria-live="polite">
                  <span className={selectedManual.translations?.th ? 'ready' : ''}>
                    タイ語: {selectedManual.translations?.th ? '保存済み' : '未作成'}
                  </span>
                  <span className={selectedManual.translations?.pt ? 'ready' : ''}>
                    ポルトガル語: {selectedManual.translations?.pt ? '保存済み' : '未作成'}
                  </span>
                </div>
              </section>
              <div className="section-heading">
                <h2>チャプター手順</h2>
                <button type="button" onClick={addStep}>
                  <Plus size={17} aria-hidden="true" />
                  現在位置に手順追加
                </button>
              </div>
              <div className="steps">
                {selectedManual.steps.map((step, index) => (
                  <article
                    className={`step-card ${activeStep?.id === step.id ? 'active-step' : ''}`}
                    key={step.id}
                    onClick={() => seekToStep(step)}
                  >
                    <strong>{String(index + 1).padStart(2, '0')}</strong>
                    <label>
                      時間
                      <input
                        value={step.time}
                        onChange={(event) => {
                          const steps = selectedManual.steps.map((item) =>
                            item.id === step.id ? { ...item, time: event.target.value } : item,
                          )
                          updateManual({ steps })
                        }}
                      />
                    </label>
                    <label>
                      手順名
                      <input
                        value={step.title}
                        onChange={(event) => {
                          const steps = selectedManual.steps.map((item) =>
                            item.id === step.id ? { ...item, title: event.target.value } : item,
                          )
                          updateManual({ steps })
                        }}
                      />
                    </label>
                    <label className="wide-field">
                      説明
                      <textarea
                        value={step.detail}
                        onChange={(event) => {
                          const steps = selectedManual.steps.map((item) =>
                            item.id === step.id ? { ...item, detail: event.target.value } : item,
                          )
                          updateManual({ steps })
                        }}
                      />
                    </label>
                    <section
                      className="inspection-panel step-inspection-panel"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="section-heading compact-heading">
                        <h2>この手順の検査画像</h2>
                      </div>
                      <div className="inspection-upload-grid">
                        {(['ok', 'ng', 'criteria'] as InspectionImageKind[]).map((kind) => (
                          <label className={`inspection-upload ${kind}`} key={kind}>
                            <UploadCloud size={18} aria-hidden="true" />
                            {imageKindLabels[kind]}を追加
                            <input
                              accept="image/*"
                              onChange={handleInspectionImageUpload(kind, step.id)}
                              type="file"
                            />
                          </label>
                        ))}
                      </div>
                      <div className="inspection-gallery">
                        {(step.inspectionImages ?? []).map((image) => (
                          <article className={`inspection-image ${image.kind}`} key={image.id}>
                            <img src={image.url} alt={image.name} />
                            <span>{imageKindLabels[image.kind]}</span>
                            <strong>{image.name}</strong>
                          </article>
                        ))}
                      </div>
                    </section>
                  </article>
                ))}
              </div>
              </fieldset>
            </section>
          </div>
        )}

        {view === 'approval' && (
          <div className="approval-grid">
            <section className="status-panel">
              <h2>承認ステータス</h2>
              <div className="status-flow">
                {statusFlow.map((status) => (
                  <div
                    key={status}
                    className={selectedManual.status === status ? 'current' : ''}
                  >
                    {selectedManual.status === status ? (
                      <CheckCircle2 size={18} aria-hidden="true" />
                    ) : (
                      <Clock3 size={18} aria-hidden="true" />
                    )}
                    {statusLabels[status]}
                  </div>
                ))}
              </div>
              <div className="approval-actions">
                <button type="button" onClick={submitForReview}>
                  <Send size={18} aria-hidden="true" />
                  承認依頼
                </button>
                <button type="button" onClick={approveManual}>
                  <ShieldCheck size={18} aria-hidden="true" />
                  承認する
                </button>
                <button type="button" onClick={publishManual}>
                  <Eye size={18} aria-hidden="true" />
                  公開
                </button>
              </div>
              <label className="review-comment">
                コメント・差戻し理由
                <textarea
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                  placeholder="承認時の補足、または差戻し理由を入力"
                />
              </label>
              <button className="return-action" type="button" onClick={returnToDraft}>
                <RotateCcw size={17} aria-hidden="true" />
                下書きへ差戻し
              </button>
            </section>

            <section className="review-panel">
              <h2>レビュー条件</h2>
              <div className="check-list">
                {selectedManual.checks.map((check) => (
                  <label key={check.id}>
                    <input
                      checked={check.checked}
                      type="checkbox"
                      onChange={() => toggleReviewCheck(check.id)}
                    />
                    {check.label}
                  </label>
                ))}
              </div>
              <h2>承認者</h2>
              <div className="reviewers">
                {selectedManual.reviewers.map((reviewer) => (
                  <span key={reviewer}>
                    <Users size={16} aria-hidden="true" />
                    {reviewer}
                  </span>
                ))}
              </div>
              <div className="reviewer-add">
                <input
                  value={reviewerName}
                  onChange={(event) => setReviewerName(event.target.value)}
                  placeholder="承認者名"
                />
                <button type="button" onClick={addReviewer} aria-label="承認者を追加">
                  <Plus size={18} aria-hidden="true" />
                </button>
              </div>
              <section className="history-panel">
                <h2>承認・改訂履歴</h2>
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
                  >
                    動画を再生できません
                  </video>
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
