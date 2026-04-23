import { test, expect, _electron as electron } from '@playwright/test'

test.describe('Flint Overlay', () => {
  test('app launches and shows overlay', async () => {
    const app = await electron.launch({ args: ['./out/main/index.js'] })
    const window = await app.firstWindow()

    await window.waitForSelector('[data-testid="app-root"]', { timeout: 10_000 })

    const header = await window.textContent('header')
    expect(header).toContain('FLINT')

    await app.close()
  })
})
