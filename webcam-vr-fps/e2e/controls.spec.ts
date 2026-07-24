import { expect, test } from '@playwright/test'
import { openScript } from './helpers'

const viewports = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 },
]

for (const viewport of viewports) {
  test(`controls panel toggles accessibly without overflowing on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await openScript(page, 'view-control')

    const toggle = page.locator('.controls-toggle')
    const controls = page.locator('#controls-panel')
    await expect(toggle).toHaveAccessibleName('操作ガイドを開く')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(controls).toBeHidden()

    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveAccessibleName('操作ガイドを閉じる')
    await expect(controls).toBeVisible()
    await expect(controls).toContainText('CENTER NEUTRAL')
    await expect(controls).toContainText('THUMB + INDEX FIRE')
    await expect(controls).toContainText('上下: 前後 / 左右: ストラフ')
    await expect(controls).toContainText('OPEN PALM JET（燃料制）')
    await expect(controls).toContainText('両手の操作位置を再校正')
    const icons = controls.locator('.control-hand-image')
    await expect(icons).toHaveCount(2)
    await expect(icons.first()).toHaveAttribute('src', /\/ui\/controls-left-hand\.png$/)
    await expect(icons.nth(1)).toHaveAttribute('src', /\/ui\/controls-right-hand\.png$/)
    for (const icon of await icons.all()) {
      await expect(icon).toHaveAttribute('alt', /.+/)
    }
    const recalibrate = controls.locator('.recalibrate-control')
    await expect(recalibrate.locator('img')).toHaveCount(0)
    await expect(recalibrate.getByLabel('Rキー')).toHaveText('R')

    const panel = await page.locator('.hud-panel').boundingBox()
    expect(panel).not.toBeNull()
    expect(panel!.x).toBeGreaterThanOrEqual(0)
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport.width)
    expect(panel!.y).toBeGreaterThanOrEqual(0)
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport.height)

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(toggle).toHaveAccessibleName('操作ガイドを開く')
    await expect(controls).toBeHidden()
  })
}
