import { expect, test } from '@playwright/test'
import { WORLD_BOUNDS } from '../src/game/player'
import { openScript, waitForState } from './helpers'

test('boundary collision clamps flight without triggering game over', async ({ page }) => {
  await openScript(page, 'boundary')

  const ceilingHit = await waitForState(page, (state) => (
    state.player.position.y >= WORLD_BOUNDS.ceilingY - 0.05 &&
    state.player.velocityY <= 0
  ))
  expect(ceilingHit.gameOver).toBe(false)
  expect(ceilingHit.player.position.y).toBeLessThanOrEqual(WORLD_BOUNDS.ceilingY)
  expect(ceilingHit.player.velocityY).toBeLessThanOrEqual(0)

  const wallHit = await waitForState(page, (state) => (
    state.player.position.x >= WORLD_BOUNDS.maxX - 0.05
  ))
  expect(wallHit.gameOver).toBe(false)
  expect(wallHit.player.position.x).toBeLessThanOrEqual(WORLD_BOUNDS.maxX)
})
