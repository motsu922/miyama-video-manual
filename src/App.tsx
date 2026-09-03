import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Eye,
  FileVideo,
  Folder,
  GitBranch,
  Home,
  Library,
  Languages,
  Link2,
  ListChecks,
  LockKeyhole,
  Maximize2,
  MousePointer2,
  Paperclip,
  PlayCircle,
  Plus,
  Printer,
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
  X,
} from 'lucide-react'
import {
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { QRCodeSVG } from 'qrcode.react'
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
  uploadManualImage,
  uploadManualVideo,
} from './manualRepository'
import { translateManualContent } from './translationRepository'
import type { ApprovalEvent, ApprovalStatus, DecisionNode, DecisionNodeType, FlashTestResult, InspectionImage, InspectionImageKind, Manual, ManualImage, ManualLanguage, ReviewCheck, Step, VideoClip } from './types'

const emptyManual: Manual = {
  id: '',
  title: '',
  workName: '',
  controlNo: '',
  productName: '',
  department: '',
  owner: '',
  status: 'draft',
  version: 'v0.1',
  duration: '00:00',
  updatedAt: '',
  videoUrl: '',
  manualImages: [],
  thumbnail: '',
  tags: [],
  kind: 'standard',
  reviewers: [],
  checks: [],
  approvalHistory: [],
  inspectionImages: [],
  steps: [],
}

const initialManuals: Manual[] = []

const statusLabels: Record<ApprovalStatus, string> = {
  draft: '下書き',
  review: '承認待ち',
  approved: '承認済み',
  published: '公開中',
}

const statusFlow: ApprovalStatus[] = ['draft', 'review', 'approved', 'published']

const decisionNodeTypeLabels: Record<DecisionNodeType, string> = {
  question: '判断',
  action: '作業',
  end: '完了',
}

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

  return {
    ...manual,
    kind: manual.kind ?? 'standard',
    decisionNodes: manual.decisionNodes ?? [],
    manualImages: manual.manualImages ?? [],
    checks,
    approvalHistory: manual.approvalHistory ?? [],
  }
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

type DecisionFlowLayoutNode = {
  node: DecisionNode
  x: number
  y: number
}

type DecisionFlowConnectionKind = 'branch' | 'next' | 'conditional'

type DecisionFlowTarget = {
  id?: string
  label: string
  branchId?: string
  connectionKind: DecisionFlowConnectionKind
}

type DecisionFlowEdge = {
  from: DecisionFlowLayoutNode
  to: DecisionFlowLayoutNode
  label: string
  branchId?: string
  connectionKind: DecisionFlowConnectionKind
  sourceIndex: number
  sourceCount: number
  targetIndex: number
  targetCount: number
}

type DecisionSelection = {
  branchId: string
  label: string
}

type DecisionFlowEdgeGeometry = {
  startX: number
  startY: number
  turnX: number
  endX: number
  endY: number
  goesForward: boolean
}

function getDecisionTargets(node: DecisionNode, getBranchLabel?: (branchId: string) => string): DecisionFlowTarget[] {
  if (node.type === 'question') {
    return getDecisionBranches(node).map((branch) => ({
      id: branch.nextNodeId,
      label: branch.label,
      branchId: branch.id,
      connectionKind: 'branch',
    }))
  }
  if (node.type === 'action') {
    return [
      { id: node.nextNodeId, label: '', connectionKind: 'next' },
      ...(node.conditionalNext ?? []).map((condition) => ({
        id: condition.nextNodeId,
        label: `条件: ${getBranchLabel?.(condition.branchId) ?? '選択肢'}`,
        branchId: condition.branchId,
        connectionKind: 'conditional' as const,
      })),
    ]
  }
  return []
}

function getDecisionBranches(node: DecisionNode) {
  if (node.branches?.length) return node.branches
  return [
    { id: 'yes', label: 'YES', nextNodeId: node.yesNodeId },
    { id: 'no', label: 'NO', nextNodeId: node.noNodeId },
  ]
}

function buildDecisionFlowChart(nodes: DecisionNode[], startNodeId: string | null) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const branchLabels = new Map(
    nodes.flatMap((node) =>
      node.type === 'question' ? getDecisionBranches(node).map((branch) => [branch.id, branch.label] as const) : [],
    ),
  )
  const getTargets = (node: DecisionNode) =>
    getDecisionTargets(node, (branchId) => branchLabels.get(branchId) ?? '選択肢')
  const firstNodeId = startNodeId ?? nodes[0]?.id
  const depthById = new Map<string, number>()
  const queue = firstNodeId && nodeById.has(firstNodeId) ? [firstNodeId] : []
  if (firstNodeId && nodeById.has(firstNodeId)) depthById.set(firstNodeId, 0)

  for (let index = 0; index < queue.length; index += 1) {
    const node = nodeById.get(queue[index])
    if (!node) continue
    const depth = depthById.get(node.id) ?? 0
    getTargets(node).forEach((target) => {
      if (!target.id || !nodeById.has(target.id) || depthById.has(target.id)) return
      depthById.set(target.id, depth + 1)
      queue.push(target.id)
    })
  }

  // Keep every forward connection in a later column, even when multiple routes join.
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false
    nodes.forEach((node) => {
      const sourceDepth = depthById.get(node.id)
      if (sourceDepth === undefined) return
      getTargets(node).forEach((target) => {
        if (!target.id || target.id === firstNodeId || !nodeById.has(target.id)) return
        const targetDepth = sourceDepth + 1
        if ((depthById.get(target.id) ?? -1) >= targetDepth) return
        depthById.set(target.id, targetDepth)
        changed = true
      })
    })
    if (!changed) break
  }

  let fallbackDepth = Math.max(0, ...depthById.values()) + 1
  nodes.forEach((node) => {
    if (depthById.has(node.id)) return
    depthById.set(node.id, fallbackDepth)
    fallbackDepth += 1
  })

  const layers = new Map<number, DecisionNode[]>()
  nodes.forEach((node) => {
    const depth = depthById.get(node.id) ?? 0
    layers.set(depth, [...(layers.get(depth) ?? []), node])
  })
  const nodeWidth = 210
  const nodeHeight = 94
  const columnGap = 92
  const rowGap = 42
  const maxDepth = Math.max(0, ...layers.keys())
  const maxLayerSize = Math.max(1, ...[...layers.values()].map((layer) => layer.length))
  let width = Math.max(720, 80 + (maxDepth + 1) * (nodeWidth + columnGap))
  let height = Math.max(240, 60 + maxLayerSize * (nodeHeight + rowGap))
  const layoutNodes: DecisionFlowLayoutNode[] = []

  ;[...layers.entries()].sort(([left], [right]) => left - right).forEach(([depth, layer]) => {
    layer.forEach((node, index) => {
      layoutNodes.push({
        node,
        x: node.flowPosition?.x ?? 38 + depth * (nodeWidth + columnGap),
        y: node.flowPosition?.y ?? 30 + index * (nodeHeight + rowGap),
      })
    })
  })

  width = Math.max(width, ...layoutNodes.map((layoutNode) => layoutNode.x + nodeWidth + 38))
  height = Math.max(height, ...layoutNodes.map((layoutNode) => layoutNode.y + nodeHeight + 30))

  const layoutById = new Map(layoutNodes.map((item) => [item.node.id, item]))
  const rawEdges = layoutNodes.flatMap((from) => {
    const targets = getTargets(from.node).filter((target) => target.id && layoutById.has(target.id))
    return targets.flatMap((target, sourceIndex) => {
      const to = target.id ? layoutById.get(target.id) : undefined
      return to
        ? [{
            from,
            to,
            label: target.label,
            branchId: target.branchId,
            connectionKind: target.connectionKind,
            sourceIndex,
            sourceCount: targets.length,
          }]
        : []
    })
  })
  const incomingCounts = new Map<string, number>()
  rawEdges.forEach((edge) => {
    incomingCounts.set(edge.to.node.id, (incomingCounts.get(edge.to.node.id) ?? 0) + 1)
  })
  const incomingIndexes = new Map<string, number>()
  const edges: DecisionFlowEdge[] = rawEdges.map((edge) => {
    const targetIndex = incomingIndexes.get(edge.to.node.id) ?? 0
    incomingIndexes.set(edge.to.node.id, targetIndex + 1)
    return {
      ...edge,
      targetIndex,
      targetCount: incomingCounts.get(edge.to.node.id) ?? 1,
    }
  })

  return { edges, height, nodeHeight, nodeWidth, nodes: layoutNodes, width }
}

function getDecisionFlowPortOffset(index: number, count: number) {
  if (count <= 1) return 0
  const spacing = Math.min(18, 52 / (count - 1))
  return (index - (count - 1) / 2) * spacing
}

function getDecisionFlowEdgeGeometry(
  edge: DecisionFlowEdge,
  nodeWidth: number,
  nodeHeight: number,
): DecisionFlowEdgeGeometry {
  const startX = edge.from.x + nodeWidth
  const startY = edge.from.y + nodeHeight / 2 + getDecisionFlowPortOffset(edge.sourceIndex, edge.sourceCount)
  const endX = edge.to.x
  const endY = edge.to.y + nodeHeight / 2 + getDecisionFlowPortOffset(edge.targetIndex, edge.targetCount)
  const goesForward = endX > startX
  const laneOffset = getDecisionFlowPortOffset(edge.sourceIndex, edge.sourceCount) * 1.2
  const baseTurnX = goesForward ? (startX + endX) / 2 : Math.max(startX, endX) + 44
  const turnX = goesForward
    ? Math.max(startX + 24, Math.min(endX - 24, Math.round(baseTurnX + laneOffset)))
    : Math.round(baseTurnX + laneOffset)
  return { startX, startY, turnX, endX, endY, goesForward }
}

function getDistanceToDecisionEdge(
  edge: DecisionFlowEdge,
  nodeWidth: number,
  nodeHeight: number,
  point: { x: number; y: number },
) {
  const { startX, startY, turnX, endX, endY } = getDecisionFlowEdgeGeometry(edge, nodeWidth, nodeHeight)
  const segments = [
    { x1: startX, y1: startY, x2: turnX, y2: startY },
    { x1: turnX, y1: startY, x2: turnX, y2: endY },
    { x1: turnX, y1: endY, x2: endX, y2: endY },
  ]
  return Math.min(...segments.map((segment) => {
    if (segment.y1 === segment.y2) {
      const nearestX = Math.max(Math.min(segment.x1, segment.x2), Math.min(point.x, Math.max(segment.x1, segment.x2)))
      return Math.hypot(point.x - nearestX, point.y - segment.y1)
    }
    const nearestY = Math.max(Math.min(segment.y1, segment.y2), Math.min(point.y, Math.max(segment.y1, segment.y2)))
    return Math.hypot(point.x - segment.x1, point.y - nearestY)
  }))
}

function doesDecisionEdgeIntersectNode(
  edge: DecisionFlowEdge,
  nodeWidth: number,
  nodeHeight: number,
  position: { x: number; y: number },
) {
  const { startX, startY, turnX, endX, endY } = getDecisionFlowEdgeGeometry(edge, nodeWidth, nodeHeight)
  const padding = 10
  const left = position.x - padding
  const right = position.x + nodeWidth + padding
  const top = position.y - padding
  const bottom = position.y + nodeHeight + padding
  const horizontalIntersects = (x1: number, x2: number, y: number) =>
    y >= top && y <= bottom && Math.max(Math.min(x1, x2), left) <= Math.min(Math.max(x1, x2), right)
  const verticalIntersects = (x: number, y1: number, y2: number) =>
    x >= left && x <= right && Math.max(Math.min(y1, y2), top) <= Math.min(Math.max(y1, y2), bottom)
  return horizontalIntersects(startX, turnX, startY)
    || verticalIntersects(turnX, startY, endY)
    || horizontalIntersects(turnX, endX, endY)
}

function splitDecisionFlowLabel(title: string) {
  const label = title.trim() || '名称未設定'
  const maxLineLength = 12
  if (label.length <= maxLineLength) return [label]
  return [label.slice(0, maxLineLength), `${label.slice(maxLineLength, maxLineLength * 2 - 1)}...`]
}

function formatDecisionFlowEdgeLabel(label: string, sourceIndex = 0, sourceCount = 1) {
  const normalized = label.trim()
  if (!normalized) return ''
  return sourceCount > 2 ? `${sourceIndex + 1}. ${normalized}` : normalized
}

function splitDecisionFlowEdgeLabel(label: string, sourceIndex = 0, sourceCount = 1) {
  const formatted = formatDecisionFlowEdgeLabel(label, sourceIndex, sourceCount)
  const characters = Array.from(formatted)
  const maxLineLength = 16
  if (characters.length <= maxLineLength) return [formatted]
  const lines: string[] = []
  for (let index = 0; index < characters.length; index += maxLineLength) {
    lines.push(characters.slice(index, index + maxLineLength).join(''))
  }
  return lines
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
  const [selectedId, setSelectedId] = useState('')
  const [view, setView] = useState<'home' | 'edit' | 'approval' | 'library' | 'flash' | 'decision'>('home')
  const [query, setQuery] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [pendingInspectionImage, setPendingInspectionImage] = useState<PendingInspectionImage | null>(null)
  const [fullscreenViewerImage, setFullscreenViewerImage] = useState<{ src: string; alt: string } | null>(null)
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
  const [decisionNodeId, setDecisionNodeId] = useState<string | null>(null)
  const [decisionPath, setDecisionPath] = useState<string[]>([])
  const [decisionSelections, setDecisionSelections] = useState<DecisionSelection[]>([])
  const [selectedDecisionNodeId, setSelectedDecisionNodeId] = useState<string | null>(null)
  const [isDecisionEditorOpen, setIsDecisionEditorOpen] = useState(false)
  const [decisionChainTitles, setDecisionChainTitles] = useState('')
  const [decisionChainSourceId, setDecisionChainSourceId] = useState('')
  const [flowTool, setFlowTool] = useState<'select' | 'connect'>('select')
  const [isFlowPanning, setIsFlowPanning] = useState(false)
  const [connectingFromNodeId, setConnectingFromNodeId] = useState<string | null>(null)
  const [flowContextMenu, setFlowContextMenu] = useState<{
    nodeId?: string
    x: number
    y: number
    canvasX?: number
    canvasY?: number
  } | null>(null)
  const [flowEdgeMenu, setFlowEdgeMenu] = useState<{
    sourceId: string
    targetId: string
    branchId?: string
    connectionKind: DecisionFlowConnectionKind
    x: number
    y: number
  } | null>(null)
  const [decisionEditDraft, setDecisionEditDraft] = useState<DecisionNode | null>(null)
  const [copiedDecisionNode, setCopiedDecisionNode] = useState<DecisionNode | null>(null)
  const [qrManualId] = useState(() => new URLSearchParams(window.location.search).get('manual'))
  const [qrView] = useState(() => new URLSearchParams(window.location.search).get('view'))
  const [hasOpenedQrManual, setHasOpenedQrManual] = useState(false)
  const [dirtyManualIds, setDirtyManualIds] = useState<Set<string>>(new Set())
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const viewerVideoRef = useRef<HTMLVideoElement | null>(null)
  const viewerStepsRef = useRef<HTMLDivElement | null>(null)
  const resumeEditorClipRef = useRef(false)
  const resumeViewerClipRef = useRef(false)
  const pendingEditorSeekRef = useRef<number | null>(null)
  const pendingViewerSeekRef = useRef<number | null>(null)
  const annotationSvgRef = useRef<SVGSVGElement | null>(null)
  const flowchartSvgRef = useRef<SVGSVGElement | null>(null)
  const flowchartScrollRef = useRef<HTMLDivElement | null>(null)
  const flowPanRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const flowKeyboardHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {})
  const flowDragRef = useRef<{
    nodeId: string
    startX: number
    startY: number
    originX: number
    originY: number
    currentX: number
    currentY: number
    moved: boolean
  } | null>(null)
  const suppressFlowClickRef = useRef(false)
  const decisionSyncSessionsRef = useRef(new Map<string, { targetIds: string[]; propagate: boolean }>())
  const decisionUndoStackRef = useRef<DecisionNode[][]>([])
  const isUndoingDecisionRef = useRef(false)
  const pendingManualIdsRef = useRef(new Set<string>())
  const [firebaseMessage, setFirebaseMessage] = useState(
    isFirebaseConfigured
      ? 'Firebase接続を確認しています'
      : 'Firebase未設定: 接続設定を確認してください',
  )

  useEffect(() => {
    if (!fullscreenViewerImage) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreenViewerImage(null)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [fullscreenViewerImage])

  const selectedManual = manuals.find((manual) => manual.id === selectedId) ?? manuals[0] ?? emptyManual
  const selectedManualRef = useRef(selectedManual)
  selectedManualRef.current = selectedManual
  const hasUnsavedChanges = dirtyManualIds.has(selectedManual.id)
  const hasAnyUnsavedChanges = dirtyManualIds.size > 0

  const markManualDirty = (manualId: string) => {
    setDirtyManualIds((current) => {
      if (current.has(manualId)) return current
      return new Set(current).add(manualId)
    })
  }

  const markManualSaved = (manualId: string) => {
    setDirtyManualIds((current) => {
      if (!current.has(manualId)) return current
      const next = new Set(current)
      next.delete(manualId)
      return next
    })
  }

  const selectManual = (
    manualId: string,
    nextView: 'home' | 'edit' | 'approval' | 'library' | 'flash' | 'decision' =
      view === 'home' ? 'edit' : view,
  ) => {
    if (manualId === selectedManual.id) {
      setView(nextView)
      return
    }
    if (
      hasUnsavedChanges &&
      !window.confirm(`「${selectedManual.title || '名称未設定'}」に未保存の変更があります。保存せずに移動しますか？`)
    ) {
      return
    }
    setSelectedId(manualId)
    setView(nextView)
  }

  useEffect(() => {
    if (!hasAnyUnsavedChanges) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasAnyUnsavedChanges])
  const isQrViewer = Boolean(qrManualId && hasOpenedQrManual)
  const isPublished = selectedManual.status === 'published'
  const isEditingLocked = selectedManual.status !== 'draft'
  const decisionNodes = useMemo<DecisionNode[]>(
    () => selectedManual.decisionNodes ?? [],
    [selectedManual.decisionNodes],
  )
  const decisionNodeMap = useMemo(
    () => new Map(decisionNodes.map((node) => [node.id, node])),
    [decisionNodes],
  )
  const decisionBranchOptions = useMemo(
    () =>
      decisionNodes.flatMap((node) =>
        node.type === 'question'
          ? getDecisionBranches(node).map((branch) => ({ ...branch, nodeTitle: node.title || '名称未設定' }))
          : [],
      ),
    [decisionNodes],
  )
  const decisionStartNodeId = selectedManual.decisionStartNodeId ?? decisionNodes[0]?.id ?? null
  const activeDecisionNode = decisionNodeMap.get(decisionNodeId ?? decisionStartNodeId ?? '')
  const editingDecisionNode = decisionNodeMap.get(selectedDecisionNodeId ?? decisionStartNodeId ?? '')
  const flowContextNode = decisionNodeMap.get(flowContextMenu?.nodeId ?? '')
  const decisionFlowChart = useMemo(
    () => buildDecisionFlowChart(decisionNodes, decisionStartNodeId),
    [decisionNodes, decisionStartNodeId],
  )
  const manualQrUrl = useMemo(() => {
    const url = new URL(window.location.href)
    url.search = ''
    url.hash = ''
    url.searchParams.set('manual', selectedManual.id)
    if (decisionNodes.length > 0) url.searchParams.set('view', 'decision')
    return url.toString()
  }, [decisionNodes.length, selectedManual.id])
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
    let active = true
    let unsubscribe: () => void = () => {}

    setFirebaseMessage('Firebaseへ接続しています')
    void ensureSignedIn()
      .then(() => {
        if (!active) return
        unsubscribe = subscribeManuals(
          (cloudManuals) => {
            if (!active) return
            if (cloudManuals.length > 0) {
              const normalizedCloudManuals = cloudManuals.map(normalizeManual)
              const cloudManualIds = new Set(normalizedCloudManuals.map((manual) => manual.id))
              cloudManualIds.forEach((id) => pendingManualIdsRef.current.delete(id))
              setManuals((current) => {
                const pendingManuals = current.filter(
                  (manual) => pendingManualIdsRef.current.has(manual.id) && !cloudManualIds.has(manual.id),
                )
                const mergedManuals = [...pendingManuals, ...normalizedCloudManuals]
                setSelectedId((selectedId) =>
                  mergedManuals.some((manual) => manual.id === selectedId) ? selectedId : mergedManuals[0].id,
                )
                return mergedManuals
              })
              setFirebaseMessage('Firebase接続中: videoManuals を参照しています')
              return
            }
            setManuals((current) => {
              const pendingManuals = current.filter((manual) => pendingManualIdsRef.current.has(manual.id))
              setSelectedId((selectedId) =>
                pendingManuals.some((manual) => manual.id === selectedId) ? selectedId : (pendingManuals[0]?.id ?? ''),
              )
              return pendingManuals
            })
            setFirebaseMessage('Firebase接続中: 登録されたマニュアルはありません')
          },
          (message) => active && setFirebaseMessage(message),
        )
      })
      .catch((error) => {
        if (!active) return
        setFirebaseMessage(
          error instanceof Error
            ? `Firebase認証に失敗しました: ${error.message}`
            : 'Firebase認証に失敗しました',
        )
      })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    const qrManual = manuals.find((manual) => manual.id === qrManualId)
    if (hasOpenedQrManual || !qrManual) return
    setSelectedId(qrManual.id)
    setView(qrView === 'decision' || (qrManual.decisionNodes?.length ?? 0) > 0 ? 'decision' : 'library')
    setHasOpenedQrManual(true)
  }, [hasOpenedQrManual, manuals, qrManualId, qrView])

  useEffect(() => {
    setFlashCard(null)
    setFlashQueue([])
    setFlashScore(0)
    setFlashTotal(0)
    setEditorClipIndex(0)
    setViewerClipIndex(0)
    setViewerLanguage('ja')
    const manual = selectedManualRef.current
    const startNodeId = manual.decisionStartNodeId ?? manual.decisionNodes?.[0]?.id ?? null
    setDecisionNodeId(startNodeId)
    setDecisionPath(startNodeId ? [startNodeId] : [])
    setDecisionSelections([])
    setSelectedDecisionNodeId(startNodeId)
    setIsDecisionEditorOpen(false)
    decisionSyncSessionsRef.current.clear()
    setDecisionChainTitles('')
    setDecisionChainSourceId('')
    setFlowTool('select')
    setConnectingFromNodeId(null)
    setFlowContextMenu(null)
    setFlowEdgeMenu(null)
    setCopiedDecisionNode(null)
    setDecisionEditDraft(null)
    decisionUndoStackRef.current = []
  }, [selectedManual.id])

  useEffect(() => {
    let active = true
    let unsubscribe: () => void = () => {}
    setFlashResults([])

    if (!selectedManual.id) return unsubscribe

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

  const recentManuals = useMemo(
    () => [...filteredManuals].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [filteredManuals],
  )

  const homeManualGroups = useMemo(() => {
    const groups = new Map<string, Manual[]>()
    recentManuals.forEach((manual) => {
      const department = manual.department.trim() || '部署未設定'
      groups.set(department, [...(groups.get(department) ?? []), manual])
    })
    return [...groups.entries()]
      .map(([department, departmentManuals]) => ({ department, manuals: departmentManuals }))
      .sort((left, right) => {
        if (left.department === '部署未設定') return 1
        if (right.department === '部署未設定') return -1
        return left.department.localeCompare(right.department, 'ja')
      })
  }, [recentManuals])

  const homeMetrics = useMemo(
    () => ({
      total: manuals.length,
      published: manuals.filter((manual) => manual.status === 'published').length,
      review: manuals.filter((manual) => manual.status === 'review' || manual.status === 'approved').length,
      draft: manuals.filter((manual) => manual.status === 'draft').length,
    }),
    [manuals],
  )

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
    event.currentTarget.playbackRate = getClipPlaybackRate(editorClip)
    event.currentTarget.currentTime = pendingEditorSeekRef.current ?? editorClip.trimStart
    pendingEditorSeekRef.current = null
    if (resumeEditorClipRef.current) {
      resumeEditorClipRef.current = false
      void event.currentTarget.play()
    }
  }

  const handleViewerClipLoaded = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (!viewerClip) return
    event.currentTarget.playbackRate = getClipPlaybackRate(viewerClip)
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
    if (patch.decisionNodes && !isUndoingDecisionRef.current) {
      decisionUndoStackRef.current = [
        ...decisionUndoStackRef.current.slice(-99),
        JSON.parse(JSON.stringify(decisionNodes)) as DecisionNode[],
      ]
    }
    markManualDirty(selectedManual.id)
    setManuals((current) =>
      current.map((manual) =>
        manual.id === selectedManual.id
          ? { ...manual, ...patch, updatedAt: new Date().toISOString().slice(0, 10) }
          : manual,
      ),
    )
  }

  const undoDecisionChange = () => {
    const previousNodes = decisionUndoStackRef.current.pop()
    if (!previousNodes) return
    isUndoingDecisionRef.current = true
    updateManual({ decisionNodes: previousNodes })
    isUndoingDecisionRef.current = false
    setFlowContextMenu(null)
    setFlowEdgeMenu(null)
    setIsDecisionEditorOpen(false)
    setDecisionEditDraft(null)
    setFirebaseMessage('フローチャートを1つ前の状態に戻しました')
  }

  const getSameTitleNodeIds = (nodeId: string) => {
    const sourceNode = decisionNodeMap.get(nodeId)
    if (!sourceNode) return []
    const sourceTitle = sourceNode.title.trim()
    return decisionNodes
      .filter((node) => node.id !== nodeId && node.title.trim() === sourceTitle)
      .map((node) => node.id)
  }

  const finishDecisionSync = (nodeId: string, field: 'title' | 'detail') => {
    decisionSyncSessionsRef.current.delete(`${nodeId}:${field}`)
  }

  const updateDecisionNode = (nodeId: string, patch: Partial<DecisionNode>) => {
    const field = patch.title !== undefined ? 'title' : patch.detail !== undefined ? 'detail' : null
    let targetIds = [nodeId]
    if (field) {
      const sessionKey = `${nodeId}:${field}`
      let session = decisionSyncSessionsRef.current.get(sessionKey)
      if (!session) {
        const sameTitleNodeIds = getSameTitleNodeIds(nodeId)
        const propagate = sameTitleNodeIds.length > 0 && window.confirm(
          `表示内容が同じカードが${sameTitleNodeIds.length}件あります。\nほかのカードにも同じ変更を反映しますか？`,
        )
        session = { targetIds: [nodeId, ...sameTitleNodeIds], propagate }
        decisionSyncSessionsRef.current.set(sessionKey, session)
      }
      if (session.propagate) targetIds = session.targetIds
    }
    updateManual({
      decisionNodes: decisionNodes.map((node) => (targetIds.includes(node.id) ? { ...node, ...patch } : node)),
    })
  }

  const openDecisionEditor = (nodeId: string, nodeOverride?: DecisionNode) => {
    const node = nodeOverride ?? decisionNodeMap.get(nodeId)
    if (!node) return
    setSelectedDecisionNodeId(nodeId)
    setDecisionEditDraft({ ...node })
    setIsDecisionEditorOpen(true)
  }

  const closeDecisionEditor = () => {
    setDecisionEditDraft(null)
    setIsDecisionEditorOpen(false)
  }

  const commitDecisionEditor = () => {
    if (!decisionEditDraft) {
      closeDecisionEditor()
      return
    }

    const originalNode = decisionNodeMap.get(decisionEditDraft.id)
    if (!originalNode) {
      closeDecisionEditor()
      return
    }

    const patch: Partial<DecisionNode> = {
      type: decisionEditDraft.type,
      title: decisionEditDraft.title,
      detail: decisionEditDraft.detail,
    }
    const hasChanges = originalNode.type !== patch.type || originalNode.title !== patch.title || originalNode.detail !== patch.detail
    if (hasChanges) {
      const sameTitleNodeIds = getSameTitleNodeIds(originalNode.id)
      const shouldPropagate = sameTitleNodeIds.length > 0 && window.confirm(
        `表示内容が同じカードが${sameTitleNodeIds.length}件あります。\nほかのカードにも同じ変更を反映しますか？`,
      )
      const targetIds = shouldPropagate ? [originalNode.id, ...sameTitleNodeIds] : [originalNode.id]
      updateManual({
        decisionNodes: decisionNodes.map((node) => (targetIds.includes(node.id) ? { ...node, ...patch } : node)),
      })
    }
    setFirebaseMessage(hasChanges ? 'カードの編集を確定しました' : 'カードの編集内容に変更はありません')
    closeDecisionEditor()
  }

  const connectDecisionNodes = (sourceId: string, targetId: string) => {
    const sourceNode = decisionNodeMap.get(sourceId)
    if (!sourceNode || !decisionNodeMap.has(targetId) || sourceId === targetId) {
      setFirebaseMessage('別のカードを選んで接続してください')
      return
    }
    if (sourceNode.type === 'end') {
      setFirebaseMessage('完了カードからは次のカードへ接続できません')
      return
    }

    if (sourceNode.type === 'question') {
      const branches = getDecisionBranches(sourceNode)
      const emptyBranchIndex = branches.findIndex((branch) => !branch.nextNodeId)
      const nextBranches = emptyBranchIndex >= 0
        ? branches.map((branch, index) => (index === emptyBranchIndex ? { ...branch, nextNodeId: targetId } : branch))
        : [...branches, { id: `branch-${Date.now()}`, label: `選択肢 ${branches.length + 1}`, nextNodeId: targetId }]
      updateDecisionNode(sourceId, { branches: nextBranches })
    } else {
      updateDecisionNode(sourceId, { nextNodeId: targetId })
    }

    setSelectedDecisionNodeId(targetId)
    setFirebaseMessage('カードを接続しました')
  }

  const tidyDecisionFlow = () => {
    if (isEditingLocked || decisionFlowChart.nodes.length === 0) return

    const minX = Math.min(...decisionFlowChart.nodes.map((item) => item.x))
    const minY = Math.min(...decisionFlowChart.nodes.map((item) => item.y))
    const labelWidths = decisionFlowChart.edges.map((edge) => {
      const longestLine = Math.max(...splitDecisionFlowEdgeLabel(edge.label, edge.sourceIndex, edge.sourceCount).map((line) => line.length))
      return Math.min(190, Math.max(48, longestLine * 11 + 18))
    })
    const longestLabelWidth = Math.max(48, ...labelWidths)
    const forwardGaps = decisionFlowChart.edges
      .map((edge) => edge.to.x - (edge.from.x + decisionFlowChart.nodeWidth))
      .filter((gap) => gap > 0)
    const narrowestForwardGap = Math.min(...forwardGaps, Infinity)
    const horizontalScale = Number.isFinite(narrowestForwardGap)
      ? Math.min(1.2, Math.max(0.5, (longestLabelWidth + 24) / Math.max(1, narrowestForwardGap)))
      : 0.5
    const verticalScale = 1

    // 正比例で拡大するため、カード同士の左右・上下の関係は変えない。
    const nextPositions = new Map<string, { x: number; y: number }>()
    decisionFlowChart.nodes.forEach((item) => {
      nextPositions.set(item.node.id, {
        x: 38 + (item.x - minX) * horizontalScale,
        y: 30 + (item.y - minY) * verticalScale,
      })
    })

    updateManual({
      decisionNodes: decisionNodes.map((node) => ({
        ...node,
        flowPosition: nextPositions.get(node.id) ?? node.flowPosition,
      })),
    })
    setFirebaseMessage('フローチャートを整えました。必要ならUndoで元に戻せます')
  }

  const printWithMode = (mode: 'flowchart' | 'qr') => {
    document.body.dataset.printMode = mode
    window.print()
    window.setTimeout(() => {
      delete document.body.dataset.printMode
    }, 1000)
  }

  const addDecisionNodeToFlow = (sourceId: string, type: Extract<DecisionNodeType, 'question' | 'action'>) => {
    const sourceNode = decisionNodeMap.get(sourceId)
    if (!sourceNode || sourceNode.type === 'end') return

    const id = `decision-${Date.now()}`
    const createdNode: DecisionNode = {
      id,
      type,
      title: type === 'question' ? '確認する項目' : '実施する作業',
      detail: type === 'question' ? '現場で判断する条件を入力します。' : '現場で実施する内容を入力します。',
      flowPosition: {
        x: Math.max(20, (sourceNode.flowPosition?.x ?? 38) + 270),
        y: Math.max(20, (sourceNode.flowPosition?.y ?? 30) + (sourceNode.type === 'question' ? 120 : 0)),
      },
    }

    const updatedNodes = decisionNodes.map((node) => {
      if (node.id !== sourceId) return node
      if (node.type === 'question') {
        const branches = getDecisionBranches(node)
        return {
          ...node,
          branches: [...branches, { id: `branch-${Date.now()}`, label: `選択肢 ${branches.length + 1}`, nextNodeId: id }],
        }
      }
      createdNode.nextNodeId = node.nextNodeId
      return { ...node, nextNodeId: id }
    })

    updateManual({ decisionNodes: [...updatedNodes, createdNode] })
    setSelectedDecisionNodeId(id)
    setIsDecisionEditorOpen(true)
    setFirebaseMessage(type === 'question' ? '判断カードを追加しました' : '次の作業カードを追加しました')
  }

  const getFlowPoint = (clientX: number, clientY: number) => {
    const svg = flowchartSvgRef.current
    if (!svg) return null
    const bounds = svg.getBoundingClientRect()
    return {
      x: (clientX - bounds.left) * (decisionFlowChart.width / bounds.width),
      y: (clientY - bounds.top) * (decisionFlowChart.height / bounds.height),
    }
  }

  const startFlowNodeDrag = (nodeId: string, event: PointerEvent<SVGGElement>) => {
    if (isEditingLocked || flowTool !== 'select' || event.button !== 0) return
    const layoutNode = decisionFlowChart.nodes.find((item) => item.node.id === nodeId)
    const point = getFlowPoint(event.clientX, event.clientY)
    if (!layoutNode || !point) return
    suppressFlowClickRef.current = false
    flowDragRef.current = {
      nodeId,
      startX: point.x,
      startY: point.y,
      originX: layoutNode.x,
      originY: layoutNode.y,
      currentX: layoutNode.x,
      currentY: layoutNode.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const startFlowCanvasPan = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return
    const scroll = flowchartScrollRef.current
    if (!scroll) return
    flowPanRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: scroll.scrollLeft,
      scrollTop: scroll.scrollTop,
    }
    setIsFlowPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const dragFlowNode = (event: PointerEvent<SVGSVGElement>) => {
    const pan = flowPanRef.current
    const scroll = flowchartScrollRef.current
    if (pan && scroll) {
      scroll.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX)
      scroll.scrollTop = pan.scrollTop - (event.clientY - pan.startY)
      return
    }
    const drag = flowDragRef.current
    const point = getFlowPoint(event.clientX, event.clientY)
    if (!drag || !point) return
    const deltaX = point.x - drag.startX
    const deltaY = point.y - drag.startY
    if (!drag.moved && Math.abs(deltaX) + Math.abs(deltaY) < 3) return
    drag.moved = true
    suppressFlowClickRef.current = true
    drag.currentX = Math.max(20, Math.round(drag.originX + deltaX))
    drag.currentY = Math.max(20, Math.round(drag.originY + deltaY))
    updateDecisionNode(drag.nodeId, {
      flowPosition: {
        x: drag.currentX,
        y: drag.currentY,
      },
    })
  }

  const insertIndependentNodeOnEdge = (nodeId: string, edge: DecisionFlowEdge) => {
    const insertedNode = decisionNodeMap.get(nodeId)
    const sourceNode = decisionNodeMap.get(edge.from.node.id)
    if (!insertedNode || !sourceNode || insertedNode.type === 'end') return

    const updateSourceTarget = (node: DecisionNode) => {
      if (edge.connectionKind === 'branch' && edge.branchId) {
        return {
          ...node,
          branches: getDecisionBranches(node).map((branch) =>
            branch.id === edge.branchId ? { ...branch, nextNodeId: nodeId } : branch,
          ),
        }
      }
      if (edge.connectionKind === 'conditional' && edge.branchId) {
        return {
          ...node,
          conditionalNext: (node.conditionalNext ?? []).map((condition) =>
            condition.branchId === edge.branchId ? { ...condition, nextNodeId: nodeId } : condition,
          ),
        }
      }
      return { ...node, nextNodeId: nodeId }
    }

    const updateInsertedTarget = (node: DecisionNode) => {
      if (node.type === 'action') return { ...node, nextNodeId: edge.to.node.id }
      const branches = getDecisionBranches(node)
      const branchIndex = Math.max(0, branches.findIndex((branch) => !branch.nextNodeId))
      return {
        ...node,
        branches: branches.map((branch, index) =>
          index === branchIndex ? { ...branch, nextNodeId: edge.to.node.id } : branch,
        ),
      }
    }

    updateManual({
      decisionNodes: decisionNodes.map((node) => {
        if (node.id === edge.from.node.id) return updateSourceTarget(node)
        if (node.id === nodeId) return updateInsertedTarget(node)
        return node
      }),
    })
    setFirebaseMessage(`「${insertedNode.title || '名称未設定'}」をカード間に接続しました`)
  }

  const stopFlowNodeDrag = () => {
    const drag = flowDragRef.current
    flowDragRef.current = null
    if (!drag?.moved) return

    const movedNode = decisionNodeMap.get(drag.nodeId)
    if (!movedNode || movedNode.type === 'end') return
    const isIndependent = !decisionFlowChart.edges.some(
      (edge) => edge.from.node.id === drag.nodeId || edge.to.node.id === drag.nodeId,
    )
    if (!isIndependent) return

    const position = { x: drag.currentX, y: drag.currentY }
    const center = {
      x: position.x + decisionFlowChart.nodeWidth / 2,
      y: position.y + decisionFlowChart.nodeHeight / 2,
    }
    const edge = decisionFlowChart.edges
      .filter((candidate) => doesDecisionEdgeIntersectNode(
        candidate,
        decisionFlowChart.nodeWidth,
        decisionFlowChart.nodeHeight,
        position,
      ))
      .sort((left, right) =>
        getDistanceToDecisionEdge(left, decisionFlowChart.nodeWidth, decisionFlowChart.nodeHeight, center)
        - getDistanceToDecisionEdge(right, decisionFlowChart.nodeWidth, decisionFlowChart.nodeHeight, center),
      )[0]
    if (!edge) return

    const shouldConnect = window.confirm(
      `カード間に接続しますか？\n\n「${edge.from.node.title || '名称未設定'}」→「${movedNode.title || '名称未設定'}」→「${edge.to.node.title || '名称未設定'}」`,
    )
    if (shouldConnect) insertIndependentNodeOnEdge(drag.nodeId, edge)
    else setFirebaseMessage('カードの位置だけを変更し、接続は変更していません')
  }

  const stopFlowCanvasPan = () => {
    flowPanRef.current = null
    setIsFlowPanning(false)
  }

  const stopFlowPointer = () => {
    stopFlowNodeDrag()
    stopFlowCanvasPan()
  }

  const handleFlowNodeClick = (nodeId: string, fromPointer = false) => {
    if (fromPointer && suppressFlowClickRef.current) {
      suppressFlowClickRef.current = false
      return
    }
    setFlowContextMenu(null)
    setFlowEdgeMenu(null)
    if (flowTool !== 'connect' || isEditingLocked) {
      openDecisionEditor(nodeId)
      return
    }
    if (!connectingFromNodeId) {
      setConnectingFromNodeId(nodeId)
      setSelectedDecisionNodeId(nodeId)
      return
    }
    if (connectingFromNodeId === nodeId) {
      setConnectingFromNodeId(null)
      return
    }
    connectDecisionNodes(connectingFromNodeId, nodeId)
    setConnectingFromNodeId(null)
  }

  const getFlowMenuPosition = (clientX: number, clientY: number, menuWidth = 190, menuHeight = 190) => {
    const container = flowchartScrollRef.current
    if (!container) return { x: clientX + 8, y: clientY + 8 }
    const bounds = container.getBoundingClientRect()
    const minX = container.scrollLeft + 8
    const minY = container.scrollTop + 8
    const maxX = Math.max(minX, container.scrollLeft + container.clientWidth - menuWidth - 8)
    const maxY = Math.max(minY, container.scrollTop + container.clientHeight - menuHeight - 8)
    return {
      x: Math.min(maxX, Math.max(minX, clientX - bounds.left + container.scrollLeft + 8)),
      y: Math.min(maxY, Math.max(minY, clientY - bounds.top + container.scrollTop + 8)),
    }
  }

  const openFlowContextMenu = (nodeId: string, event: ReactMouseEvent<SVGGElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const svg = flowchartSvgRef.current
    const container = flowchartScrollRef.current
    if (!svg || !container || isEditingLocked) return
    const position = getFlowMenuPosition(event.clientX, event.clientY)
    setFlowEdgeMenu(null)
    setSelectedDecisionNodeId(nodeId)
    setFlowContextMenu({
      nodeId,
      ...position,
    })
  }

  const openFlowCanvasContextMenu = (event: ReactMouseEvent<SVGSVGElement>) => {
    event.preventDefault()
    const svg = flowchartSvgRef.current
    const container = flowchartScrollRef.current
    const point = getFlowPoint(event.clientX, event.clientY)
    if (!svg || !container || !point || isEditingLocked) return
    const position = getFlowMenuPosition(event.clientX, event.clientY)
    setFlowEdgeMenu(null)
    setFlowContextMenu({
      ...position,
      canvasX: point.x,
      canvasY: point.y,
    })
  }

  const openFlowEdgeMenu = (edge: DecisionFlowEdge, event: ReactMouseEvent<SVGGElement>) => {
    event.stopPropagation()
    const svg = flowchartSvgRef.current
    const container = flowchartScrollRef.current
    if (!svg || !container || isEditingLocked) return
    const position = getFlowMenuPosition(event.clientX, event.clientY, 250, 220)
    setFlowContextMenu(null)
    setFlowEdgeMenu({
      sourceId: edge.from.node.id,
      targetId: edge.to.node.id,
      branchId: edge.branchId,
      connectionKind: edge.connectionKind,
      ...position,
    })
  }

  const updateFlowEdgeTarget = (edge: NonNullable<typeof flowEdgeMenu>, nextNodeId?: string) => {
    const sourceNode = decisionNodeMap.get(edge.sourceId)
    if (!sourceNode) return

    if (edge.connectionKind === 'branch' && edge.branchId) {
      updateDecisionNode(edge.sourceId, {
        branches: getDecisionBranches(sourceNode).map((branch) =>
          branch.id === edge.branchId ? { ...branch, nextNodeId } : branch,
        ),
      })
    }
    if (edge.connectionKind === 'next') {
      updateDecisionNode(edge.sourceId, { nextNodeId })
    }
    if (edge.connectionKind === 'conditional' && edge.branchId) {
      updateDecisionNode(edge.sourceId, {
        conditionalNext: (sourceNode.conditionalNext ?? []).map((condition) =>
          condition.branchId === edge.branchId ? { ...condition, nextNodeId } : condition,
        ),
      })
    }

    setFlowEdgeMenu(null)
    setFirebaseMessage(nextNodeId ? '接続先を変更しました' : '接続を削除しました')
  }

  const handleDecisionMediaUpload = async (nodeId: string, event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter(
      (file) => file.type.startsWith('image/') || file.type.startsWith('video/'),
    )
    event.target.value = ''
    if (files.length === 0) {
      setFirebaseMessage('画像または動画ファイルを選択してください')
      return
    }

    const sameTitleNodeIds = getSameTitleNodeIds(nodeId)
    const targetNodeIds = sameTitleNodeIds.length > 0 && window.confirm(
      `表示内容が同じカードが${sameTitleNodeIds.length}件あります。\n追加する資料をほかのカードにも添付しますか？`,
    )
      ? [nodeId, ...sameTitleNodeIds]
      : [nodeId]

    setIsUploading(true)
    setFirebaseMessage(`${files.length}件のノード資料をアップロード中`)
    try {
      const uploadedAt = new Date().toISOString()
      const media = await Promise.all(
        files.map(async (file, index) => ({
          id: `decision-media-${Date.now()}-${index}`,
          kind: file.type.startsWith('image/') ? ('image' as const) : ('video' as const),
          name: file.name,
          url: file.type.startsWith('image/')
            ? await uploadManualImage(selectedManual.id, file)
            : await uploadManualVideo(selectedManual.id, file),
          uploadedAt,
        })),
      )
      const updatedNodes = decisionNodes.map((node) => {
        if (!targetNodeIds.includes(node.id)) return node
        const nodeMedia = node.id === nodeId
          ? media
          : media.map((item) => ({ ...item, id: `${item.id}-${node.id}` }))
        return { ...node, media: [...(node.media ?? []), ...nodeMedia] }
      })
      const updatedManual: Manual = {
        ...selectedManual,
        decisionNodes: updatedNodes,
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      setManuals((current) => current.map((manual) => (manual.id === selectedManual.id ? updatedManual : manual)))
      await saveManual(updatedManual)
      setFirebaseMessage(`${media.length}件のノード資料を追加しました`)
    } catch (error) {
      setFirebaseMessage(error instanceof Error ? `ノード資料のアップロード失敗: ${error.message}` : 'ノード資料のアップロードに失敗しました')
    } finally {
      setIsUploading(false)
    }
  }

  const removeDecisionMedia = async (nodeId: string, mediaId: string) => {
    const targetNode = decisionNodes.find((node) => node.id === nodeId)
    const targetMedia = targetNode?.media?.find((media) => media.id === mediaId)
    if (!targetMedia || !window.confirm(`「${targetMedia.name}」を削除しますか？`)) return

    const updatedNodes = decisionNodes.map((node) =>
      node.id === nodeId ? { ...node, media: (node.media ?? []).filter((media) => media.id !== mediaId) } : node,
    )
    const updatedManual: Manual = {
      ...selectedManual,
      decisionNodes: updatedNodes,
      updatedAt: new Date().toISOString().slice(0, 10),
    }
    setManuals((current) => current.map((manual) => (manual.id === selectedManual.id ? updatedManual : manual)))
    try {
      await saveManual(updatedManual)
      setFirebaseMessage('ノード資料を削除しました')
    } catch (error) {
      setFirebaseMessage(error instanceof Error ? `ノード資料の保存失敗: ${error.message}` : 'ノード資料の保存に失敗しました')
    }
  }

  const addDecisionNode = (
    type: DecisionNodeType,
    link?: { nodeId: string; field: 'nextNodeId' },
    flowPosition?: { x: number; y: number },
  ) => {
    const id = `decision-${Date.now()}`
    const linkSource = link ? decisionFlowChart.nodes.find((node) => node.node.id === link.nodeId) : undefined
    const nextPosition = flowPosition ?? (linkSource
      ? { x: linkSource.x + 270, y: linkSource.y }
      : {
          x: 38 + (decisionFlowChart.nodes.length % 3) * 252,
          y: 30 + Math.floor(decisionFlowChart.nodes.length / 3) * 136,
        })
    const nextNode: DecisionNode = {
      id,
      type,
      title: type === 'question' ? '確認する項目' : type === 'action' ? '実施する作業' : '手順を完了',
      detail: type === 'question' ? '現場で判断する条件を入力します。' : '現場で実施する内容を入力します。',
      flowPosition: nextPosition,
    }
    updateManual({
      decisionNodes: decisionNodes.map((node) =>
        link && node.id === link.nodeId ? { ...node, [link.field]: id } : node,
      ).concat(nextNode),
    })
    setSelectedDecisionNodeId(id)
    setIsDecisionEditorOpen(true)
  }

  const addDecisionActionChain = () => {
    const titles = decisionChainTitles
      .split(/\r?\n/)
      .map((title) => title.trim())
      .filter(Boolean)
    if (titles.length < 2) {
      setFirebaseMessage('連結する作業を2件以上、1行ずつ入力してください')
      return
    }

    const createdAt = Date.now()
    const sourceNode = decisionNodes.find((node) => node.id === decisionChainSourceId && node.type === 'action')
    const chainNodes: DecisionNode[] = titles.map((title, index) => ({
      id: `decision-chain-${createdAt}-${index}`,
      type: 'action',
      title,
      detail: '現場で実施する内容を入力します。',
      nextNodeId: index < titles.length - 1 ? `decision-chain-${createdAt}-${index + 1}` : sourceNode?.nextNodeId,
    }))
    updateManual({
      decisionNodes: decisionNodes
        .map((node) =>
          sourceNode && node.id === sourceNode.id
            ? { ...node, nextNodeId: chainNodes[0].id }
            : node,
        )
        .concat(chainNodes),
    })
    setSelectedDecisionNodeId(chainNodes[0].id)
    setIsDecisionEditorOpen(true)
    setDecisionChainTitles('')
    setFirebaseMessage(
      sourceNode
        ? `${chainNodes.length}件の作業を「${sourceNode.title || '選択した作業'}」の次へ連結しました`
        : `${chainNodes.length}件の作業を連結して追加しました`,
    )
  }

  const addDecisionBranch = (nodeId: string) => {
    const node = decisionNodeMap.get(nodeId)
    if (!node) return
    const branches = getDecisionBranches(node)
    updateDecisionNode(nodeId, {
      branches: [...branches, { id: `branch-${Date.now()}`, label: `選択肢 ${branches.length + 1}` }],
    })
  }

  const createDecisionNodeCopy = (sourceNode: DecisionNode, position: { x: number; y: number }) => {
    const createdAt = Date.now()
    return {
      ...sourceNode,
      id: `decision-copy-${createdAt}`,
      title: sourceNode.title || '名称未設定',
      sourceStepId: undefined,
      flowPosition: {
        x: position.x + 34,
        y: position.y + 34,
      },
      media: sourceNode.media?.map((media, index) => ({ ...media, id: `decision-media-copy-${createdAt}-${index}` })),
      branches: sourceNode.type === 'question'
        ? getDecisionBranches(sourceNode).map((branch, index) => ({
            ...branch,
            id: `branch-copy-${createdAt}-${index}`,
            nextNodeId: undefined,
          }))
        : undefined,
      conditionalNext: undefined,
      yesNodeId: undefined,
      noNodeId: undefined,
      nextNodeId: undefined,
    }
  }

  const duplicateDecisionNode = (nodeId: string) => {
    const sourceNode = decisionNodeMap.get(nodeId)
    const layoutNode = decisionFlowChart.nodes.find((node) => node.node.id === nodeId)
    if (!sourceNode || !layoutNode) return
    const copiedNode = createDecisionNodeCopy(sourceNode, { x: layoutNode.x, y: layoutNode.y })
    updateManual({ decisionNodes: [...decisionNodes, copiedNode] })
    setSelectedDecisionNodeId(copiedNode.id)
    setIsDecisionEditorOpen(true)
    setFirebaseMessage('カードを複製しました。接続モードで接続先を指定してください')
  }

  const copyDecisionNode = (nodeId: string) => {
    const sourceNode = decisionNodeMap.get(nodeId)
    const layoutNode = decisionFlowChart.nodes.find((node) => node.node.id === nodeId)
    if (!sourceNode || !layoutNode) return
    setCopiedDecisionNode({
      ...sourceNode,
      flowPosition: { x: layoutNode.x, y: layoutNode.y },
    })
    setFirebaseMessage('カードをコピーしました')
  }

  const pasteDecisionNode = () => {
    if (!copiedDecisionNode) {
      setFirebaseMessage('先にカードを選択してCtrl+Cでコピーしてください')
      return
    }
    const copiedNode = createDecisionNodeCopy(copiedDecisionNode, copiedDecisionNode.flowPosition ?? { x: 38, y: 30 })
    updateManual({ decisionNodes: [...decisionNodes, copiedNode] })
    setSelectedDecisionNodeId(copiedNode.id)
    setFirebaseMessage('カードを貼り付けました。必要に応じて接続先を指定してください')
  }

  const updateDecisionBranch = (
    nodeId: string,
    branchId: string,
    patch: { label?: string; nextNodeId?: string },
  ) => {
    const node = decisionNodeMap.get(nodeId)
    if (!node) return
    updateDecisionNode(nodeId, {
      branches: getDecisionBranches(node).map((branch) =>
        branch.id === branchId ? { ...branch, ...patch } : branch,
      ),
    })
  }

  const removeDecisionBranch = (nodeId: string, branchId: string) => {
    const node = decisionNodeMap.get(nodeId)
    if (!node) return
    const branches = getDecisionBranches(node)
    if (branches.length <= 2) {
      setFirebaseMessage('判断ノードには選択肢を2つ以上残してください')
      return
    }
    updateManual({
      decisionNodes: decisionNodes.map((currentNode) => {
        if (currentNode.id === nodeId) {
          return { ...currentNode, branches: branches.filter((branch) => branch.id !== branchId) }
        }
        return {
          ...currentNode,
          conditionalNext: currentNode.conditionalNext?.filter((condition) => condition.branchId !== branchId),
        }
      }),
    })
  }

  const addDecisionConditionalNext = (nodeId: string) => {
    const node = decisionNodeMap.get(nodeId)
    if (!node) return
    updateDecisionNode(nodeId, {
      conditionalNext: [...(node.conditionalNext ?? []), { branchId: '' }],
    })
  }

  const updateDecisionConditionalNext = (
    nodeId: string,
    conditionIndex: number,
    patch: { branchId?: string; nextNodeId?: string },
  ) => {
    const node = decisionNodeMap.get(nodeId)
    if (!node) return
    updateDecisionNode(nodeId, {
      conditionalNext: (node.conditionalNext ?? []).map((condition, index) =>
        index === conditionIndex ? { ...condition, ...patch } : condition,
      ),
    })
  }

  const removeDecisionConditionalNext = (nodeId: string, conditionIndex: number) => {
    const node = decisionNodeMap.get(nodeId)
    if (!node) return
    updateDecisionNode(nodeId, {
      conditionalNext: (node.conditionalNext ?? []).filter((_, index) => index !== conditionIndex),
    })
  }

  const removeDecisionNode = (nodeId: string) => {
    const removedNode = decisionNodeMap.get(nodeId)
    const removedBranchIds = new Set(
      removedNode?.type === 'question' ? getDecisionBranches(removedNode).map((branch) => branch.id) : [],
    )
    const remainingNodes = decisionNodes
      .filter((node) => node.id !== nodeId)
      .map((node) => ({
        ...node,
        yesNodeId: node.yesNodeId === nodeId ? undefined : node.yesNodeId,
        noNodeId: node.noNodeId === nodeId ? undefined : node.noNodeId,
        nextNodeId: node.nextNodeId === nodeId ? undefined : node.nextNodeId,
        branches: node.branches?.map((branch) =>
          branch.nextNodeId === nodeId ? { ...branch, nextNodeId: undefined } : branch,
        ),
        conditionalNext: node.conditionalNext?.filter((condition) => !removedBranchIds.has(condition.branchId)),
      }))
    updateManual({
      decisionNodes: remainingNodes,
      decisionStartNodeId:
        selectedManual.decisionStartNodeId === nodeId ? remainingNodes[0]?.id : selectedManual.decisionStartNodeId,
    })
    if (decisionNodeId === nodeId) {
      setDecisionNodeId(remainingNodes[0]?.id ?? null)
      setDecisionPath(remainingNodes[0] ? [remainingNodes[0].id] : [])
    }
    if (selectedDecisionNodeId === nodeId) {
      setSelectedDecisionNodeId(remainingNodes[0]?.id ?? null)
      closeDecisionEditor()
    }
  }

  flowKeyboardHandlerRef.current = (event) => {
    if (view !== 'edit') return
    if (event.key === 'Escape' && isDecisionEditorOpen) {
      event.preventDefault()
      closeDecisionEditor()
      return
    }
    if (isEditingLocked) return
    const target = event.target
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"]'))
    ) return

    const shortcutKey = event.key.toLowerCase()
    if ((event.ctrlKey || event.metaKey) && !event.altKey && shortcutKey === 'c' && selectedDecisionNodeId) {
      event.preventDefault()
      copyDecisionNode(selectedDecisionNodeId)
      return
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && shortcutKey === 'v') {
      event.preventDefault()
      pasteDecisionNode()
      return
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && shortcutKey === 'z') {
      event.preventDefault()
      undoDecisionChange()
      return
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedDecisionNodeId) {
      event.preventDefault()
      removeDecisionNode(selectedDecisionNodeId)
    }
  }

  useEffect(() => {
    const handleFlowKeyboardShortcut = (event: KeyboardEvent) => flowKeyboardHandlerRef.current(event)
    window.addEventListener('keydown', handleFlowKeyboardShortcut)
    return () => window.removeEventListener('keydown', handleFlowKeyboardShortcut)
  }, [])

  const resetDecisionReview = () => {
    setDecisionNodeId(decisionStartNodeId)
    setDecisionPath(decisionStartNodeId ? [decisionStartNodeId] : [])
    setDecisionSelections([])
  }

  const goBackDecisionStep = () => {
    if (decisionPath.length <= 1) return
    const previousPath = decisionPath.slice(0, -1)
    const previousNodeId = previousPath.at(-1) ?? null
    const retainedSelections = previousPath
      .slice(0, -1)
      .filter((nodeId) => decisionNodeMap.get(nodeId)?.type === 'question').length
    setDecisionNodeId(previousNodeId)
    setDecisionPath(previousPath)
    setDecisionSelections((current) => current.slice(0, retainedSelections))
  }

  const advanceDecision = (nextNodeId?: string, selection?: DecisionSelection) => {
    if (!nextNodeId || !decisionNodeMap.has(nextNodeId)) {
      setFirebaseMessage('次に進む分岐先を設定してください')
      return
    }
    setDecisionNodeId(nextNodeId)
    setDecisionPath((current) => [...current, nextNodeId])
    if (selection) setDecisionSelections((current) => [...current, selection])
  }

  const getDecisionActionNext = (node: DecisionNode) => {
    const condition = [...decisionSelections]
      .reverse()
      .map((selection) => ({ selection, condition: node.conditionalNext?.find((item) => item.branchId === selection.branchId) }))
      .find((match) => Boolean(match.condition?.nextNodeId))
    return {
      nextNodeId: condition?.condition?.nextNodeId ?? node.nextNodeId,
      matchedSelection: condition?.selection,
    }
  }

  const copyManualQrLink = async () => {
    try {
      await navigator.clipboard.writeText(manualQrUrl)
      setFirebaseMessage('現場掲示用のQRリンクをコピーしました')
    } catch {
      setFirebaseMessage('リンクをコピーできませんでした。QRコードを読み取って利用してください')
    }
  }

  const persistSelectedManual = async () => {
    const latest = manuals.find((manual) => manual.id === selectedManual.id)
    if (!latest) return

    try {
      await saveManual(latest)
      markManualSaved(latest.id)
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

  const handleManualImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'))
    event.target.value = ''
    if (files.length === 0) {
      setFirebaseMessage('画像ファイルを選択してください')
      return
    }

    setIsUploading(true)
    setFirebaseMessage(`${files.length}枚の写真をアップロード中`)
    try {
      const uploadedImages = await Promise.all(
        files.map(async (file, index): Promise<ManualImage> => ({
          id: `manual-image-${Date.now()}-${index}`,
          name: file.name,
          url: await uploadManualImage(selectedManual.id, file),
          uploadedAt: new Date().toISOString(),
        })),
      )
      const updatedManual: Manual = {
        ...selectedManual,
        manualImages: [...(selectedManual.manualImages ?? []), ...uploadedImages],
        thumbnail: selectedManual.videoUrl ? selectedManual.thumbnail : uploadedImages[0].url,
        updatedAt: new Date().toISOString().slice(0, 10),
      }
      setManuals((current) =>
        current.map((manual) => (manual.id === selectedManual.id ? updatedManual : manual)),
      )
      await saveManual(updatedManual)
      setFirebaseMessage(`${uploadedImages.length}枚の写真を追加しました`)
    } catch (error) {
      setFirebaseMessage(error instanceof Error ? `写真アップロード失敗: ${error.message}` : '写真アップロードに失敗しました')
    } finally {
      setIsUploading(false)
    }
  }

  const removeManualImage = async (imageId: string) => {
    const targetImage = selectedManual.manualImages?.find((image) => image.id === imageId)
    if (!targetImage || !window.confirm(`「${targetImage.name}」を削除しますか？`)) return

    const manualImages = (selectedManual.manualImages ?? []).filter((image) => image.id !== imageId)
    const updatedManual: Manual = {
      ...selectedManual,
      manualImages,
      thumbnail: selectedManual.thumbnail === targetImage.url ? (manualImages[0]?.url ?? '') : selectedManual.thumbnail,
      updatedAt: new Date().toISOString().slice(0, 10),
    }
    setManuals((current) =>
      current.map((manual) => (manual.id === selectedManual.id ? updatedManual : manual)),
    )
    try {
      await saveManual(updatedManual)
      markManualSaved(updatedManual.id)
      setFirebaseMessage('写真を削除しました')
    } catch (error) {
      setFirebaseMessage(error instanceof Error ? `写真の削除失敗: ${error.message}` : '写真の削除に失敗しました')
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

  const removeInspectionImage = async (stepId: number, imageId: string) => {
    const step = selectedManual.steps.find((item) => item.id === stepId)
    const targetImage = step?.inspectionImages?.find((image) => image.id === imageId)
    if (!targetImage || !window.confirm(`「${targetImage.name}」を削除しますか？`)) return

    const updatedManual: Manual = {
      ...selectedManual,
      steps: selectedManual.steps.map((item) =>
        item.id === stepId
          ? { ...item, inspectionImages: (item.inspectionImages ?? []).filter((image) => image.id !== imageId) }
          : item,
      ),
      updatedAt: new Date().toISOString().slice(0, 10),
    }
    setManuals((current) =>
      current.map((manual) => (manual.id === selectedManual.id ? updatedManual : manual)),
    )
    try {
      await saveManual(updatedManual)
      markManualSaved(updatedManual.id)
      setFirebaseMessage('検査画像を削除しました')
    } catch (error) {
      setFirebaseMessage(error instanceof Error ? `検査画像の削除失敗: ${error.message}` : '検査画像の削除に失敗しました')
    }
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

  const addStepToDecisionFlow = (step: Step) => {
    if (isEditingLocked) return

    const existingNode = decisionNodes.find((node) => node.sourceStepId === step.id)
    if (existingNode) {
      updateManual({
        decisionNodes: decisionNodes.map((node) =>
          node.id === existingNode.id
            ? { ...node, title: step.title || '名称未設定の作業', detail: step.detail }
            : node,
        ),
      })
      setSelectedDecisionNodeId(existingNode.id)
      setFirebaseMessage(`「${step.title || '名称未設定の作業'}」をフローチャートへ更新しました`)
      return
    }

    const lowestNodeY = Math.max(
      -110,
      ...decisionFlowChart.nodes.map((item) => item.y),
    )
    const node: DecisionNode = {
      id: `decision-step-${step.id}-${Date.now()}`,
      type: 'action',
      title: step.title || '名称未設定の作業',
      detail: step.detail,
      sourceStepId: step.id,
      flowPosition: {
        x: 38,
        y: lowestNodeY + decisionFlowChart.nodeHeight + 38,
      },
    }
    updateManual({
      decisionNodes: [...decisionNodes, node],
      decisionStartNodeId: decisionStartNodeId ?? node.id,
    })
    setSelectedDecisionNodeId(node.id)
    setFirebaseMessage(`「${node.title}」をフローチャートへ追加しました`)
  }

  const removeStep = (stepId: number) => {
    if (isEditingLocked || selectedManual.steps.length <= 1) return

    updateManual({ steps: selectedManual.steps.filter((step) => step.id !== stepId) })
    setFirebaseMessage('手順を削除しました。Firebaseへ保存すると反映されます。')
  }

  const saveWorkflowManual = async (manual: Manual, message: string) => {
    pendingManualIdsRef.current.add(manual.id)
    setManuals((current) => {
      const exists = current.some((item) => item.id === manual.id)
      return exists
        ? current.map((item) => (item.id === manual.id ? manual : item))
        : [manual, ...current]
    })
    try {
      await saveManual(manual)
      markManualSaved(manual.id)
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
      decisionNodes.length === 0 && selectedManual.steps.length === 0 && 'フローチャートまたは手順',
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

  const toggleManualVisibility = async () => {
    const shouldPublish = !isPublished
    if (
      shouldPublish &&
      !window.confirm('承認ワークフローを省略して、この手順書を現場公開しますか？')
    ) {
      return
    }

    const event = createApprovalEvent(shouldPublish ? 'published' : 'revision', selectedManual.owner)
    await saveWorkflowManual(
      {
        ...selectedManual,
        status: shouldPublish ? 'published' : 'draft',
        updatedAt: new Date().toISOString().slice(0, 10),
        approvalHistory: [...(selectedManual.approvalHistory ?? []), event],
      },
      shouldPublish ? '承認を省略して現場公開しました' : '下書きへ切り替えました。編集を再開できます',
    )
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
    if (!isPublished) return
    if (!viewerClip) {
      viewerStepsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
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
      setCurrentVideoTime(parseStepTime(step.time))
      viewerStepsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
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
      title: '',
      workName: '',
      controlNo: '',
      productName: '',
      department: '',
      owner: '',
      status: 'draft',
      version: 'v0.1',
      duration: '00:00',
      updatedAt: new Date().toISOString().slice(0, 10),
      videoUrl: '',
      manualImages: [],
      thumbnail: '',
      tags: [],
      kind: 'standard',
      decisionNodes: [],
      reviewers: [],
      checks: [],
      approvalHistory: [
        { id: `created-${id}`, action: 'created', actor: '作成者', createdAt: new Date().toISOString() },
      ],
      inspectionImages: [],
      steps: [],
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
      manualImages: selectedManual.manualImages?.map((image) => ({ ...image })),
      decisionNodes: selectedManual.decisionNodes?.map((node) => ({ ...node })),
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
      setSelectedId(remainingManuals[0]?.id ?? '')
      setView('edit')
      setFirebaseMessage(`マニュアルを削除しました: ${selectedManual.id}`)
    } catch (error) {
      setFirebaseMessage(error instanceof Error ? error.message : 'マニュアルの削除に失敗しました')
    }
  }

  return (
    <main className={`app-shell ${isQrViewer ? 'qr-viewer-shell' : ''} ${view === 'home' ? 'home-shell' : ''}`}>
      <aside className="sidebar" aria-label="動画マニュアル一覧">
        <div className="brand">
          <img src={miyamaLogo} alt="MIYAMA" />
          <span>動画マニュアル</span>
        </div>

        <button
          className={`sidebar-home-action ${view === 'home' ? 'active' : ''}`}
          type="button"
          onClick={() => setView('home')}
        >
          <Home size={18} aria-hidden="true" />
          ホーム
        </button>

        <button className="primary-action" type="button" onClick={createManual}>
          <Plus size={18} aria-hidden="true" />
          新規手順書
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
              className={`manual-item ${view !== 'home' && manual.id === selectedManual.id ? 'active' : ''}`}
              key={manual.id}
              type="button"
              onClick={() => selectManual(manual.id)}
            >
              {manual.thumbnail ? (
                <img src={manual.thumbnail} alt="" />
              ) : (
                <span className="manual-thumbnail-empty" aria-hidden="true">
                  <FileVideo size={18} />
                </span>
              )}
              <span>
                <strong>{manual.title}</strong>
                <small>
                  {manual.department} / {statusLabels[manual.status]}
                </small>
                {dirtyManualIds.has(manual.id) && <em className="manual-unsaved">未保存</em>}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="workspace">
        {view === 'home' ? (
          <header className="home-topbar">
            <div>
              <p className="eyebrow">ミヤマ工業動画マニュアル</p>
              <h1>手順書ホーム</h1>
              <p>作業を選んで閲覧するか、手順書の作成・改訂を開始します。</p>
            </div>
            <button className="home-create-button" type="button" onClick={createManual}>
              <Plus size={18} aria-hidden="true" />
              新規手順書
            </button>
          </header>
        ) : (
          <header className="topbar">
            <div>
              <p className="eyebrow">Firebase project: miyamaunitec-fb87a</p>
              <div className="manual-title-row">
                <h1>{selectedManual.title || '名称未設定の手順書'}</h1>
                {decisionNodes.length > 0 && <span className="abnormal-badge">フローチャート</span>}
              </div>
            </div>
            <div className="manual-actions">
              {!isPublished && (
                <button
                  className="visibility-toggle-button to-published"
                  type="button"
                  onClick={() => void toggleManualVisibility()}
                >
                  <Eye size={17} aria-hidden="true" />
                  公開に切替
                </button>
              )}
              <button
                className={`manual-save-button ${hasUnsavedChanges ? 'needs-save' : ''}`}
                disabled={isEditingLocked}
                type="button"
                onClick={persistSelectedManual}
              >
                <Save size={17} aria-hidden="true" />
                手順書を保存
              </button>
              <span className={`top-save-status ${hasUnsavedChanges ? 'unsaved' : 'saved'}`} aria-live="polite">
                {hasUnsavedChanges ? '未保存' : '保存済み'}
              </span>
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
              <button
                className={view === 'decision' ? 'selected' : ''}
                onClick={() => setView('decision')}
              >
                <GitBranch size={17} aria-hidden="true" />
                フロー閲覧
              </button>
            </nav>
          </header>
        )}

        {view === 'home' && (
          <div className="home-view">
            <section className="home-metrics" aria-label="手順書の登録状況">
              <div>
                <span>すべて</span>
                <strong>{homeMetrics.total}</strong>
              </div>
              <div>
                <span>公開中</span>
                <strong>{homeMetrics.published}</strong>
              </div>
              <div>
                <span>確認・承認中</span>
                <strong>{homeMetrics.review}</strong>
              </div>
              <div>
                <span>作成・改訂中</span>
                <strong>{homeMetrics.draft}</strong>
              </div>
            </section>

            <section className="home-library" aria-labelledby="home-library-title">
              <header>
                <div>
                  <p className="eyebrow">手順書一覧</p>
                  <h2 id="home-library-title">作業を選択</h2>
                </div>
                <label className="home-search-box">
                  <Search size={18} aria-hidden="true" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="作業名、整理No、品名、部署で検索"
                  />
                </label>
              </header>

              {recentManuals.length > 0 ? (
                <div className="home-department-groups">
                  {homeManualGroups.map((group, groupIndex) => (
                    <details
                      className="home-department-folder"
                      key={group.department}
                      open={query.trim().length > 0 || groupIndex === 0}
                    >
                      <summary>
                        <span className="home-folder-icon" aria-hidden="true">
                          <Folder size={20} />
                        </span>
                        <strong>{group.department}</strong>
                        <small>{group.manuals.length} 件</small>
                        <ChevronDown className="home-folder-chevron" size={19} aria-hidden="true" />
                      </summary>
                      <div className="home-manual-grid">
                        {group.manuals.map((manual) => (
                          <article className="home-manual-card" key={manual.id}>
                            <div className="home-manual-preview">
                              {manual.thumbnail ? (
                                <img src={manual.thumbnail} alt="" />
                              ) : (
                                <span aria-hidden="true">
                                  <GitBranch size={34} />
                                </span>
                              )}
                              <b className={`home-status status-${manual.status}`}>{statusLabels[manual.status]}</b>
                            </div>
                            <div className="home-manual-content">
                              <div>
                                <h3>{manual.title || manual.workName || '名称未設定の手順書'}</h3>
                                <p>{manual.productName || '品名未設定'}</p>
                              </div>
                              <dl>
                                <div>
                                  <dt>整理No</dt>
                                  <dd>{manual.controlNo || '-'}</dd>
                                </div>
                                <div>
                                  <dt>部署</dt>
                                  <dd>{manual.department || '-'}</dd>
                                </div>
                                <div>
                                  <dt>更新日</dt>
                                  <dd>{manual.updatedAt || '-'}</dd>
                                </div>
                              </dl>
                              <div className="home-manual-actions">
                                <button type="button" onClick={() => selectManual(manual.id, 'edit')}>
                                  <FileVideo size={17} aria-hidden="true" />
                                  編集
                                </button>
                                <button
                                  className="primary-view"
                                  type="button"
                                  onClick={() =>
                                    selectManual(
                                      manual.id,
                                      (manual.decisionNodes?.length ?? 0) > 0 ? 'decision' : 'library',
                                    )
                                  }
                                >
                                  <Eye size={17} aria-hidden="true" />
                                  閲覧
                                </button>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="home-empty-state">
                  <GitBranch size={36} aria-hidden="true" />
                  <h2>{manuals.length > 0 ? '条件に一致する手順書がありません' : '最初の手順書を作成します'}</h2>
                  <p>{manuals.length > 0 ? '検索条件を変えてください。' : 'フローチャートに作業と判断を並べて作成できます。'}</p>
                  {manuals.length === 0 && (
                    <button type="button" onClick={createManual}>
                      <Plus size={18} aria-hidden="true" />
                      新規手順書
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}

        {view === 'edit' && (
          <div className="editor-grid">
            <section className="video-panel">
              <div className="video-frame">
                {editorClip ? (
                  <div className="video-effect-stage">
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
                      style={getClipVideoStyle(editorClip)}
                    >
                      動画を再生できません
                    </video>
                    {editorClip.spotlight && (
                      <div aria-hidden="true" className="video-spotlight" style={getSpotlightStyle(editorClip)} />
                    )}
                    {editorClip.caption && (
                      <div className={`video-caption ${editorClip.captionPosition ?? 'bottom'}`}>
                        {editorClip.caption}
                      </div>
                    )}
                  </div>
                ) : (
                  selectedManual.thumbnail ? (
                    <>
                      <img
                        src={selectedManual.thumbnail}
                        alt={`${selectedManual.title}のサムネイル`}
                      />
                      <button type="button" className="play-button" aria-label="動画を再生">
                        <PlayCircle size={54} aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <div className="video-empty-state">
                      <FileVideo size={34} aria-hidden="true" />
                      <span>動画・写真は未登録です</span>
                    </div>
                  )
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
                <label className="upload-control secondary-upload">
                  <UploadCloud size={18} aria-hidden="true" />
                  写真を追加
                  <input
                    accept="image/*"
                    disabled={isUploading || isEditingLocked}
                    multiple
                    onChange={handleManualImageUpload}
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
                <button
                  className={hasUnsavedChanges ? 'save-button needs-save' : 'save-button'}
                  disabled={isEditingLocked}
                  type="button"
                  onClick={persistSelectedManual}
                >
                  <Save size={18} aria-hidden="true" />
                  Firebaseへ保存
                </button>
                <span className={`save-state ${hasUnsavedChanges ? 'unsaved' : 'saved'}`} aria-live="polite">
                  {hasUnsavedChanges ? '未保存の変更あり' : '保存済み'}
                </span>
              </div>
              {(selectedManual.manualImages?.length ?? 0) > 0 && (
                <section className="manual-image-panel">
                  <div className="section-heading compact-heading">
                    <h2>作業写真</h2>
                    <span>{selectedManual.manualImages?.length ?? 0} 枚</span>
                  </div>
                  <div className="manual-image-gallery">
                    {(selectedManual.manualImages ?? []).map((image) => (
                      <article key={image.id}>
                        <img src={image.url} alt={image.name} />
                        <strong>{image.name}</strong>
                        <button
                          aria-label={`${image.name}を削除`}
                          disabled={isEditingLocked}
                          title="写真を削除"
                          type="button"
                          onClick={() => void removeManualImage(image.id)}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              )}
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
                        <section className="clip-effect-controls" aria-label={`${clip.name} の演出設定`}>
                          <label>
                            拡大
                            <select
                              disabled={isEditingLocked}
                              value={clip.zoom ?? 1}
                              onChange={(event) => updateClip(clip.id, { zoom: Number(event.target.value) })}
                            >
                              <option value="1">なし</option>
                              <option value="1.2">1.2倍</option>
                              <option value="1.5">1.5倍</option>
                              <option value="2">2倍</option>
                            </select>
                          </label>
                          <label>
                            再生速度
                            <select
                              disabled={isEditingLocked}
                              value={getClipPlaybackRate(clip)}
                              onChange={(event) => updateClip(clip.id, { playbackRate: Number(event.target.value) })}
                            >
                              <option value="1">標準</option>
                              <option value="0.75">0.75倍</option>
                              <option value="0.5">0.5倍</option>
                            </select>
                          </label>
                          <label className="spotlight-toggle">
                            <input
                              checked={clip.spotlight ?? false}
                              disabled={isEditingLocked}
                              type="checkbox"
                              onChange={(event) => updateClip(clip.id, { spotlight: event.target.checked })}
                            />
                            スポットで強調
                          </label>
                          <div className="focus-picker" aria-label="拡大とスポットの注視位置">
                            <span>注視位置</span>
                            <div>
                              {clipFocusPoints.map((point) => {
                                const focus = getClipFocus(clip)
                                const isSelected = focus.x === point.x && focus.y === point.y
                                return (
                                  <button
                                    aria-label={point.label}
                                    className={isSelected ? 'selected-focus' : ''}
                                    disabled={isEditingLocked}
                                    key={point.label}
                                    title={point.label}
                                    type="button"
                                    onClick={() => updateClip(clip.id, { focusX: point.x, focusY: point.y })}
                                  />
                                )
                              })}
                            </div>
                          </div>
                          <label className="caption-input">
                            テロップ
                            <input
                              disabled={isEditingLocked}
                              maxLength={60}
                              placeholder="例: ボルトの締付状態を確認"
                              value={clip.caption ?? ''}
                              onChange={(event) => updateClip(clip.id, { caption: event.target.value })}
                            />
                          </label>
                          <label>
                            テロップ位置
                            <select
                              disabled={isEditingLocked}
                              value={clip.captionPosition ?? 'bottom'}
                              onChange={(event) =>
                                updateClip(clip.id, {
                                  captionPosition: event.target.value as 'top' | 'center' | 'bottom',
                                })
                              }
                            >
                              <option value="top">上</option>
                              <option value="center">中央</option>
                              <option value="bottom">下</option>
                            </select>
                          </label>
                        </section>
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
                <h2>基本情報</h2>
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
              </fieldset>
            </section>

            <section className={`chapter-panel ${isEditingLocked ? 'locked-panel' : ''}`}>
              <fieldset className="editor-fieldset" disabled={isEditingLocked}>
              <div className="section-heading">
                <h2>チャプター手順</h2>
                <button disabled={isEditingLocked} type="button" onClick={addStep}>
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
                    <button
                      aria-label={`手順 ${index + 1} を削除`}
                      className="step-delete"
                      disabled={isEditingLocked || selectedManual.steps.length <= 1}
                      title="手順を削除"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        removeStep(step.id)
                      }}
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
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
                    <div className="step-flow-action" onClick={(event) => event.stopPropagation()}>
                      <button
                        className={decisionNodes.some((node) => node.sourceStepId === step.id) ? 'linked' : ''}
                        disabled={isEditingLocked}
                        type="button"
                        onClick={() => addStepToDecisionFlow(step)}
                      >
                        <GitBranch size={17} aria-hidden="true" />
                        {decisionNodes.some((node) => node.sourceStepId === step.id)
                          ? 'フローを更新'
                          : 'フローへ追加'}
                      </button>
                    </div>
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
                            <button
                              aria-label={`${image.name}を削除`}
                              className="inspection-image-delete"
                              disabled={isEditingLocked}
                              title="検査画像を削除"
                              type="button"
                              onClick={() => void removeInspectionImage(step.id, image.id)}
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </article>
                        ))}
                      </div>
                    </section>
                  </article>
                ))}
              </div>
              </fieldset>
            </section>
            <section className={`decision-authoring ${isEditingLocked ? 'locked-panel' : ''}`}>
                <header className="decision-section-header">
                  <div>
                    <p className="eyebrow">手順フロー</p>
                    <h2>フローチャートで作成</h2>
                  </div>
                </header>
                <details className="decision-advanced-tools">
                  <summary>応用: 複数の作業をまとめて連結</summary>
                  <section className="decision-chain-builder" aria-label="連続する作業の一括登録">
                    <div>
                      <p className="eyebrow">連続登録</p>
                      <h3>複数の作業を連結して追加</h3>
                    </div>
                    <label>
                      連結元の作業（任意）
                      <select
                        disabled={isEditingLocked}
                        value={decisionChainSourceId}
                        onChange={(event) => setDecisionChainSourceId(event.target.value)}
                      >
                        <option value="">新しい連結チェーンとして追加</option>
                        {decisionNodes.filter((node) => node.type === 'action').map((node) => (
                          <option key={node.id} value={node.id}>{node.title || '名称未設定'}</option>
                        ))}
                      </select>
                    </label>
                    <label className="decision-chain-titles">
                      連結する作業
                      <textarea
                        disabled={isEditingLocked}
                        placeholder={'作業を1行ずつ入力\n例: 対象品を準備\n例: 設備を確認\n例: 作業結果を記録'}
                        value={decisionChainTitles}
                        onChange={(event) => setDecisionChainTitles(event.target.value)}
                      />
                    </label>
                    <button
                      disabled={isEditingLocked || decisionChainTitles.split(/\r?\n/).filter((title) => title.trim()).length < 2}
                      type="button"
                      onClick={addDecisionActionChain}
                    >
                      <GitBranch size={16} aria-hidden="true" />
                      連結して追加
                    </button>
                  </section>
                </details>
                <section className="decision-flowchart" id="decision-flowchart-print" aria-label="手順フロー図">
                  <div className="flowchart-print-header" aria-hidden="true">
                    <div>
                      <p>ミヤマ工業動画マニュアル</p>
                      <h1>{selectedManual.title || '名称未設定の手順書'}</h1>
                    </div>
                    {selectedManual.thumbnail && (
                      <img src={selectedManual.thumbnail} alt="" />
                    )}
                  </div>
                  <div className="decision-flowchart-heading">
                    <p className="eyebrow">フローチャート</p>
                    <div className="decision-flowchart-tools">
                      <span>{decisionNodes.length} ノード</span>
                      <div className="decision-flow-tool-group">
                        <button
                          disabled={isEditingLocked || decisionUndoStackRef.current.length === 0}
                          title="フローチャートの変更を1つ戻す（Ctrl+Z）"
                          type="button"
                          onClick={undoDecisionChange}
                        >
                          <RotateCcw size={16} aria-hidden="true" />
                          元に戻す
                        </button>
                        <button
                          disabled={isEditingLocked || decisionFlowChart.nodes.length === 0}
                          title="現在の配置順をベースにカードと矢印を整列"
                          type="button"
                          onClick={tidyDecisionFlow}
                        >
                          <ListChecks size={16} aria-hidden="true" />
                          整える
                        </button>
                        <button
                          className={flowTool === 'select' ? 'active' : ''}
                          title="カードをドラッグして移動"
                          type="button"
                          onClick={() => {
                            setFlowTool('select')
                            setConnectingFromNodeId(null)
                          }}
                        >
                          <MousePointer2 size={16} aria-hidden="true" />
                          移動
                        </button>
                        <button
                          className={flowTool === 'connect' ? 'active' : ''}
                          disabled={isEditingLocked}
                          title="接続する2枚のカードを順に選択"
                          type="button"
                          onClick={() => {
                            setFlowTool('connect')
                            setConnectingFromNodeId(null)
                          }}
                        >
                          <Link2 size={16} aria-hidden="true" />
                          つなぐ
                        </button>
                      </div>
                      <div className="decision-flow-tool-group add-cards">
                        <button disabled={isEditingLocked} title="判断カードを追加" type="button" onClick={() => addDecisionNode('question')}>
                          <GitBranch size={16} aria-hidden="true" />
                          判断
                        </button>
                        <button disabled={isEditingLocked} title="作業カードを追加" type="button" onClick={() => addDecisionNode('action')}>
                          <Plus size={16} aria-hidden="true" />
                          作業
                        </button>
                        <button disabled={isEditingLocked} title="完了カードを追加" type="button" onClick={() => addDecisionNode('end')}>
                          <CheckCircle2 size={16} aria-hidden="true" />
                          完了
                        </button>
                      </div>
                      <button
                        className="print-flowchart-button"
                        title="フローチャートを印刷またはPDF保存"
                        type="button"
                        onClick={() => printWithMode('flowchart')}
                      >
                        <Printer size={16} aria-hidden="true" />
                        印刷 / PDF
                      </button>
                    </div>
                  </div>
                  <div className={`decision-flowchart-scroll ${isFlowPanning ? 'panning' : ''}`} ref={flowchartScrollRef}>
                    <svg
                      aria-label="判断と作業のフローチャート"
                      height={decisionFlowChart.height}
                      ref={flowchartSvgRef}
                      role="img"
                      viewBox={`0 0 ${decisionFlowChart.width} ${decisionFlowChart.height}`}
                      width={decisionFlowChart.width}
                      onClick={() => {
                        setFlowContextMenu(null)
                        setFlowEdgeMenu(null)
                        if (flowTool === 'connect') setConnectingFromNodeId(null)
                      }}
                      onContextMenu={(event) => {
                        openFlowCanvasContextMenu(event)
                      }}
                      onPointerDown={startFlowCanvasPan}
                      onPointerMove={dragFlowNode}
                      onPointerLeave={stopFlowPointer}
                      onPointerUp={stopFlowPointer}
                    >
                      <defs>
                        <marker id="decision-flow-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                          <path d="M 0 0 L 8 4 L 0 8 z" />
                        </marker>
                        <marker id="decision-flow-arrow-yes" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                          <path d="M 0 0 L 8 4 L 0 8 z" fill="#15803d" />
                        </marker>
                        <marker id="decision-flow-arrow-no" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                          <path d="M 0 0 L 8 4 L 0 8 z" fill="#b91c1c" />
                        </marker>
                      </defs>
                      {decisionFlowChart.edges.map((edge) => {
                        const { startX, startY, turnX, endX, endY, goesForward } = getDecisionFlowEdgeGeometry(
                          edge,
                          decisionFlowChart.nodeWidth,
                          decisionFlowChart.nodeHeight,
                        )
                        const markerId = edge.label === 'YES'
                          ? 'decision-flow-arrow-yes'
                          : edge.label === 'NO'
                            ? 'decision-flow-arrow-no'
                            : 'decision-flow-arrow'
                        const edgePath = `M ${startX} ${startY} H ${turnX} V ${endY} H ${endX}`
                        const edgeLabelLines = splitDecisionFlowEdgeLabel(edge.label, edge.sourceIndex, edge.sourceCount)
                        const edgeLabel = edgeLabelLines.join('')
                        const longestLabelLine = Math.max(...edgeLabelLines.map((line) => line.length))
                        const labelWidth = Math.min(190, Math.max(48, longestLabelLine * 11 + 18))
                        const labelHeight = edgeLabelLines.length * 18 + 4
                        const labelX = goesForward
                          ? Math.max(turnX + 6, endX - labelWidth - 10)
                          : Math.min(turnX - labelWidth - 6, endX + 10)
                        const labelY = endY - labelHeight - 5
                        return (
                          <g
                            className={`decision-flow-edge ${edge.label.toLowerCase()}`}
                            key={`${edge.from.node.id}-${edge.sourceIndex}-${edge.to.node.id}-${edge.targetIndex}`}
                            onClick={(event) => openFlowEdgeMenu(edge, event)}
                          >
                            <path className="decision-flow-edge-hit" d={edgePath} />
                            <path d={edgePath} markerEnd={`url(#${markerId})`} />
                            {edgeLabel && (
                              <g className="decision-flow-edge-label">
                                <title>{edge.label}</title>
                                <rect height={labelHeight} rx="4" width={labelWidth} x={labelX} y={labelY} />
                                <text x={labelX + 8} y={labelY + 15}>
                                  {edgeLabelLines.map((line, lineIndex) => (
                                    <tspan key={`${line}-${lineIndex}`} x={labelX + 8} dy={lineIndex === 0 ? 0 : 18}>
                                      {line}
                                    </tspan>
                                  ))}
                                </text>
                              </g>
                            )}
                          </g>
                        )
                      })}
                      {decisionFlowChart.nodes.map((layoutNode) => {
                        const isSelected = layoutNode.node.id === editingDecisionNode?.id
                        const isStart = layoutNode.node.id === decisionStartNodeId
                        const isConnecting = layoutNode.node.id === connectingFromNodeId
                        const lines = splitDecisionFlowLabel(layoutNode.node.title)
                        const attachmentCount = layoutNode.node.media?.length ?? 0
                        return (
                          <g
                            aria-label={`${decisionNodeTypeLabels[layoutNode.node.type]}: ${layoutNode.node.title || '名称未設定'}${attachmentCount ? `、資料${attachmentCount}件` : ''}`}
                            className={`decision-flow-node ${layoutNode.node.type} ${isSelected ? 'selected' : ''} ${isStart ? 'start' : ''} ${isConnecting ? 'connecting-source' : ''}`}
                            key={layoutNode.node.id}
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation()
                              handleFlowNodeClick(layoutNode.node.id, true)
                            }}
                            onContextMenu={(event) => openFlowContextMenu(layoutNode.node.id, event)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                handleFlowNodeClick(layoutNode.node.id)
                              }
                            }}
                            onPointerDown={(event) => startFlowNodeDrag(layoutNode.node.id, event)}
                          >
                            <rect height={decisionFlowChart.nodeHeight} rx="9" width={decisionFlowChart.nodeWidth} x={layoutNode.x} y={layoutNode.y} />
                            <text className="decision-flow-kind" x={layoutNode.x + 13} y={layoutNode.y + 21}>
                              {decisionNodeTypeLabels[layoutNode.node.type]}
                            </text>
                            {lines.map((line, index) => (
                              <text className="decision-flow-title" key={`${line}-${index}`} x={layoutNode.x + 13} y={layoutNode.y + 48 + index * 17}>
                                {line}
                              </text>
                            ))}
                            {attachmentCount > 0 && (
                              <g className="decision-flow-attachment-mark">
                                <title>{`資料 ${attachmentCount}件`}</title>
                                <rect
                                  height="24"
                                  rx="5"
                                  width="42"
                                  x={layoutNode.x + decisionFlowChart.nodeWidth - 52}
                                  y={layoutNode.y + 10}
                                />
                                <Paperclip
                                  aria-hidden="true"
                                  height="14"
                                  width="14"
                                  x={layoutNode.x + decisionFlowChart.nodeWidth - 46}
                                  y={layoutNode.y + 15}
                                />
                                <text
                                  className="decision-flow-attachment-count"
                                  x={layoutNode.x + decisionFlowChart.nodeWidth - 16}
                                  y={layoutNode.y + 27}
                                >
                                  {attachmentCount}
                                </text>
                              </g>
                            )}
                          </g>
                        )
                      })}
                    </svg>
                    {flowContextMenu && !flowContextNode && (
                      <div
                        className="decision-flow-context-menu"
                        role="menu"
                        style={{ left: flowContextMenu.x, top: flowContextMenu.y }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            addDecisionNode('question', undefined, {
                              x: flowContextMenu.canvasX ?? flowContextMenu.x,
                              y: flowContextMenu.canvasY ?? flowContextMenu.y,
                            })
                            setFlowContextMenu(null)
                          }}
                        >
                          判断カードを置く
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            addDecisionNode('action', undefined, {
                              x: flowContextMenu.canvasX ?? flowContextMenu.x,
                              y: flowContextMenu.canvasY ?? flowContextMenu.y,
                            })
                            setFlowContextMenu(null)
                          }}
                        >
                          作業カードを置く
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            addDecisionNode('end', undefined, {
                              x: flowContextMenu.canvasX ?? flowContextMenu.x,
                              y: flowContextMenu.canvasY ?? flowContextMenu.y,
                            })
                            setFlowContextMenu(null)
                          }}
                        >
                          完了カードを置く
                        </button>
                      </div>
                    )}
                    {flowContextMenu && flowContextNode && (
                      <div
                        className="decision-flow-context-menu"
                        role="menu"
                        style={{ left: flowContextMenu.x, top: flowContextMenu.y }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {flowContextNode.type === 'question' && (
                          <button
                            type="button"
                            onClick={() => {
                              addDecisionBranch(flowContextNode.id)
                              setFlowContextMenu(null)
                            }}
                          >
                            分岐を追加
                          </button>
                        )}
                        {flowContextNode.type !== 'end' && (
                          <button
                            type="button"
                            onClick={() => {
                              addDecisionNodeToFlow(flowContextNode.id, 'action')
                              setFlowContextMenu(null)
                            }}
                          >
                            次の作業を追加
                          </button>
                        )}
                        {flowContextNode.type === 'action' && (
                          <button
                            type="button"
                            onClick={() => {
                              addDecisionNodeToFlow(flowContextNode.id, 'question')
                              setFlowContextMenu(null)
                            }}
                          >
                            判断カードを挿入
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            duplicateDecisionNode(flowContextNode.id)
                            setFlowContextMenu(null)
                          }}
                        >
                          カードを複製
                        </button>
                        {flowContextNode.id !== decisionStartNodeId && (
                          <button
                            type="button"
                            onClick={() => {
                              updateManual({ decisionStartNodeId: flowContextNode.id })
                              setFlowContextMenu(null)
                            }}
                          >
                            開始地点に設定
                          </button>
                        )}
                        <button
                          className="danger"
                          type="button"
                          onClick={() => {
                            removeDecisionNode(flowContextNode.id)
                            setFlowContextMenu(null)
                          }}
                        >
                          カードを削除
                        </button>
                      </div>
                    )}
                    {flowEdgeMenu && (
                      <div
                        className="decision-flow-edge-menu"
                        role="dialog"
                        style={{ left: flowEdgeMenu.x, top: flowEdgeMenu.y }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <label>
                          接続先
                          <select
                            value={flowEdgeMenu.targetId}
                            onChange={(event) => updateFlowEdgeTarget(flowEdgeMenu, event.target.value || undefined)}
                          >
                            <option value="">接続しない</option>
                            {decisionNodes.filter((node) => node.id !== flowEdgeMenu.sourceId).map((node) => (
                              <option key={node.id} value={node.id}>{node.title || '名称未設定'}</option>
                            ))}
                          </select>
                        </label>
                        <button className="danger" type="button" onClick={() => updateFlowEdgeTarget(flowEdgeMenu)}>
                          接続を削除
                        </button>
                      </div>
                    )}
                  </div>
                  {isDecisionEditorOpen && editingDecisionNode && (
                    <div
                      className="decision-flow-editor-backdrop"
                      onMouseDown={(event) => {
                        if (event.target === event.currentTarget) closeDecisionEditor()
                      }}
                    >
                    <section
                      aria-labelledby="decision-flow-editor-title"
                      aria-modal="true"
                      className="decision-flow-quick-editor"
                      role="dialog"
                    >
                      <header className="decision-flow-editor-header">
                        <div>
                          <span>カードを編集</span>
                           <h2 id="decision-flow-editor-title">{(decisionEditDraft ?? editingDecisionNode).title || '名称未設定'}</h2>
                        </div>
                        <button
                          aria-label="カード編集を閉じる"
                          className="decision-flow-editor-close"
                          type="button"
                          onClick={closeDecisionEditor}
                        >
                          <X size={20} aria-hidden="true" />
                        </button>
                      </header>
                      <div className="decision-flow-quick-fields">
                        <label>
                          <span>種別</span>
                          <select
                            disabled={isEditingLocked}
                            value={(decisionEditDraft ?? editingDecisionNode).type}
                            onChange={(event) => setDecisionEditDraft((current) => ({
                              ...(current ?? editingDecisionNode),
                              type: event.target.value as DecisionNodeType,
                            }))}
                          >
                            <option value="question">判断</option>
                            <option value="action">作業</option>
                            <option value="end">完了</option>
                          </select>
                        </label>
                        <label>
                          <span>表示内容</span>
                          <input
                            disabled={isEditingLocked}
                            placeholder="判断・作業の名称"
                            value={(decisionEditDraft ?? editingDecisionNode).title}
                            onChange={(event) => setDecisionEditDraft((current) => ({
                              ...(current ?? editingDecisionNode),
                              title: event.target.value,
                            }))}
                          />
                        </label>
                        <label className="wide-field">
                          <span>現場への指示</span>
                          <textarea
                            disabled={isEditingLocked}
                            placeholder="現場への指示"
                            value={(decisionEditDraft ?? editingDecisionNode).detail}
                            onChange={(event) => setDecisionEditDraft((current) => ({
                              ...(current ?? editingDecisionNode),
                              detail: event.target.value,
                            }))}
                          />
                        </label>
                      </div>
                      {(editingDecisionNode.media?.length ?? 0) > 0 && (
                        <section className="decision-flow-quick-media" aria-label="カードの添付資料">
                          <header>
                            <strong>添付資料</strong>
                            <span>{editingDecisionNode.media?.length ?? 0} 件</span>
                          </header>
                          <div className="decision-flow-quick-media-list">
                            {(editingDecisionNode.media ?? []).map((media) => (
                              <article key={media.id}>
                                {media.kind === 'image' ? (
                                  <img src={media.url} alt={media.name} />
                                ) : (
                                  <video playsInline preload="metadata" src={media.url} />
                                )}
                                <strong title={media.name}>{media.name}</strong>
                                <button
                                  aria-label={`${media.name}を削除`}
                                  disabled={isEditingLocked}
                                  title="添付資料を削除"
                                  type="button"
                                  onClick={() => void removeDecisionMedia(editingDecisionNode.id, media.id)}
                                >
                                  <Trash2 size={15} aria-hidden="true" />
                                </button>
                              </article>
                            ))}
                          </div>
                        </section>
                      )}
                      <div className="decision-flow-quick-actions">
                        <button
                          className={editingDecisionNode.id === decisionStartNodeId ? 'active' : ''}
                          disabled={isEditingLocked}
                          type="button"
                          onClick={() => updateManual({ decisionStartNodeId: editingDecisionNode.id })}
                        >
                          <PlayCircle size={16} aria-hidden="true" />
                          {editingDecisionNode.id === decisionStartNodeId ? '開始地点' : '開始地点に設定'}
                        </button>
                        <label className="decision-flow-quick-upload" title="資料を追加">
                          <UploadCloud size={16} aria-hidden="true" />
                          資料追加
                          <input
                            accept="image/*,video/*"
                            disabled={isEditingLocked || isUploading}
                            multiple
                            type="file"
                            onChange={(event) => void handleDecisionMediaUpload(editingDecisionNode.id, event)}
                          />
                        </label>
                        <button
                          className="decision-confirm"
                          disabled={isEditingLocked}
                          type="button"
                          onClick={commitDecisionEditor}
                        >
                          <CheckCircle2 size={16} aria-hidden="true" />
                          確定
                        </button>
                        <button
                          className="decision-revert"
                          disabled={isEditingLocked}
                          type="button"
                          onClick={closeDecisionEditor}
                        >
                          <RotateCcw size={16} aria-hidden="true" />
                          戻す
                        </button>
                        <button
                          disabled={isEditingLocked}
                          title="カードを複製"
                          type="button"
                          onClick={() => duplicateDecisionNode(editingDecisionNode.id)}
                        >
                          <Copy size={16} aria-hidden="true" />
                          複製
                        </button>
                        <button
                          className="danger"
                          disabled={isEditingLocked}
                          title="カードを削除"
                          type="button"
                          onClick={() => removeDecisionNode(editingDecisionNode.id)}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                          削除
                        </button>
                      </div>
                    </section>
                    </div>
                  )}
                </section>
                <details className="decision-flow-details">
                  <summary>詳細設定</summary>
                  <div className="decision-authoring-layout">
                  <ol className="decision-tree-list" aria-label="手順フローのツリー">
                    {decisionNodes.map((node, index) => (
                      <li
                        className={`${node.id === decisionStartNodeId ? 'start-node' : ''} ${node.id === editingDecisionNode?.id ? 'selected-node' : ''}`}
                        key={node.id}
                      >
                        <button
                          type="button"
                          onClick={() => openDecisionEditor(node.id)}
                        >
                          <span className={`decision-type ${node.type}`}>{decisionNodeTypeLabels[node.type]}</span>
                          <strong>{node.title || '名称未設定'}</strong>
                          <small>
                            {node.type === 'question'
                              ? getDecisionBranches(node).map((branch) => `${branch.label}: ${decisionNodeMap.get(branch.nextNodeId ?? '')?.title ?? '未設定'}`).join(' / ')
                              : node.type === 'action'
                                ? `次へ: ${decisionNodeMap.get(node.nextNodeId ?? '')?.title ?? '未設定'}`
                                : '手順フロー終了'}
                          </small>
                          <span className="decision-order">{index + 1}</span>
                        </button>
                      </li>
                    ))}
                  </ol>

                  <div className="decision-node-list">
                    {decisionNodes.filter((node) => node.id === editingDecisionNode?.id).map((node) => (
                      <article className="decision-node-editor" key={node.id}>
                        <div className="decision-node-editor-header">
                          <label className="node-type-select">
                            種別
                            <select
                              disabled={isEditingLocked}
                              value={node.type}
                              onChange={(event) =>
                                updateDecisionNode(node.id, { type: event.target.value as DecisionNodeType })
                              }
                            >
                              <option value="question">YES／NO判断</option>
                              <option value="action">作業</option>
                              <option value="end">完了</option>
                            </select>
                          </label>
                          <label className="start-node-toggle">
                            <input
                              checked={node.id === decisionStartNodeId}
                              disabled={isEditingLocked}
                              name="decision-start"
                              type="radio"
                              onChange={() => updateManual({ decisionStartNodeId: node.id })}
                            />
                            開始地点
                          </label>
                          <button
                            aria-label={`${node.title || 'このノード'}を複製`}
                            className="decision-duplicate"
                            disabled={isEditingLocked}
                            title="ノードを複製"
                            type="button"
                            onClick={() => duplicateDecisionNode(node.id)}
                          >
                            <Copy size={16} aria-hidden="true" />
                          </button>
                          <button
                            aria-label={`${node.title || 'このノード'}を削除`}
                            className="decision-delete"
                            disabled={isEditingLocked}
                            title="ノードを削除"
                            type="button"
                            onClick={() => removeDecisionNode(node.id)}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </div>
                        <label>
                          表示する判断・作業
                          <input
                            disabled={isEditingLocked}
                            value={node.title}
                            onChange={(event) => updateDecisionNode(node.id, { title: event.target.value })}
                            onBlur={() => finishDecisionSync(node.id, 'title')}
                          />
                        </label>
                        <label>
                          詳細・現場への指示
                          <textarea
                            disabled={isEditingLocked}
                            value={node.detail}
                            onChange={(event) => updateDecisionNode(node.id, { detail: event.target.value })}
                            onBlur={() => finishDecisionSync(node.id, 'detail')}
                          />
                        </label>
                        <section className="decision-media-section" aria-label="ノードの参照資料">
                          <header>
                            <div>
                              <strong>参照資料</strong>
                              <small>現場で確認する画像・動画</small>
                            </div>
                            <label className="decision-media-upload">
                              <UploadCloud size={16} aria-hidden="true" />
                              資料を追加
                              <input
                                accept="image/*,video/*"
                                disabled={isEditingLocked || isUploading}
                                multiple
                                type="file"
                                onChange={(event) => void handleDecisionMediaUpload(node.id, event)}
                              />
                            </label>
                          </header>
                          {node.media?.length ? (
                            <div className="decision-media-list">
                              {node.media.map((media) => (
                                <article key={media.id}>
                                  {media.kind === 'image' ? (
                                    <a
                                      aria-label={`${media.name}を原寸で開く`}
                                      className="decision-media-preview"
                                      href={media.url}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      <img src={media.url} alt={media.name} />
                                      <span>
                                        <Eye size={15} aria-hidden="true" />
                                        原寸を開く
                                      </span>
                                    </a>
                                  ) : (
                                    <video controls playsInline preload="metadata" src={media.url} />
                                  )}
                                  <div>
                                    <span>{media.kind === 'image' ? '画像' : '動画'}</span>
                                    <strong title={media.name}>{media.name}</strong>
                                  </div>
                                  <button
                                    aria-label={`${media.name}を削除`}
                                    disabled={isEditingLocked}
                                    title="資料を削除"
                                    type="button"
                                    onClick={() => void removeDecisionMedia(node.id, media.id)}
                                  >
                                    <Trash2 size={15} aria-hidden="true" />
                                  </button>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <p className="decision-media-empty">登録された資料はありません</p>
                          )}
                        </section>
                        {node.type === 'question' && (
                          <>
                            <section className="decision-branches-editor" aria-label="判断の分岐先">
                              <header>
                                <div>
                                  <strong>選択肢と分岐先</strong>
                                  <small>選択肢は3つ以上に増やせます</small>
                                </div>
                                <button disabled={isEditingLocked} type="button" onClick={() => addDecisionBranch(node.id)}>
                                  <Plus size={15} aria-hidden="true" />
                                  選択肢を追加
                                </button>
                              </header>
                              <div className="decision-branch-list">
                                {getDecisionBranches(node).map((branch) => (
                                  <article key={branch.id}>
                                    <label>
                                      選択肢
                                      <input
                                        disabled={isEditingLocked}
                                        value={branch.label}
                                        onChange={(event) => updateDecisionBranch(node.id, branch.id, { label: event.target.value })}
                                      />
                                    </label>
                                    <label>
                                      分岐先
                                      <select
                                        disabled={isEditingLocked}
                                        value={branch.nextNodeId ?? ''}
                                        onChange={(event) => updateDecisionBranch(node.id, branch.id, { nextNodeId: event.target.value || undefined })}
                                      >
                                        <option value="">選択してください</option>
                                        {decisionNodes.filter((target) => target.id !== node.id).map((target) => (
                                          <option key={target.id} value={target.id}>{target.title || '名称未設定'}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <button
                                      aria-label={`${branch.label || 'この選択肢'}を削除`}
                                      disabled={isEditingLocked || getDecisionBranches(node).length <= 2}
                                      title="選択肢を削除"
                                      type="button"
                                      onClick={() => removeDecisionBranch(node.id, branch.id)}
                                    >
                                      <Trash2 size={15} aria-hidden="true" />
                                    </button>
                                  </article>
                                ))}
                              </div>
                            </section>
                          </>
                        )}
                        {node.type === 'action' && (
                          <>
                            <label>
                              共通の次の作業
                              <select
                                disabled={isEditingLocked}
                                value={node.nextNodeId ?? ''}
                                onChange={(event) => updateDecisionNode(node.id, { nextNodeId: event.target.value || undefined })}
                              >
                                <option value="">選択してください</option>
                                {decisionNodes.filter((target) => target.id !== node.id).map((target) => (
                                  <option key={target.id} value={target.id}>{target.title || '名称未設定'}</option>
                                ))}
                              </select>
                            </label>
                            <details className="decision-conditional-next">
                              <summary>応用: 選択肢ごとに次の作業を変える</summary>
                              <div className="decision-conditional-body">
                                <header>
                                  <div>
                                    <strong>選択肢別の次の作業</strong>
                                    <small>同じ作業に合流した後、選択肢によって進み先を変えられます</small>
                                  </div>
                                  <button
                                    disabled={isEditingLocked || decisionBranchOptions.length === 0}
                                    type="button"
                                    onClick={() => addDecisionConditionalNext(node.id)}
                                  >
                                    <Plus size={15} aria-hidden="true" />
                                    条件を追加
                                  </button>
                                </header>
                                {(node.conditionalNext ?? []).length > 0 && (
                                <div className="decision-conditional-list">
                                  {(node.conditionalNext ?? []).map((condition, conditionIndex) => (
                                    <article key={`${condition.branchId}-${conditionIndex}`}>
                                      <label>
                                        先に選んだ選択肢
                                        <select
                                          disabled={isEditingLocked}
                                          value={condition.branchId}
                                          onChange={(event) => updateDecisionConditionalNext(node.id, conditionIndex, { branchId: event.target.value })}
                                        >
                                          <option value="">選択してください</option>
                                          {decisionBranchOptions.map((branch) => (
                                            <option key={branch.id} value={branch.id}>{branch.nodeTitle} / {branch.label || '名称未設定'}</option>
                                          ))}
                                        </select>
                                      </label>
                                      <label>
                                        次の作業
                                        <select
                                          disabled={isEditingLocked}
                                          value={condition.nextNodeId ?? ''}
                                          onChange={(event) => updateDecisionConditionalNext(node.id, conditionIndex, { nextNodeId: event.target.value || undefined })}
                                        >
                                          <option value="">選択してください</option>
                                          {decisionNodes.filter((target) => target.id !== node.id).map((target) => (
                                            <option key={target.id} value={target.id}>{target.title || '名称未設定'}</option>
                                          ))}
                                        </select>
                                      </label>
                                      <button
                                        aria-label="条件を削除"
                                        disabled={isEditingLocked}
                                        title="条件を削除"
                                        type="button"
                                        onClick={() => removeDecisionConditionalNext(node.id, conditionIndex)}
                                      >
                                        <Trash2 size={15} aria-hidden="true" />
                                      </button>
                                    </article>
                                  ))}
                                </div>
                                )}
                              </div>
                            </details>
                            <div className="decision-quick-adds single-action">
                              <button
                                disabled={isEditingLocked}
                                type="button"
                                onClick={() => addDecisionNode('question', { nodeId: node.id, field: 'nextNodeId' })}
                              >
                                <Plus size={15} aria-hidden="true" />
                                次に判断を追加
                              </button>
                            </div>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                  </div>
                </details>
              </section>
          </div>
        )}

        {view === 'approval' && (
          <div className="approval-grid">
            <section className="status-panel simple-workflow">
              <div>
                <p className="eyebrow">公開ワークフロー</p>
                <h2>{statusLabels[selectedManual.status]}</h2>
              </div>
              <ol className="workflow-steps">
                {statusFlow.map((status, index) => {
                  const currentIndex = statusFlow.indexOf(selectedManual.status)
                  const isCurrent = selectedManual.status === status
                  const isDone = index < currentIndex
                  return (
                    <li className={`${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}`} key={status}>
                      <span>{isDone || isCurrent ? <CheckCircle2 size={17} aria-hidden="true" /> : index + 1}</span>
                      <strong>{statusLabels[status]}</strong>
                    </li>
                  )
                })}
              </ol>
              <section className="workflow-next-action">
                {selectedManual.status === 'draft' && (
                  <>
                    <p>内容を確認して、承認者へ送ります。</p>
                    <button type="button" onClick={submitForReview}>
                      <Send size={18} aria-hidden="true" />
                      承認を依頼する
                    </button>
                  </>
                )}
                {selectedManual.status === 'review' && (
                  <>
                    <p>レビュー条件を確認したら、承認します。</p>
                    <button type="button" onClick={approveManual}>
                      <ShieldCheck size={18} aria-hidden="true" />
                      承認する
                    </button>
                    <label className="review-comment">
                      差戻し理由
                      <textarea
                        value={reviewComment}
                        onChange={(event) => setReviewComment(event.target.value)}
                        placeholder="修正が必要な内容を入力"
                      />
                    </label>
                    <button className="return-action" type="button" onClick={returnToDraft}>
                      <RotateCcw size={17} aria-hidden="true" />
                      差戻す
                    </button>
                  </>
                )}
                {selectedManual.status === 'approved' && (
                  <>
                    <p>承認済みです。現場で閲覧できる状態にします。</p>
                    <button type="button" onClick={publishManual}>
                      <Eye size={18} aria-hidden="true" />
                      現場へ公開する
                    </button>
                  </>
                )}
                {selectedManual.status === 'published' && (
                  <>
                    <p>現場で公開中です。変更が必要なときは改訂版を作成します。</p>
                    <button type="button" onClick={beginRevision}>
                      <RotateCcw size={18} aria-hidden="true" />
                      改訂を開始する
                    </button>
                  </>
                )}
              </section>
            </section>

            <section className="review-panel">
              {selectedManual.status === 'review' && (
                <>
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
                </>
              )}
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
                  selectedManual.thumbnail ? (
                    <button
                      className="viewer-image-button viewer-main-image-button"
                      type="button"
                      title="タップして全画面表示"
                      aria-label="タイトル写真を全画面表示"
                      onClick={() => setFullscreenViewerImage({ src: selectedManual.thumbnail, alt: selectedManual.title })}
                    >
                      <img src={selectedManual.thumbnail} alt="" />
                      <Maximize2 className="viewer-image-expand-icon" size={18} aria-hidden="true" />
                    </button>
                  ) : (
                    <div className="viewer-media-empty">
                      <FileVideo size={30} aria-hidden="true" />
                      <span>動画・写真は未登録です</span>
                    </div>
                  )
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
                    disabled={!isPublished}
                  >
                    <BookOpen size={18} aria-hidden="true" />
                    {viewerClip
                      ? isPublished ? '動画を視聴' : '公開前のため閲覧不可'
                      : isPublished ? '手順を確認' : '公開前のため閲覧不可'}
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
              {(selectedManual.manualImages?.length ?? 0) > 0 && (
                <section className="viewer-manual-images">
                  <header className="section-heading compact-heading">
                    <div>
                      <p className="eyebrow">写真資料</p>
                      <h2>作業を画像で確認</h2>
                    </div>
                    <span>{selectedManual.manualImages?.length ?? 0} 枚</span>
                  </header>
                  <div className="viewer-manual-image-gallery">
                    {(selectedManual.manualImages ?? []).map((image) => (
                      <figure key={image.id}>
                        <button
                          className="viewer-image-button"
                          type="button"
                          title="タップして全画面表示"
                          aria-label={`${image.name}を全画面表示`}
                          onClick={() => setFullscreenViewerImage({ src: image.url, alt: image.name })}
                        >
                          <img src={image.url} alt={image.name} />
                          <Maximize2 className="viewer-image-expand-icon" size={18} aria-hidden="true" />
                        </button>
                        <figcaption>{image.name}</figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}
              {isQrViewer && (
                <section className="qr-simple-steps">
                  <header className="section-heading compact-heading">
                    <div>
                      <p className="eyebrow">作業手順</p>
                      <h2>手順を確認</h2>
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
                              <button
                                className="viewer-image-button"
                                type="button"
                                title="タップして全画面表示"
                                aria-label={`${image.name}を全画面表示`}
                                onClick={() => setFullscreenViewerImage({ src: image.url, alt: image.name })}
                              >
                                <img src={image.url} alt={image.name} />
                                <Maximize2 className="viewer-image-expand-icon" size={18} aria-hidden="true" />
                              </button>
                              <span>{imageKindLabels[image.kind]}</span>
                              <strong>{image.name}</strong>
                            </article>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              )}
            </section>

            <aside className="library-step-panel">
              <header className="step-panel-header">
                <div>
                  <p className="eyebrow">作業手順</p>
                  <h2>動画に合わせて確認</h2>
                </div>
                <span>{selectedManual.steps.length} 手順</span>
              </header>
              <div className="viewer-steps" ref={viewerStepsRef}>
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
                          <button
                            className="viewer-image-button"
                            type="button"
                            title="タップして全画面表示"
                            aria-label={`${image.name}を全画面表示`}
                            onClick={() => setFullscreenViewerImage({ src: image.url, alt: image.name })}
                          >
                            <img src={image.url} alt={image.name} />
                            <Maximize2 className="viewer-image-expand-icon" size={18} aria-hidden="true" />
                          </button>
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
              <section className="manual-qr-panel" id="manual-qr-panel">
                <div className="manual-qr-copy">
                  <p className="eyebrow">現場掲示用</p>
                  <h2>この作業のQRコード</h2>
                  <p>
                    {decisionNodes.length > 0
                      ? '現場で読み取ると、スマホで手順フローを直接開けます。'
                      : '現場で読み取ると、このマニュアルの閲覧画面を直接開きます。'}
                  </p>
                  {!isPublished && <span className="qr-draft-note">公開前のマニュアルです</span>}
                </div>
                <QRCodeSVG
                  aria-label={`${selectedManual.title}を開くQRコード`}
                  bgColor="#ffffff"
                  className="manual-qr-code"
                  fgColor="#17202f"
                  level="M"
                  marginSize={2}
                  size={164}
                  value={manualQrUrl}
                />
                <div className="manual-qr-actions">
                  <button type="button" onClick={copyManualQrLink}>
                    <Copy size={16} aria-hidden="true" />
                    リンクをコピー
                  </button>
                  <button type="button" onClick={() => printWithMode('qr')}>
                    <Printer size={16} aria-hidden="true" />
                    QRコードを印刷
                  </button>
                </div>
                <small>整理No: {selectedManual.controlNo ?? '未設定'}</small>
              </section>
            </aside>
          </div>
        )}

        {view === 'decision' && (
          <div className="decision-review-view">
            <aside className="decision-review-tree">
              <header className="decision-section-header">
                <div>
                  <p className="eyebrow">レビュー用ツリー</p>
                  <h2>手順の全体像</h2>
                </div>
                <button type="button" onClick={resetDecisionReview}>
                  <RotateCcw size={16} aria-hidden="true" />
                  最初から
                </button>
              </header>
              <ol className="decision-review-list">
                {decisionNodes.map((node) => (
                  <li
                    className={`${decisionPath.includes(node.id) ? 'visited' : ''} ${activeDecisionNode?.id === node.id ? 'current' : ''}`}
                    key={node.id}
                  >
                    <span className={`decision-type ${node.type}`}>{decisionNodeTypeLabels[node.type]}</span>
                    <div>
                      <strong>{node.title || '名称未設定'}</strong>
                      <small>{node.detail || '説明を入力してください'}</small>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>

            <section className="decision-runner" aria-live="polite">
              {activeDecisionNode ? (
                <>
                  <div className="decision-runner-sheet">
                    <div className="decision-runner-progress">
                      <span>手順確認</span>
                      <span>{decisionPath.length} / {decisionNodes.length}</span>
                    </div>
                    <div className="decision-runner-navigation">
                      <button disabled={decisionPath.length <= 1} type="button" onClick={goBackDecisionStep}>
                        <ArrowLeft size={18} aria-hidden="true" />
                        前の作業に戻る
                      </button>
                      <button type="button" onClick={resetDecisionReview}>
                        <RotateCcw size={17} aria-hidden="true" />
                        最初に戻る
                      </button>
                    </div>
                    <section className="decision-runner-content" aria-labelledby="decision-current-title">
                      <span className="decision-runner-section-label">作業内容</span>
                      <span className={`decision-type large ${activeDecisionNode.type}`}>
                        {decisionNodeTypeLabels[activeDecisionNode.type]}
                      </span>
                      <h2 id="decision-current-title">{activeDecisionNode.title || '名称未設定'}</h2>
                    </section>
                    <section className="decision-runner-instruction">
                      <span className="decision-runner-section-label">作業指示</span>
                      <p>{activeDecisionNode.detail || '現場への指示を入力してください。'}</p>
                    </section>
                    <div className="decision-runner-media-stage">
                      <span className="decision-runner-section-label">写真・動画</span>
                      {activeDecisionNode.media?.length ? (
                        <section className="decision-runner-media" aria-label="この手順の参照資料">
                          {activeDecisionNode.media.map((media) =>
                            media.kind === 'image' ? (
                              <figure key={media.id}>
                                <button
                                  className="viewer-image-button"
                                  type="button"
                                  title="タップして全画面表示"
                                  aria-label={`${media.name}を全画面表示`}
                                  onClick={() => setFullscreenViewerImage({ src: media.url, alt: media.name })}
                                >
                                  <img src={media.url} alt={media.name} />
                                  <Maximize2 className="viewer-image-expand-icon" size={18} aria-hidden="true" />
                                </button>
                                <figcaption>{media.name}</figcaption>
                              </figure>
                            ) : (
                              <figure key={media.id}>
                                <video controls playsInline preload="metadata" src={media.url} />
                                <figcaption>{media.name}</figcaption>
                              </figure>
                            ),
                          )}
                        </section>
                      ) : (
                        <div className="decision-runner-media-empty">添付された写真・動画はありません</div>
                      )}
                    </div>
                    {decisionSelections.length > 0 && (
                      <div className="decision-route-context">
                        <span>引継ぎ中の選択</span>
                        <strong>{decisionSelections.map((selection) => selection.label).join(' / ')}</strong>
                      </div>
                    )}
                    <section className="decision-runner-next">
                      <span className="decision-runner-section-label">
                        {activeDecisionNode.type === 'end' ? '完了' : '次の分岐'}
                      </span>
                      {activeDecisionNode.type === 'question' && (
                        <div className="decision-answer-actions">
                          {getDecisionBranches(activeDecisionNode).map((branch) => (
                            <button
                              className={`decision-answer ${branch.label.toLowerCase()}`}
                              key={branch.id}
                              type="button"
                              onClick={() => advanceDecision(branch.nextNodeId, { branchId: branch.id, label: branch.label || '選択肢' })}
                            >
                              {branch.label || '選択してください'}
                            </button>
                          ))}
                        </div>
                      )}
                      {activeDecisionNode.type === 'action' && (
                        (() => {
                          const actionNext = getDecisionActionNext(activeDecisionNode)
                          return (
                            <>
                              {actionNext.matchedSelection && (
                                <small className="decision-conditional-note">
                                  「{actionNext.matchedSelection.label}」の選択に応じた次の作業へ進みます
                                </small>
                              )}
                              <button className="decision-next-action" type="button" onClick={() => advanceDecision(actionNext.nextNodeId)}>
                                作業を実施した。次へ進む
                              </button>
                            </>
                          )
                        })()
                      )}
                      {activeDecisionNode.type === 'end' && (
                        <div className="decision-complete-state">
                          <CheckCircle2 size={30} aria-hidden="true" />
                          <strong>手順フローを完了しました</strong>
                          <button type="button" onClick={resetDecisionReview}>
                            最初から確認する
                          </button>
                        </div>
                      )}
                    </section>
                  </div>
                </>
              ) : (
                <div className="decision-empty-state">
                  <GitBranch size={34} aria-hidden="true" />
                  <h2>手順フローがありません</h2>
                  <p>作成画面で判断または作業を追加してください。</p>
                  <button type="button" onClick={() => setView('edit')}>作成画面へ</button>
                </div>
              )}
            </section>
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
      {fullscreenViewerImage && (
        <div
          className="viewer-image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${fullscreenViewerImage.alt || '画像'}の全画面表示`}
          onClick={() => setFullscreenViewerImage(null)}
        >
          <button
            className="viewer-image-lightbox-close"
            type="button"
            aria-label="全画面表示を閉じる"
            onClick={() => setFullscreenViewerImage(null)}
          >
            <X size={24} aria-hidden="true" />
          </button>
          <img
            src={fullscreenViewerImage.src}
            alt={fullscreenViewerImage.alt}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
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
