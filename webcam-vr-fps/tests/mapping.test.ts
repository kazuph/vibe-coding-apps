import { describe, expect, it } from 'vitest'
import { IntentMapper, clampPitch, mapHandToMove, mapRightHandToView, smoothAxis } from '../src/control/intentMapper'
import type { Landmark, RawHand } from '../src/control/types'

function handAt(handedness: RawHand['handedness'], x: number, y: number): RawHand {
  const landmarks: Landmark[] = Array.from({ length: 21 }, () => ({ x, y, z: 0 }))
  return { handedness, landmarks }
}

describe('control mapping', () => {
  it('maps right hand horizontal offset from the screen center regardless of calibration', () => {
    expect(mapRightHandToView({ x: 0.5, y: 0.5 })).toEqual({ yawRate: 0, pitch: 0 })
    expect(mapRightHandToView({ x: 0.28, y: 0.5 }).yawRate).toBe(-1)
    expect(mapRightHandToView({ x: 0.62, y: 0.5 }).yawRate).toBeGreaterThan(0.25)
  })

  it('clamps pitch to the specified 75 degree range', () => {
    expect(clampPitch(100 * Math.PI / 180)).toBeCloseTo(75 * Math.PI / 180)
    expect(clampPitch(-100 * Math.PI / 180)).toBeCloseTo(-75 * Math.PI / 180)
  })

  it('maps right hand vertical offset to camera pitch while leaving face out', () => {
    expect(mapRightHandToView({ x: 0.5, y: 0.3 }).pitch).toBeGreaterThan(0)
    expect(mapRightHandToView({ x: 0.5, y: 0.7 }).pitch).toBeLessThan(0)
  })

  it('uses deadzone and smoothstep saturation for virtual stick axes', () => {
    expect(smoothAxis(0.03)).toBe(0)
    expect(smoothAxis(0.22)).toBe(1)
    expect(smoothAxis(-0.22)).toBe(-1)
    expect(smoothAxis(0.135)).toBeCloseTo(0.5, 1)
  })

  it('maps a non-mirrored left hand moving right to positive strafe', () => {
    const right = mapHandToMove({ x: 0.38, y: 0.32 }, { x: 0.5, y: 0.5 })
    const left = mapHandToMove({ x: 0.62, y: 0.5 }, { x: 0.5, y: 0.5 })

    expect(right.x).toBeGreaterThan(0.25)
    expect(left.x).toBeLessThan(-0.25)
    expect(right.z).toBeGreaterThan(0.75)
  })

  it('keeps weapon aim centered while the right hand controls the camera', () => {
    const view = mapRightHandToView({ x: 0.75, y: 0.25 })
    expect(view.yawRate).toBeGreaterThan(0)
    expect(view.pitch).toBeGreaterThan(0)
  })

  it('stops yaw continuously when the tracked right hand returns to screen center', () => {
    const mapper = new IntentMapper({
      leftPalm: { x: 0.25, y: 0.5 },
      rightPalm: { x: 0.75, y: 0.25 },
      leftScale: 0.1,
      rightScale: 0.1,
    })

    const turning = mapper.map({
      hands: [handAt('Right', 0.75, 0.5)],
      timestampMs: 1_000,
    })
    const neutral = mapper.map({
      hands: [handAt('Right', 0.5, 0.5)],
      timestampMs: 1_033,
    })
    const neutralAgain = mapper.map({
      hands: [handAt('Right', 0.5, 0.5)],
      timestampMs: 1_066,
    })

    expect(turning.view.yawRate).toBeGreaterThan(0)
    expect(neutral.view.yawRate).toBe(0)
    expect(neutralAgain.view.yawRate).toBe(0)
  })
})
