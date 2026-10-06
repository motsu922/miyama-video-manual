import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import type { Manual } from './types'
import { getFlowCardLayout } from './decisionFlowCards'
import { readManualSheet } from './excelManualLayout'

export type ImportedStep = { id: string; sheet: string; row: number; endRow?: number; title: string; detail: string }
export type ImportedPhoto = { id: string; sheet: string; name: string; file: File; stepId: string }
export type ExcelManualDraft = {
  title: string; department: string; owner: string; controlNo: string; productName: string
  sheets: string[]; steps: ImportedStep[]; photos: ImportedPhoto[]; warnings: string[]
}

const descendants = (element: Document | Element, name: string) => Array.from(element.getElementsByTagNameNS('*', name))
const relationId = (element: Element, name = 'id') => element.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', name) || ''
function resolvePath(base: string, target: string) {
  if (target.startsWith('/')) return target.slice(1)
  const parts = base.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/')
}
function relsPath(path: string) {
  const parts = path.split('/'); const name = parts.pop()
  return [...parts, '_rels', `${name}.rels`].join('/')
}

export async function readExcelManual(file: File): Promise<ExcelManualDraft> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Excel（.xlsx）を選択してください。.xls・PDF・Wordには対応していません。')
  if (file.size > 25 * 1024 * 1024) throw new Error('25MB以下のExcelを選択してください。')
  const data = await file.arrayBuffer()
  let zip: JSZip
  const workbook = new ExcelJS.Workbook()
  try {
    zip = await JSZip.loadAsync(data)
    if (Object.keys(zip.files).length > 2000) throw new Error('too many entries')
    await workbook.xlsx.load(data)
  } catch {
    throw new Error('Excelを読み込めませんでした。破損やパスワード保護がない .xlsx ファイルを選択してください。')
  }
  async function xml(path: string) {
    const entry = zip.file(path)
    if (!entry) return null
    const text = await entry.async('string')
    if (text.length > 20 * 1024 * 1024) throw new Error('Excel内のデータが大きすぎます。シートを分割してください。')
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    if (descendants(doc, 'parsererror').length) throw new Error('Excel内のXMLを読み込めませんでした。')
    // Choice and Fallback describe the same drawing. Never import both copies.
    for (const alternative of descendants(doc, 'AlternateContent')) {
      const choice = Array.from(alternative.children).find((child) => child.localName === 'Choice')
      if (choice) for (const child of Array.from(alternative.children)) if (child !== choice) child.remove()
    }
    return doc
  }
  async function relationships(path: string) {
    const doc = await xml(relsPath(path))
    return new Map(doc ? descendants(doc, 'Relationship')
      .filter((rel) => rel.getAttribute('TargetMode') !== 'External')
      .map((rel) => [rel.getAttribute('Id') || '', resolvePath(path, rel.getAttribute('Target') || '')]) : [])
  }
  const result: ExcelManualDraft = {
    title: file.name.replace(/\.xlsx$/i, ''), department: '', owner: '', controlNo: '', productName: '',
    sheets: [], steps: [], photos: [], warnings: [],
  }
  const bookXml = await xml('xl/workbook.xml')
  const bookRels = await relationships('xl/workbook.xml')
  let hasShapes = false
  let section = ''
  for (const sheet of workbook.worksheets) {
    if (sheet.state !== 'visible') { result.warnings.push(`「${sheet.name}」は非表示シートのため対象外です。`); continue }
    if (sheet.rowCount > 5000 || sheet.columnCount > 200) throw new Error('シートの行数・列数が多すぎます。帳票の範囲を絞ってください。')
    const layout = readManualSheet(sheet, section)
    if (!layout) { result.warnings.push(`「${sheet.name}」は「作業／作業内容／手順」見出しを検出できないため対象外です。`); continue }
    const { steps, metadata } = layout
    section = layout.section
    if (!result.sheets.length) {
      result.title = metadata.title || result.title
      result.department = metadata.department
      result.owner = metadata.owner
      result.controlNo = metadata.controlNo
      result.productName = metadata.productName
    }
    if (layout.skipped) result.warnings.push(`「${sheet.name}」：番号のみの空欄を${layout.skipped}件除外しました。`)
    if (!steps.length) { result.warnings.push(`「${sheet.name}」には手順がありません。`); continue }
    result.sheets.push(sheet.name)
    result.steps.push(...steps)
    const sheetEntry = bookXml && descendants(bookXml, 'sheet').find((item) => item.getAttribute('name') === sheet.name)
    const sheetPath = sheetEntry && bookRels.get(relationId(sheetEntry))
    if (!sheetPath) continue
    const sheetXml = await xml(sheetPath)
    const sheetRels = await relationships(sheetPath)
    for (const drawingRef of sheetXml ? descendants(sheetXml, 'drawing') : []) {
      const drawingPath = sheetRels.get(relationId(drawingRef))
      if (!drawingPath) continue
      const drawing = await xml(drawingPath)
      if (!drawing) continue
      const drawingRels = await relationships(drawingPath)
      const seen = new Set<string>()
      for (const anchor of Array.from(drawing.documentElement.children)) {
        const from = Array.from(anchor.children).find((child) => child.localName === 'from')
        const row = Number(from && descendants(from, 'row')[0]?.textContent) + 1
        const step = from ? steps.find((item) => item.row <= row && row <= item.endRow) : undefined
        const shapes = descendants(anchor, 'sp')
        if (shapes.length || descendants(anchor, 'cxnSp').length) hasShapes = true
        if (step) {
          const notes = shapes.map((shape) => descendants(shape, 't').map((text) => text.textContent || '').join('')).filter(Boolean)
          for (const note of notes) if (!step.detail.includes(note.trim())) step.detail += `\n\n図中の注記：${note.trim()}`
        }
        for (const pic of descendants(anchor, 'pic')) {
          const blip = descendants(pic, 'blip')[0]
          const mediaPath = blip && drawingRels.get(relationId(blip, 'embed'))
          if (!mediaPath) { result.warnings.push(`「${sheet.name}」に取り込めないリンク画像があります。`); continue }
          const extension = mediaPath.split('.').pop()?.toLowerCase() || ''
          const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
          if (!mime[extension]) { result.warnings.push(`「${sheet.name}」の ${extension} 画像は対象外です。PNG/JPEGに変換してください。`); continue }
          const key = `${step?.id || 'unassigned'}:${mediaPath}`
          if (seen.has(key)) continue
          seen.add(key)
          const entry = zip.file(mediaPath)
          if (!entry) throw new Error(`画像ファイルが見つかりません：${mediaPath}`)
          const bytes = await entry.async('arraybuffer')
          const name = `${sheet.name}-${mediaPath.split('/').pop()}`
          result.photos.push({ id: `${sheet.id}:${result.photos.length}`, sheet: sheet.name, name,
            file: new File([bytes], name, { type: mime[extension] }), stepId: step?.id || '' })
        }
      }
    }
  }
  if (!result.steps.length) throw new Error('手順を検出できませんでした。「作業」「作業内容」「手順」の列見出しがある帳票に対応しています。')
  if (result.steps.length > 300 || result.photos.length > 300) throw new Error('手順・写真はそれぞれ300件以内に分割してください。')
  result.warnings.push('写真は元画像を取り込みます。Excel上のトリミング・回転は反映されません。写真の割り当ては配置から推定しているため、元Excelと照合してください。')
  if (hasShapes) result.warnings.unshift('Excelの矢印・囲み・図形の配置は再現されません。図形内の文字は「図中の注記」に残します。元Excelと照合し、必要な図形を追加してください。')
  result.warnings = [...new Set(result.warnings)]
  return result
}

export function buildImportedManual(draft: ExcelManualDraft, id: string, photoUrls: Map<string, string>, sourceUrl: string, sourceName: string): Manual {
  if (!draft.title.trim() || !draft.steps.length || draft.steps.some((step) => !step.title.trim())) throw new Error('手順書名と各手順の作業内容を入力してください。')
  const now = new Date().toISOString()
  const steps = draft.steps.map((step, index) => ({
    id: index + 1, time: '00:00', title: step.title.trim(), detail: step.detail.trim(),
    inspectionImages: draft.photos.filter((photo) => photo.stepId === step.id).map((photo) => {
      const url = photoUrls.get(photo.id)
      if (!url) throw new Error('写真のアップロードが完了していません。')
      return { id: `import-${photo.id}`, kind: 'criteria' as const, name: photo.name, url, originalUrl: url, uploadedAt: now }
    }),
  }))
  let y = 40
  const nodes = steps.map((step, index) => {
    const node = { id: `import-step-${step.id}`, type: 'action' as const, title: step.title, detail: step.detail,
      sourceStepId: step.id, flowPosition: { x: 40, y },
      media: step.inspectionImages.map((photo) => ({ id: photo.id, kind: 'image' as const, name: photo.name, url: photo.url, uploadedAt: now })),
      nextNodeId: index < steps.length - 1 ? `import-step-${step.id + 1}` : 'import-end' }
    y += getFlowCardLayout(step.title, 'action').height + 64
    return node
  })
  return {
    id, title: draft.title.trim(), workName: draft.title.trim(), department: draft.department.trim(), owner: draft.owner.trim(),
    controlNo: draft.controlNo.trim(), productName: draft.productName.trim(), status: 'draft', version: 'v0.1', duration: '00:00',
    updatedAt: now.slice(0, 10), videoUrl: '', thumbnail: steps.flatMap((step) => step.inspectionImages)[0]?.url || '',
    tags: [], kind: 'standard', steps, reviewers: [], checks: [], manualImages: [], inspectionImages: [],
    decisionStartNodeId: nodes[0].id,
    decisionNodes: [...nodes, { id: 'import-end', type: 'end', title: '完了', detail: '', flowPosition: { x: 40, y } }],
    sourceDocument: { name: sourceName, url: sourceUrl },
    approvalHistory: [{ id: `created-${id}`, action: 'created', actor: draft.owner.trim() || '作成者', createdAt: now, comment: `Excelインポート：${sourceName}` }],
  }
}

