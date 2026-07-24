import { expect, type Page } from '@playwright/test'
import type { DebugState } from '../src/game/loop'

export async function openScript(page: Page, fixture: string): Promise<DebugState> {
  await page.goto(`/?source=script&script=/fixtures/${fixture}.json`, { waitUntil: 'domcontentloaded' })
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await page.waitForFunction(() => Boolean(window.__game), undefined, { timeout: 10_000 })
      await page.waitForFunction(() => window.__game?.debugState().running === true, undefined, { timeout: 10_000 })
      return await page.evaluate(() => {
        if (!window.__game) throw new Error('debug API missing')
        window.__game.restart()
        return window.__game.debugState()
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('Execution context was destroyed') || attempt === 4) throw error
      await page.waitForLoadState('domcontentloaded').catch(() => undefined)
    }
  }
  throw new Error('debug API missing')
}

export async function debugState(page: Page): Promise<DebugState> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate(() => {
        if (!window.__game) throw new Error('debug API missing')
        return window.__game.debugState()
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('Execution context was destroyed') || attempt === 2) throw error
      await page.waitForFunction(() => Boolean(window.__game), undefined, { timeout: 5_000 })
    }
  }
  throw new Error('debug API missing')
}

export async function waitForState(page: Page, predicate: (state: DebugState) => boolean): Promise<DebugState> {
  let matched: DebugState | undefined
  await expect
    .poll(async () => {
      const state = await debugState(page)
      const pass = predicate(state)
      if (pass) matched = state
      return pass
    }, { timeout: 25_000 })
    .toBe(true)
  return matched ?? debugState(page)
}

export async function startStateRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const recorderWindow = window as typeof window & { __e2eStateHistory?: DebugState[] }
    const history: DebugState[] = []
    recorderWindow.__e2eStateHistory = history
    const record = (): void => {
      if (window.__game) history.push(window.__game.debugState())
      requestAnimationFrame(record)
    }
    requestAnimationFrame(record)
  })
}

export async function clearStateRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const recorderWindow = window as typeof window & { __e2eStateHistory?: DebugState[] }
    if (recorderWindow.__e2eStateHistory) recorderWindow.__e2eStateHistory.length = 0
  })
}

export async function waitForRecordedState(
  page: Page,
  predicate: (state: DebugState) => boolean,
): Promise<DebugState> {
  let matched: DebugState | undefined
  await expect
    .poll(async () => {
      const states = await page.evaluate(() => {
        const recorderWindow = window as typeof window & { __e2eStateHistory?: DebugState[] }
        return recorderWindow.__e2eStateHistory ?? []
      })
      const matchedIndex = states.findIndex(predicate)
      if (matchedIndex < 0) return false
      matched = states[matchedIndex]
      await page.evaluate((consumedCount) => {
        const recorderWindow = window as typeof window & { __e2eStateHistory?: DebugState[] }
        recorderWindow.__e2eStateHistory?.splice(0, consumedCount)
      }, matchedIndex + 1)
      return true
    }, { timeout: 25_000 })
    .toBe(true)
  return matched ?? debugState(page)
}
