import { expect, test } from '@playwright/test'
import { openScript, waitForState } from './helpers'

test('left hand virtual stick moves the player forward and sideways', async ({ page }) => {
  const initial = await openScript(page, 'movement')
  const forward = await waitForState(page, (state) => state.player.position.z < -4)
  const strafed = await waitForState(page, (state) => state.player.position.x > 3)

  expect(initial.player.position.z).toBeCloseTo(0, 1)
  expect(forward.player.position.z).toBeLessThan(-4)
  expect(strafed.player.position.x).toBeGreaterThan(3)
})
