import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTROL_STATE, type ControlState } from '../src/control/types'
import { TrackingLossSmoother } from '../src/control/intentMapper'

const activeState = (): ControlState => ({
  ...DEFAULT_CONTROL_STATE,
  tracking: { leftHand: true, rightHand: true },
  view: { yawRate: 0.8, pitch: 0.4 },
  move: { x: 0.7, z: 1 },
  jet: { active: true, thrust: 1 },
  aim: { x: -0.6, y: 0.5 },
  fire: true,
})

describe('TrackingLossSmoother', () => {
  it('keeps recent samples during the grace period and immediately stops fire', () => {
    const smoother = new TrackingLossSmoother()
    smoother.update(activeState(), 0.016)
    const lost = smoother.update({
      ...activeState(),
      tracking: { leftHand: false, rightHand: false },
    }, 0.1)

    expect(lost.view.yawRate).toBeCloseTo(0.8)
    expect(lost.move.z).toBeCloseTo(1)
    expect(lost.fire).toBe(false)
  })

  it('decays lost hand, view, and aim signals to neutral after grace', () => {
    const smoother = new TrackingLossSmoother()
    smoother.update(activeState(), 0.016)
    smoother.update({ ...activeState(), tracking: { leftHand: false, rightHand: false } }, 0.31)
    const halfDecayed = smoother.update({
      ...activeState(),
      tracking: { leftHand: false, rightHand: false },
    }, 0.1)
    const neutral = smoother.update({
      ...activeState(),
      tracking: { leftHand: false, rightHand: false },
    }, 0.12)

    expect(halfDecayed.view.yawRate).toBeLessThan(0.8)
    expect(halfDecayed.move.z).toBeLessThan(1)
    expect(neutral.view.yawRate).toBeCloseTo(0)
    expect(neutral.move.x).toBeCloseTo(0)
    expect(neutral.jet.active).toBe(false)
    expect(neutral.aim.x).toBeCloseTo(0)
  })
})
