import { describe, expect, it } from 'vitest'
import {
  HysteresisGesture,
  computeFingerExtensionScore,
  computeFingerExtensions,
  computePinchRatio,
} from '../src/control/gestureFsm'
import type { Landmark } from '../src/control/types'

const hand = (thumb: number, index: number, middle: number, ring: number, pinky: number): Landmark[] => {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))
  points[0] = { x: 0, y: 0, z: 0 }
  points[9] = { x: 0, y: 1, z: 0 }
  points[4] = { x: thumb, y: 0, z: 0 }
  points[8] = { x: 0, y: index, z: 0 }
  points[12] = { x: 0, y: middle, z: 0 }
  points[16] = { x: 0, y: ring, z: 0 }
  points[20] = { x: 0, y: pinky, z: 0 }
  return points
}

const realisticHand = (fingers: { index: boolean; middle: boolean; ring: boolean; pinky: boolean }): Landmark[] => {
  const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))
  points[0] = { x: 0, y: 0, z: 0 }
  points[1] = { x: -0.08, y: 0.12, z: 0 }
  points[2] = { x: -0.14, y: 0.2, z: 0 }
  points[3] = { x: -0.18, y: 0.27, z: 0 }
  points[4] = { x: -0.22, y: 0.32, z: 0 }

  const setFinger = (mcp: number, pip: number, dip: number, tip: number, x: number, extended: boolean): void => {
    points[mcp] = { x, y: 0.28, z: 0 }
    points[pip] = { x, y: 0.48, z: 0 }
    points[dip] = { x, y: extended ? 0.68 : 0.36, z: extended ? 0 : 0.05 }
    points[tip] = { x, y: extended ? 0.88 : 0.34, z: extended ? 0 : 0.12 }
  }

  setFinger(5, 6, 7, 8, -0.1, fingers.index)
  setFinger(9, 10, 11, 12, 0, fingers.middle)
  setFinger(13, 14, 15, 16, 0.1, fingers.ring)
  setFinger(17, 18, 19, 20, 0.2, fingers.pinky)
  return points
}

describe('HysteresisGesture', () => {
  it('keeps an open-palm gesture stable between on/off thresholds', () => {
    const openPalm = new HysteresisGesture({ onThreshold: 0.8, offThreshold: 0.62 })

    expect(openPalm.update(0.79)).toBe(false)
    expect(openPalm.update(0.83)).toBe(true)
    expect(openPalm.update(0.7)).toBe(true)
    expect(openPalm.update(0.63)).toBe(true)
    expect(openPalm.update(0.61)).toBe(false)
  })

  it('keeps pinch active until the wider release threshold is crossed', () => {
    const pinch = new HysteresisGesture({ onThreshold: 0.35, offThreshold: 0.48, lowerIsOn: true })

    expect(pinch.update(0.36)).toBe(false)
    expect(pinch.update(0.31)).toBe(true)
    expect(pinch.update(0.42)).toBe(true)
    expect(pinch.update(0.49)).toBe(false)
  })
})

describe('gesture scores', () => {
  it('detects open palm from per-finger curl instead of raw fingertip distance', () => {
    const open = realisticHand({ index: true, middle: true, ring: true, pinky: true })
    const fist = realisticHand({ index: false, middle: false, ring: false, pinky: false })

    expect(computeFingerExtensions(open).map((finger) => finger.extended)).toEqual([true, true, true, true])
    expect(computeFingerExtensionScore(open)).toBe(1)
    expect(computeFingerExtensions(fist).map((finger) => finger.extended)).toEqual([false, false, false, false])
    expect(computeFingerExtensionScore(fist)).toBe(0)
  })

  it('keeps jet off for a fist and releases on two-or-fewer extended fingers', () => {
    const openPalm = new HysteresisGesture({ onThreshold: 0.8, offThreshold: 0.62 })
    const fist = realisticHand({ index: false, middle: false, ring: false, pinky: false })
    const halfOpen = realisticHand({ index: true, middle: true, ring: false, pinky: false })
    const almostOpen = realisticHand({ index: true, middle: true, ring: true, pinky: false })
    const open = realisticHand({ index: true, middle: true, ring: true, pinky: true })

    expect(openPalm.update(computeFingerExtensionScore(fist))).toBe(false)
    expect(openPalm.update(computeFingerExtensionScore(almostOpen))).toBe(false)
    expect(openPalm.update(computeFingerExtensionScore(open))).toBe(true)
    expect(openPalm.update(computeFingerExtensionScore(almostOpen))).toBe(true)
    expect(openPalm.update(computeFingerExtensionScore(halfOpen))).toBe(false)
    expect(openPalm.update(computeFingerExtensionScore(fist))).toBe(false)
  })

  it('normalizes pinch distance by hand scale', () => {
    const points = hand(0.1, 0.1, 0.8, 0.8, 0.8)
    points[4] = { x: 0.1, y: 0.1, z: 0 }
    points[8] = { x: 0.32, y: 0.1, z: 0 }
    expect(computePinchRatio(points)).toBeCloseTo(0.22, 2)
  })
})
