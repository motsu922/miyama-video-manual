export type ApprovalStatus = 'draft' | 'review' | 'approved' | 'published'

export type Step = {
  id: number
  time: string
  title: string
  detail: string
  inspectionImages?: InspectionImage[]
}

export type InspectionImageKind = 'ok' | 'ng' | 'criteria'

export type InspectionImage = {
  id: string
  kind: InspectionImageKind
  name: string
  url: string
  originalUrl?: string
  uploadedAt: string
}

export type ReviewCheck = {
  id: string
  label: string
  checked: boolean
}

export type ApprovalEvent = {
  id: string
  action: 'created' | 'submitted' | 'approved' | 'published' | 'returned' | 'revision'
  actor: string
  comment?: string
  createdAt: string
}

export type ViewConfirmation = {
  id: string
  viewer: string
  completedAt: string
}

export type FlashTestResult = {
  id: string
  manualId: string
  worker: string
  imageId: string
  imageName: string
  imageKind: Extract<InspectionImageKind, 'ok' | 'ng'>
  stepId: number
  stepTitle: string
  answer: Extract<InspectionImageKind, 'ok' | 'ng'>
  correct: boolean
  answeredAt: string
}

export type VideoClip = {
  id: string
  name: string
  url: string
  duration: number
  trimStart: number
  trimEnd: number
  zoom?: number
  focusX?: number
  focusY?: number
  playbackRate?: number
  spotlight?: boolean
  caption?: string
  captionPosition?: 'top' | 'center' | 'bottom'
}

export type ManualImage = {
  id: string
  name: string
  url: string
  uploadedAt: string
}

export type ManualLanguage = 'ja' | 'th' | 'pt'

export type ManualKind = 'standard' | 'abnormal'

export type DecisionNodeType = 'question' | 'action' | 'end'

export type DecisionNodeMedia = {
  id: string
  kind: 'image' | 'video'
  name: string
  url: string
  uploadedAt: string
}

export type DecisionBranch = {
  id: string
  label: string
  nextNodeId?: string
}

export type DecisionConditionalNext = {
  branchId: string
  nextNodeId?: string
}

export type DecisionNode = {
  id: string
  type: DecisionNodeType
  title: string
  detail: string
  sourceStepId?: number
  flowPosition?: {
    x: number
    y: number
  }
  media?: DecisionNodeMedia[]
  branches?: DecisionBranch[]
  conditionalNext?: DecisionConditionalNext[]
  yesNodeId?: string
  noNodeId?: string
  nextNodeId?: string
}

export type ManualTranslation = {
  language: Exclude<ManualLanguage, 'ja'>
  title: string
  workName?: string
  productName?: string
  department: string
  tags: string[]
  steps: Array<{
    id: number
    title: string
    detail: string
  }>
  translatedAt: string
}

export type Manual = {
  id: string
  title: string
  workName?: string
  controlNo?: string
  productName?: string
  department: string
  owner: string
  status: ApprovalStatus
  version: string
  duration: string
  updatedAt: string
  videoUrl: string
  videoClips?: VideoClip[]
  manualImages?: ManualImage[]
  thumbnail: string
  tags: string[]
  steps: Step[]
  reviewers: string[]
  checks: ReviewCheck[]
  inspectionImages?: InspectionImage[]
  approvalHistory?: ApprovalEvent[]
  viewConfirmations?: ViewConfirmation[]
  translations?: Partial<Record<Exclude<ManualLanguage, 'ja'>, ManualTranslation>>
  kind?: ManualKind
  decisionNodes?: DecisionNode[]
  decisionStartNodeId?: string
}

