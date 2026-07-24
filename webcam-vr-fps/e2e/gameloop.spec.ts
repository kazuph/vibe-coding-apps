import { expect, test } from '@playwright/test'
import { openScript, waitForState } from './helpers'

test('enemy fire is visible but player HP and game over are removed during kill validation', async ({ page }) => {
  await openScript(page, 'gameloop')
  const enemyFire = await waitForState(page, (state) => state.enemyShotsFired > 0)

  expect(enemyFire.enemyShotsFired).toBeGreaterThan(0)
  expect('hp' in enemyFire).toBe(false)
  expect(enemyFire.damageFlash).toBe(0)
  expect(enemyFire.gameOver).toBe(false)
})
