import { httpsCallable } from 'firebase/functions'
import { ensureSignedIn } from './manualRepository'
import { functions, isFirebaseConfigured } from './firebase'
import type { Manual, ManualTranslation } from './types'

type TranslationTarget = ManualTranslation['language']

type TranslationRequest = {
  targetLanguage: TranslationTarget
  manual: Pick<Manual, 'title' | 'workName' | 'productName' | 'department' | 'tags'> & {
    steps: Array<Pick<Manual['steps'][number], 'id' | 'time' | 'title' | 'detail'>>
    decisionNodes: Array<{
      id: string
      title: string
      detail: string
      branches: Array<{ id: string; label: string }>
    }>
  }
}

export async function translateManualContent(
  manual: Manual,
  targetLanguage: TranslationTarget,
) {
  if (!isFirebaseConfigured || !functions) {
    throw new Error('Firebase Functions の設定が利用できません')
  }

  await ensureSignedIn()

  const translate = httpsCallable<TranslationRequest, ManualTranslation>(functions, 'translateManual')
  const response = await translate({
    targetLanguage,
    manual: {
      title: manual.title,
      workName: manual.workName,
      productName: manual.productName,
      department: manual.department,
      tags: manual.tags,
      steps: manual.steps.map((step) => ({
        id: step.id,
        time: step.time,
        title: step.title,
        detail: step.detail,
      })),
      decisionNodes: (manual.decisionNodes ?? []).map((node) => ({
        id: node.id,
        title: node.title,
        detail: node.detail,
        branches: (node.branches ?? []).map((branch) => ({
          id: branch.id,
          label: branch.label,
        })),
      })),
    },
  })

  return response.data
}

