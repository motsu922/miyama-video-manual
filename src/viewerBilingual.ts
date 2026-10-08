export function getJapaneseOriginal(translated: string | undefined, original: string | undefined) {
  return translated?.trim() && original?.trim() && translated.trim() !== original.trim() ? original : ''
}

export function joinViewerText(translated: string, original: string | undefined) {
  const japanese = getJapaneseOriginal(translated, original)
  return japanese ? `${translated.trim()}\n${japanese.trim()}` : translated
}

