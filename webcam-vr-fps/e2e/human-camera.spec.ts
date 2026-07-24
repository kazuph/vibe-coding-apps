import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { clearStateRecorder, startStateRecorder, waitForRecordedState } from './helpers'

const humanHandsFixture = fileURLToPath(new URL('./fixtures/human-hands.y4m', import.meta.url))

test('calibration opens the controls panel, then auto-collapses and remains toggleable', async ({ page }) => {
  test.setTimeout(30_000)
  await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'START CAMERA' }).click()
  await expect(page.locator('.calibration')).toBeHidden()

  const toggle = page.locator('.controls-toggle')
  const controls = page.locator('#controls-panel')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(controls).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false', { timeout: 10_000 })
  await expect(controls).toBeHidden()

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(controls).toBeVisible()
})

test('staged real-human hand images drive the production perception and game path in order', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const browserFailures: string[] = []
  page.on('pageerror', (error) => {
    browserFailures.push(`pageerror: ${error.message}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') browserFailures.push(`console error: ${message.text()}`)
  })
  page.on('requestfailed', (request) => {
    browserFailures.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'unknown error'}`)
  })
  page.on('response', (response) => {
    if (!response.ok()) browserFailures.push(`response error: ${response.status()} ${response.url()}`)
  })

  expect(existsSync(humanHandsFixture), `missing real-human camera fixture: ${humanHandsFixture}`).toBe(true)

  await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' })
  expect(page.url()).not.toContain('source=script')
  await page.getByRole('button', { name: 'START CAMERA' }).click()

  await page.waitForFunction(() => Boolean(window.__game))
  await startStateRecorder(page)
  await expect(page.locator('.calibration')).toBeHidden()

  const tracking = await waitForRecordedState(page, (state) => (
    state.control.tracking.leftHand && state.control.tracking.rightHand
  ))
  expect(tracking.control.tracking).toEqual({ leftHand: true, rightHand: true })
  await expect(page.locator('.signal-meter')).toContainText('left=true right=true')

  const fist = await waitForRecordedState(page, (state) => (
    state.control.tracking.leftHand &&
    state.control.tracking.rightHand &&
    !state.control.jet.active &&
    !state.control.fire
  ))
  expect(fist.control.jet).toEqual({ active: false, thrust: 0 })
  expect(fist.control.fire).toBe(false)

  const moved = await waitForRecordedState(page, (state) => (
    state.control.tracking.leftHand &&
    state.control.tracking.rightHand &&
    state.control.move.x > 0 &&
    state.control.view.yawRate === 0 &&
    state.control.view.pitch === 0 &&
    state.player.position.x > fist.player.position.x &&
    !state.control.jet.active &&
    !state.control.fire
  ))
  expect(moved.control.move.x).toBeGreaterThan(0)
  expect(moved.player.position.x).toBeGreaterThan(fist.player.position.x)

  const jet = await waitForRecordedState(page, (state) => (
    state.control.tracking.leftHand &&
    state.control.tracking.rightHand &&
    state.control.jet.active &&
    state.control.view.yawRate === 0 &&
    state.control.view.pitch === 0 &&
    !state.control.fire
  ))
  expect(jet.control.jet).toEqual({ active: true, thrust: 1 })
  const ascended = await waitForRecordedState(page, (state) => (
    state.player.position.y > fist.player.position.y &&
    state.player.fuel < fist.player.fuel
  ))
  expect(ascended.player.position.y).toBeGreaterThan(fist.player.position.y)
  expect(ascended.player.fuel).toBeLessThan(fist.player.fuel)

  const viewChanged = await waitForRecordedState(page, (state) => (
    state.control.tracking.leftHand &&
    state.control.tracking.rightHand &&
    Math.abs(state.control.view.yawRate) > 0 &&
    Math.abs(state.control.view.pitch) > 0 &&
    state.control.move.x === 0 &&
    state.control.move.z === 0 &&
    !state.control.jet.active &&
    state.player.yaw !== jet.player.yaw &&
    state.player.pitch !== jet.player.pitch &&
    !state.control.fire
  ))
  expect(Math.abs(viewChanged.control.view.yawRate)).toBeGreaterThan(0)
  expect(Math.abs(viewChanged.control.view.pitch)).toBeGreaterThan(0)
  expect(viewChanged.player.yaw).not.toBe(jet.player.yaw)
  expect(viewChanged.player.pitch).not.toBe(jet.player.pitch)

  const viewNeutral = await waitForRecordedState(page, (state) => (
    state.control.tracking.leftHand &&
    state.control.tracking.rightHand &&
    state.control.view.yawRate === 0 &&
    state.control.view.pitch === 0 &&
    state.control.move.x === 0 &&
    state.control.move.z === 0 &&
    !state.control.jet.active &&
    !state.control.fire
  ))
  const viewStayedNeutral = await waitForRecordedState(page, (state) => (
    state.control.tracking.leftHand &&
    state.control.tracking.rightHand &&
    state.control.view.yawRate === 0 &&
    state.control.view.pitch === 0 &&
    state.control.move.x === 0 &&
    state.control.move.z === 0 &&
    !state.control.jet.active &&
    state.player.yaw === viewNeutral.player.yaw &&
    !state.control.fire
  ))
  expect(viewStayedNeutral.player.yaw).toBe(viewNeutral.player.yaw)

  const firing = await waitForRecordedState(page, (state) => (
    state.control.tracking.leftHand &&
    state.control.tracking.rightHand &&
    state.control.move.x === 0 &&
    state.control.move.z === 0 &&
    state.control.fire &&
    !state.control.jet.active
  ))
  const shots = await waitForRecordedState(page, (state) => state.shotsFired > firing.shotsFired)
  expect(shots.shotsFired).toBeGreaterThan(firing.shotsFired)
  const killed = await waitForRecordedState(page, (state) => state.kills >= 1)
  expect(killed.score).toBeGreaterThanOrEqual(100)
  expect(killed.hits).toBeGreaterThanOrEqual(3)
  expect(killed.enemyCount).toBeLessThan(fist.enemyCount)
  await testInfo.attach('real-human-camera-enemy-defeat', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })

  const rightHandLost = await waitForRecordedState(page, (state) => (
    state.control.tracking.leftHand &&
    !state.control.tracking.rightHand &&
    !state.control.fire
  ))
  expect(rightHandLost.control.tracking.leftHand).toBe(true)
  expect(rightHandLost.control.fire).toBe(false)
  expect(rightHandLost.shotsFired).toBeLessThanOrEqual(96)
  const rightInputDecayed = await waitForRecordedState(page, (state) => (
    state.control.tracking.leftHand &&
    !state.control.tracking.rightHand &&
    state.control.view.yawRate === 0 &&
    state.control.view.pitch === 0
  ))
  expect(Math.abs(rightInputDecayed.control.view.yawRate)).toBe(0)
  expect(Math.abs(rightInputDecayed.control.view.pitch)).toBe(0)

  const recovered = await waitForRecordedState(page, (state) => (
    state.control.tracking.leftHand && state.control.tracking.rightHand
  ))
  expect(recovered.control.tracking).toEqual({ leftHand: true, rightHand: true })
  await clearStateRecorder(page)
  await page.keyboard.press('KeyR')
  await expect(page.locator('.calibration')).toBeVisible()
  await expect(page.locator('.calibration')).toBeHidden()

  const recalibrated = await waitForRecordedState(page, (state) => (
    state.running &&
    state.control.tracking.leftHand &&
    state.control.tracking.rightHand &&
    !state.control.jet.active &&
    !state.control.fire
  ))
  expect(recalibrated.running).toBe(true)
  await expect(page.locator('[data-score]')).toBeVisible()
  await expect(page.locator('[data-score]')).toHaveText(recalibrated.score.toString())
  await expect(page.locator('[data-target-text]')).toHaveText(recalibrated.enemyCount.toString())
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  await testInfo.attach('real-human-camera-recalibrated-hud', {
    body: await page.locator('.hud-panel').screenshot(),
    contentType: 'image/png',
  })
  await testInfo.attach('real-human-camera-observed-states', {
    body: Buffer.from(JSON.stringify({
      fist,
      moved,
      jet,
      ascended,
      viewChanged,
      viewNeutral,
      viewStayedNeutral,
      firing,
      shots,
      killed,
      rightHandLost,
      rightInputDecayed,
      recovered,
      recalibrated,
    }, null, 2)),
    contentType: 'application/json',
  })
  await testInfo.attach('real-human-camera-recalibrated', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  expect(browserFailures).toEqual([])
})
