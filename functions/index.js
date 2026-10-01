import { v3 as translateV3 } from '@google-cloud/translate'
import { HttpsError, onCall } from 'firebase-functions/v2/https'

const translationClient = new translateV3.TranslationServiceClient()
const supportedLanguages = new Set(['th', 'pt'])

function asText(value, field) {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${field} must be a string.`)
  }
  return value.trim()
}

function validateManual(manual) {
  if (!manual || typeof manual !== 'object' || Array.isArray(manual)) {
    throw new HttpsError('invalid-argument', 'Manual content is required.')
  }

  const steps = Array.isArray(manual.steps) ? manual.steps : []
  const decisionNodes = Array.isArray(manual.decisionNodes) ? manual.decisionNodes : []
  if (steps.length > 100 || decisionNodes.length > 100) {
    throw new HttpsError('invalid-argument', 'A manual can contain at most 100 steps and 100 flowchart nodes.')
  }

  const normalized = {
    title: asText(manual.title, 'title'),
    workName: asText(manual.workName ?? '', 'workName'),
    productName: asText(manual.productName ?? '', 'productName'),
    department: asText(manual.department, 'department'),
    tags: Array.isArray(manual.tags) ? manual.tags.map((tag) => asText(tag, 'tag')) : [],
    steps: steps.map((step) => ({
      id: Number(step.id),
      title: asText(step.title, 'step.title'),
      detail: asText(step.detail, 'step.detail'),
    })),
    decisionNodes: decisionNodes.map((node) => ({
      id: asText(node.id, 'decisionNode.id'),
      title: asText(node.title, 'decisionNode.title'),
      detail: asText(node.detail, 'decisionNode.detail'),
      branches: (Array.isArray(node.branches) ? node.branches : []).map((branch) => ({
        id: asText(branch.id, 'decisionNode.branch.id'),
        label: asText(branch.label, 'decisionNode.branch.label'),
      })),
    })),
  }

  if (normalized.steps.some((step) => !Number.isFinite(step.id))) {
    throw new HttpsError('invalid-argument', 'Each step needs a numeric id.')
  }
  if (JSON.stringify(normalized).length > 50000) {
    throw new HttpsError('invalid-argument', 'Manual content is too large to translate.')
  }
  return normalized
}

function createTranslationEntries(manual) {
  return [
    { get: () => manual.title, set: (value) => { manual.title = value } },
    { get: () => manual.workName, set: (value) => { manual.workName = value } },
    { get: () => manual.productName, set: (value) => { manual.productName = value } },
    { get: () => manual.department, set: (value) => { manual.department = value } },
    ...manual.tags.map((_, index) => ({
      get: () => manual.tags[index],
      set: (value) => { manual.tags[index] = value },
    })),
    ...manual.steps.flatMap((step) => [
      { get: () => step.title, set: (value) => { step.title = value } },
      { get: () => step.detail, set: (value) => { step.detail = value } },
    ]),
    ...manual.decisionNodes.flatMap((node) => [
      { get: () => node.title, set: (value) => { node.title = value } },
      { get: () => node.detail, set: (value) => { node.detail = value } },
      ...node.branches.map((branch) => ({
        get: () => branch.label,
        set: (value) => { branch.label = value },
      })),
    ]),
  ]
}

function chunkEntries(entries) {
  const chunks = []
  let current = []
  let size = 0
  for (const entry of entries) {
    const entrySize = entry.get().length
    if (current.length > 0 && (current.length >= 100 || size + entrySize > 20000)) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(entry)
    size += entrySize
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

async function translateManualFields(manual, targetLanguage) {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
  if (!projectId) throw new HttpsError('internal', 'Firebase project information is unavailable.')

  const entries = createTranslationEntries(manual).filter((entry) => entry.get())
  for (const chunk of chunkEntries(entries)) {
    const [response] = await translationClient.translateText({
      parent: `projects/${projectId}/locations/global`,
      contents: chunk.map((entry) => entry.get()),
      mimeType: 'text/plain',
      sourceLanguageCode: 'ja',
      targetLanguageCode: targetLanguage,
      model: `projects/${projectId}/locations/global/models/general/translation-llm`,
    })
    const translations = response.translations ?? []
    if (translations.length !== chunk.length) {
      throw new HttpsError('internal', 'AI translation returned an incomplete response.')
    }
    translations.forEach((translation, index) => chunk[index].set(translation.translatedText ?? chunk[index].get()))
  }
  return manual
}

export const translateManual = onCall(
  {
    region: 'asia-northeast1',
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in is required to translate manuals.')
    }
    const targetLanguage = request.data?.targetLanguage
    if (!supportedLanguages.has(targetLanguage)) {
      throw new HttpsError('invalid-argument', 'Unsupported target language.')
    }

    try {
      const translated = await translateManualFields(validateManual(request.data?.manual), targetLanguage)
      return {
        ...translated,
        language: targetLanguage,
        translatedAt: new Date().toISOString(),
      }
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Cloud Translation failed', error)
      throw new HttpsError('internal', 'AI translation could not be completed.')
    }
  },
)

