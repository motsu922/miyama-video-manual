export async function unlockViewer(page) {
  const password = process.env.TEST_VIEWER_PASSWORD
  if (!password) throw Error('Set TEST_VIEWER_PASSWORD to run browser tests against the locked viewer')
  await page.getByLabel('閲覧パスワード', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'マニュアルを開く', exact: true }).click()
  await page.locator('.manual-access-screen').waitFor({ state: 'hidden' })
}

