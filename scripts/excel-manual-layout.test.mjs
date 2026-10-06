import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { readManualSheet } from '../src/excelManualLayout.ts'

function form() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('1')
  for (const [range, text] of [['A3:C3', '作業名'], ['D3:AA5', 'テスト作業'], ['C7:N7', '作　業'], ['O7:Z7', '図'], ['AA7:AL7', '確認ポイント']]) {
    sheet.mergeCells(range); sheet.getCell(range.split(':')[0]).value = text
  }
  for (const [row, number] of [[8, '①'], [18, '２'], [28, '(3)']]) {
    sheet.mergeCells(`A${row}:B${row + 8}`); sheet.getCell(`A${row}`).value = number
  }
  return sheet
}

test('numbered blocks collect all work cells and checkpoint lines, retaining order', () => {
  const sheet = form()
  sheet.getCell('C8').value = '＜装置＞'
  sheet.getCell('D9').value = '点検項目'
  sheet.getCell('D11').value = '判定内容'
  sheet.getCell('D12').value = '続き'
  sheet.getCell('AA9').value = '※'
  sheet.getCell('AB9').value = '毎月'
  sheet.getCell('AB10').value = '確認する'
  sheet.getCell('C19').value = '・'
  sheet.getCell('D19').value = '次の作業'
  sheet.getCell('D21').value = '↓'
  sheet.getCell('D23').value = '記録する'
  const result = readManualSheet(sheet)
  assert.equal(result.metadata.title, 'テスト作業')
  assert.equal(result.steps.length, 2)
  assert.equal(result.skipped, 1)
  assert.equal(result.steps[0].title, '＜装置＞\n点検項目\n判定内容\n続き')
  assert.equal(result.steps[0].detail, '※ 毎月\n確認する')
  assert.equal(result.steps[1].title, '＜装置＞\n・ 次の作業\n↓\n記録する')
  assert.equal(result.steps[1].endRow, 27, 'empty third slot is not merged into step two')
})

test('section names carry across pages and can change without creating empty steps', () => {
  const sheet = form()
  sheet.getCell('D9').value = '続きの作業'
  sheet.getCell('C18').value = '＜別の装置＞'
  sheet.getCell('D19').value = '別の作業'
  const result = readManualSheet(sheet, '＜前の装置＞')
  assert.ok(result.steps[0].title.startsWith('＜前の装置＞'))
  assert.ok(result.steps[1].title.startsWith('＜別の装置＞'))
  assert.equal(result.section, '＜別の装置＞')
})

test('risk table outside print area retains separate risk records and last-row continuation', () => {
  const sheet = form()
  sheet.pageSetup.printArea = 'A1:AL37'
  for (const [cell, value] of Object.entries({ AN4: '記号', AR4: '危険源名', AV4: '危険源情報', AZ1: '危害発生のシナリオ', BP1: '災害の程度\nS', BS1: '危険源に\n近づく頻度\nF', BV1: '災害の\n可能性\nP', BY1: '見積り\nR', D9: '第一作業', D19: '第二作業', D29: '第三作業', AN8: 'A', AR8: '装置', AZ8: '第一のリスク', BP8: 3, BS8: 2, BV8: 1, BY8: 'Ⅲ', AN11: 'B', AZ11: '第二のリスク', AN37: 'C', AZ37: '末尾のリスク' })) sheet.getCell(cell).value = value
  const result = readManualSheet(sheet)
  assert.match(result.steps[0].detail, /危害発生のシナリオ：第一のリスク/)
  assert.match(result.steps[0].detail, /記号：B\n危害発生のシナリオ：第二のリスク/)
  assert.match(result.steps[0].detail, /見積り R：Ⅲ/)
  assert.equal(result.steps[1].detail, '')
  assert.match(result.steps[2].detail, /末尾のリスク/)
})

test('single-cell merged manuals and unnumbered row tables remain supported', () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('手順')
  sheet.getCell('A1').value = '作業内容'; sheet.getCell('D1').value = '確認ポイント'
  sheet.mergeCells('A2:C4'); sheet.getCell('A2').value = '作業1\n説明'
  sheet.getCell('D2').value = '確認1'; sheet.getCell('D3').value = '確認の続き'
  sheet.getCell('A5').value = '作業2'; sheet.getCell('D5').value = '確認2'
  const result = readManualSheet(sheet)
  assert.equal(result.steps.length, 2)
  assert.equal(result.steps[0].title, '作業1\n説明')
  assert.equal(result.steps[0].detail, '確認1\n確認の続き')
  assert.equal(result.steps[1].detail, '確認2')
})

test('unsupported and number-only sheets are not treated as real procedures', () => {
  const sheet = form()
  assert.equal(readManualSheet(sheet).steps.length, 0)
  const other = new ExcelJS.Workbook().addWorksheet('説明')
  other.getCell('A1').value = '説明'
  assert.equal(readManualSheet(other), null)
})

