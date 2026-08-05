import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'

const openAiApiKey = defineSecret('OPENAI_API_KEY')
const supportedLanguages = {
  th: 'Thai',
  pt: 'Brazilian Portuguese',
}

const translationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'workName', 'productName', 'department', 'tags', 'steps'],
  properties: {
    title: { type: 'string' },
    workName: { type: 'string' },
    productName: { type: 'string' },
    department: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'detail'],
        properties: {
          id: { type: 'number' },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
      },
    },
  },
}

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
  if (steps.length > 100) {
    throw new HttpsError('invalid-argument', 'A manual can contain at most 100 steps.')
  }

  const normalized = {
    title: asText(manual.title, 'title'),
    workName: asText(manual.workName ?? '', 'workName'),
    productName: asText(manual.productName ?? '', 'productName'),
    department: asText(manual.department, 'department'),
    tags: Array.isArray(manual.tags) ? manual.tags.map((tag) => asText(tag, 'tag')) : [],
    steps: steps.map((step) => ({
      id: Number(step.id),
      time: asText(step.time, 'step.time'),
      title: asText(step.title, 'step.title'),
      detail: asText(step.detail, 'step.detail'),
    })),
  }

  if (normalized.steps.some((step) => !Number.isFinite(step.id))) {
    throw new HttpsError('invalid-argument', 'Each step needs a numeric id.')
  }

  const textSize = JSON.stringify(normalized).length
  if (textSize > 50000) {
    throw new HttpsError('invalid-argument', 'Manual content is too large to translate.')
  }

  return normalized
}

export const translateManual = onCall(
  {
    region: 'asia-northeast1',
    timeoutSeconds: 60,
    secrets: [openAiApiKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in is required to translate manuals.')
    }

    const targetLanguage = request.data?.targetLanguage
    if (!(targetLanguage in supportedLanguages)) {
      throw new HttpsError('invalid-argument', 'Unsupported target language.')
    }

    const manual = validateManual(request.data?.manual)
    const targetLanguageName = supportedLanguages[targetLanguage]
    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiApiKey.value()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'manual_translation',
            strict: true,
            schema: translationSchema,
          },
        },
        messages: [
          {
            role: 'system',
            content:
              `Translate Japanese manufacturing inspection manual content into ${targetLanguageName}. ` +
              'Preserve the step IDs exactly. Keep numbers, units, model numbers, and safety symbols unchanged. ' +
              'Do not add explanations. Return the requested JSON only.',
          },
          {
            role: 'user',
            content: JSON.stringify(manual),
          },
        ],
      }),
    })

    if (!completion.ok) {
      const detail = await completion.text()
      console.error('OpenAI translation failed', completion.status, detail)
      throw new HttpsError('internal', 'AI translation could not be completed.')
    }

    const response = await completion.json()
    const content = response.choices?.[0]?.message?.content
    if (typeof content !== 'string') {
      throw new HttpsError('internal', 'AI translation returned an invalid response.')
    }

    try {
      return {
        ...JSON.parse(content),
        language: targetLanguage,
        translatedAt: new Date().toISOString(),
      }
    } catch {
      throw new HttpsError('internal', 'AI translation could not be read.')
    }
  },
)
