import { expect, test } from '@playwright/test'
import { openScript, waitForState } from './helpers'

test('right hand turn drives the player camera without face tracking', async ({ page }) => {
  const initial = await openScript(page, 'view-control')
  const moved = await waitForState(page, (state) => state.player.yaw > 1.2)

  expect('face' in initial.control.tracking).toBe(false)
  expect(initial.player.yaw).toBeCloseTo(0, 1)
  expect(moved.player.yaw).toBeGreaterThan(1.2)
  expect(moved.player.pitch).toBeGreaterThan(0.35)
})
