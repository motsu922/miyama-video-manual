import type { Worksheet } from 'exceljs'

export type ExcelManualStep = { id: string; sheet: string; row: number; endRow: number; title: string; detail: string }
type CellText = { col: number; text: string }
type TextRow = { row: number; cells: CellText[] }
const clean = (value: string) => value.split(/\r?\n/).map((line) => line.trim()).join('\n').trim()
const heading = (value: string) => value.normalize('NFKC').replace(/\s/g, '')
const titleHeader = /^(作業|作業内容|手順内容|作業手順|手順|作業項目)$/
const detailHeader = /^(確認ポイント|注意事項|ポイント|詳細|作業指示|判定基準)$/

export function readManualSheet(sheet: Worksheet, precedingSection = '') {
  const rows: TextRow[] = []
  sheet.eachRow((row, rowNumber) => {
    const cells: CellText[] = []
    row.eachCell((cell, col) => {
      if (cell.isMerged && cell.master.address !== cell.address) return
      if (cell.text.trim()) cells.push({ col, text: clean(cell.text) })
    })
    if (cells.length) rows.push({ row: rowNumber, cells })
  })
  const header = rows.find((row) => row.cells.some((cell) => titleHeader.test(heading(cell.text))))
  if (!header) return null
  const titleCol = header.cells.find((cell) => titleHeader.test(heading(cell.text)))!.col
  const detailCol = header.cells.find((cell) => detailHeader.test(heading(cell.text)))?.col
  const merges = sheet.model.merges.map((range) => {
    const [start, end = start] = range.split(':')
    const first = sheet.getCell(start); const last = sheet.getCell(end)
    return { top: Number(first.row), left: Number(first.col), bottom: Number(last.row), right: Number(last.col) }
  })
  const titleEnd = merges.find((merge) => merge.top === header.row && merge.left === titleCol)?.right
    ?? (header.cells.find((cell) => cell.col > titleCol)?.col ?? titleCol + 1) - 1
  const detailEnd = detailCol === undefined ? 0 : merges.find((merge) => merge.top === header.row && merge.left === detailCol)?.right
    ?? (header.cells.find((cell) => cell.col > detailCol)?.col ?? detailCol + 1) - 1
  const metadata = (labels: RegExp) => {
    for (const row of rows.filter((item) => item.row < header.row)) {
      const index = row.cells.findIndex((cell) => labels.test(heading(cell.text)))
      if (index < 0) continue
      const label = row.cells[index]
      const master = sheet.getCell(row.row, label.col)
      const below = sheet.getCell(row.row + 1, label.col)
      if ((!below.isMerged || below.master.address !== master.address) && below.text.trim()) return clean(below.text)
      return row.cells[index + 1]?.text || ''
    }
    return ''
  }
  const numberRows = rows.filter((row) => row.row > header.row && row.cells.some((cell) =>
    cell.col < titleCol && /^(?:\d+[.)、]?|\(\d+\))$/.test(heading(cell.text))))
  const starts = numberRows.length ? numberRows : rows.filter((row) => row.row > header.row && row.cells.some((cell) =>
    cell.col === titleCol && !titleHeader.test(heading(cell.text))))
  const regionLines = (start: number, end: number, left: number, right: number) => rows
    .filter((row) => row.row >= start && row.row <= end)
    .map((row) => row.cells.filter((cell) => cell.col >= left && cell.col <= right).map((cell) => cell.text).join(' ')).filter(Boolean)
  // Risk-assessment columns can extend beyond the printed work table. Keep their labels and row relationships.
  const riskLabels = /^(記号|危険源名|危険源情報|危害発生のシナリオ|災害の程度S?|危険源に近づく頻度F?|災害の可能性P?|見積[り]?R?)$/
  const riskColumns = rows.filter((row) => row.row < header.row).flatMap((row) => row.cells)
    .filter((cell) => cell.col > Math.max(titleEnd, detailEnd) && riskLabels.test(heading(cell.text)))
    .sort((a, b) => a.col - b.col)
  let section = precedingSection
  let skipped = 0
  const steps: ExcelManualStep[] = []
  for (const [index, start] of starts.entries()) {
    const next = starts[index + 1]?.row
    const marker = start.cells.find((cell) => numberRows.length ? cell.col < titleCol : cell.col === titleCol)
    const mergedEnd = merges.find((merge) => merge.top === start.row && merge.left === marker?.col)?.bottom
    const endRow = next ? next - 1 : Math.min(sheet.rowCount, mergedEnd === undefined ? sheet.rowCount : mergedEnd + 1)
    const workLines = regionLines(start.row, endRow, titleCol, titleEnd)
    const content = workLines.filter((line) => {
      if (/^[＜<〈《].+[＞>〉》]$/.test(line)) { section = line; return false }
      return !/^[・●○※\s↓→]+$/.test(line)
    })
    if (!content.length) { skipped++; continue }
    // Keep arrows and other sequencing marks in a populated block, but not empty template slots.
    const title = [section, ...workLines.filter((line) => !/^[＜<〈《].+[＞>〉》]$/.test(line))].filter(Boolean).join('\n')
    let detail = detailCol === undefined ? '' : regionLines(start.row, endRow, detailCol, detailEnd).join('\n')
    const risks = rows.filter((row) => row.row >= start.row && row.row < (next ?? sheet.rowCount + 1)).flatMap((row) => {
      const fields = riskColumns.flatMap((column) => {
        const value = row.cells.find((cell) => cell.col === column.col)?.text
        return value ? [`${column.text.replace(/\n/g, ' ')}：${value}`] : []
      })
      return fields.length ? [fields.join('\n')] : []
    })
    if (risks.length) detail += `${detail ? '\n\n' : ''}【危険源・リスク情報】\n${risks.join('\n\n')}`
    steps.push({ id: `${sheet.id}:${start.row}`, sheet: sheet.name, row: start.row, endRow, title, detail })
  }
  return { steps, section, skipped, metadata: {
    title: metadata(/^(作業名|手順書名|タイトル)$/), department: metadata(/^(適応部署|適用部署|部署|担当部署)$/),
    owner: metadata(/^(作成|作成者)$/), controlNo: metadata(/^(整理No[.]?|整理番号|管理番号)$/i), productName: metadata(/^(品名|製品名)$/),
  } }
}

