import { expect, test } from '@playwright/test'
import { openScript, waitForState } from './helpers'

test('open left hand activates jet ascent and closing it lets gravity pull down', async ({ page }) => {
  await openScript(page, 'jet-flight')
  const ascended = await waitForState(page, (state) => state.player.position.y > 5)
  const descended = await waitForState(page, (state) => state.player.position.y < ascended.player.position.y - 1)

  expect(ascended.player.fuel).toBeLessThan(3.5)
  expect(descended.player.position.y).toBeLessThan(ascended.player.position.y)
})
