import { expect, test } from '@playwright/test'
import { openScript, waitForState } from './helpers'

test('right hand view control and centered pinch fire destroy an enemy', async ({ page }) => {
  await openScript(page, 'weapon')
  const killed = await waitForState(page, (state) => state.score >= 100 && state.kills >= 1)

  expect(killed.shotsFired).toBeGreaterThanOrEqual(3)
  expect(killed.hits).toBeGreaterThanOrEqual(3)
  expect(killed.enemyCount).toBeLessThan(5)

  const firingFinished = await waitForState(page, (state) => !state.control.fire && state.shotsFired > 0)
  expect(firingFinished.shotsFired).toBeLessThanOrEqual(9)
})
