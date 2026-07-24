import type { CalibrationState } from './calibration'
import { computeFingerExtensionScore, computePinchRatio, HysteresisGesture, palmCenter } from './gestureFsm'
import { OneEuroFilter } from './oneEuro'
import {
  cloneControlState,
  DEFAULT_CONTROL_STATE,
  type ControlState,
  type Point2,
  type RawTrackingFrame,
} from './types'

const DEG = Math.PI / 180
const PITCH_LIMIT = 75 * DEG
const SCREEN_CENTER_X = 0.5
const SCREEN_CENTER_Y = 0.5
const STICK_DEADZONE = 0.05
const STICK_SATURATION = 0.22
const LOST_GRACE_SEC = 0.3
const LOST_DECAY_SEC = 0.2

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

export function smoothAxis(delta: number, deadzone = STICK_DEADZONE, saturation = STICK_SATURATION): number {
  const abs = Math.abs(delta)
  if (abs <= deadzone) return 0
  const magnitude = smoothstep((abs - deadzone) / (saturation - deadzone))
  return Math.sign(delta) * magnitude
}

export function mapHandToMove(palm: Point2, neutral: Point2): { x: number; z: number } {
  return {
    x: smoothAxis(neutral.x - palm.x),
    z: smoothAxis(neutral.y - palm.y),
  }
}

export function mapRightHandToView(palm: Point2): { yawRate: number; pitch: number } {
  return {
    yawRate: smoothAxis(palm.x - SCREEN_CENTER_X),
    pitch: clampPitch(smoothAxis(SCREEN_CENTER_Y - palm.y) * 45 * DEG),
  }
}

export function clampPitch(pitch: number): number {
  return clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT)
}

export class TrackingLossSmoother {
  private state = cloneControlState()
  private lostFor = { leftHand: 0, rightHand: 0 }
  private decayFor = { leftHand: 0, rightHand: 0 }

  update(next: ControlState, dt: number): ControlState {
    const output = cloneControlState(next)
    output.fire = next.tracking.rightHand ? next.fire : false

    this.applyPartLoss('leftHand', next.tracking.leftHand, dt, () => {
      output.move = { ...this.state.move }
      output.jet = { ...this.state.jet }
    }, (factor) => {
      output.move.x = this.state.move.x * factor
      output.move.z = this.state.move.z * factor
      output.jet.thrust = this.state.jet.thrust * factor
      output.jet.active = output.jet.thrust > 0.05 && this.state.jet.active
    })

    this.applyPartLoss('rightHand', next.tracking.rightHand, dt, () => {
      output.view = { ...this.state.view }
      output.aim = { ...this.state.aim }
    }, (factor) => {
      output.view.yawRate = this.state.view.yawRate * factor
      output.view.pitch = this.state.view.pitch * factor
      output.aim.x = this.state.aim.x * factor
      output.aim.y = this.state.aim.y * factor
      output.fire = false
    })

    this.state = cloneControlState(output)
    return output
  }

  private applyPartLoss(
    part: keyof TrackingLossSmoother['lostFor'],
    isTracked: boolean,
    dt: number,
    keepPrevious: () => void,
    decay: (factor: number) => void,
  ): void {
    if (isTracked) {
      this.lostFor[part] = 0
      this.decayFor[part] = 0
      return
    }

    this.lostFor[part] += dt
    if (this.lostFor[part] <= LOST_GRACE_SEC) {
      keepPrevious()
      return
    }

    this.decayFor[part] += dt
    const factor = clamp(1 - this.decayFor[part] / LOST_DECAY_SEC, 0, 1)
    decay(factor)
  }
}

export class IntentMapper {
  private readonly openPalm = new HysteresisGesture({ onThreshold: 0.8, offThreshold: 0.62 })
  private readonly pinch = new HysteresisGesture({ onThreshold: 0.35, offThreshold: 0.48, lowerIsOn: true })
  private readonly yawFilter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.05 })
  private readonly pitchFilter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.05 })
  private readonly smoother = new TrackingLossSmoother()
  private lastTimestampMs = 0

  constructor(private calibration: CalibrationState) {}

  setCalibration(calibration: CalibrationState): void {
    this.calibration = calibration
    this.openPalm.reset()
    this.pinch.reset()
    this.yawFilter.reset()
    this.pitchFilter.reset()
  }

  map(frame: RawTrackingFrame): ControlState {
    const nowSec = frame.timestampMs / 1000
    const dt = this.lastTimestampMs === 0 ? 1 / 30 : Math.min(0.1, Math.max(0.001, (frame.timestampMs - this.lastTimestampMs) / 1000))
    this.lastTimestampMs = frame.timestampMs

    const left = frame.hands.find((hand) => hand.handedness === 'Left')
    const right = frame.hands.find((hand) => hand.handedness === 'Right')
    const next = cloneControlState(DEFAULT_CONTROL_STATE)
    next.tracking = { leftHand: Boolean(left), rightHand: Boolean(right) }

    if (left) {
      const center = palmCenter(left.landmarks)
      next.move = mapHandToMove(center, this.calibration.leftPalm)
      const openScore = computeFingerExtensionScore(left.landmarks)
      const jetOn = this.openPalm.update(openScore)
      next.jet = { active: jetOn, thrust: jetOn ? 1 : 0 }
    }

    if (right) {
      const center = palmCenter(right.landmarks)
      const view = mapRightHandToView(center)
      if (view.yawRate === 0) this.yawFilter.reset()
      if (view.pitch === 0) this.pitchFilter.reset()
      next.view.yawRate = view.yawRate === 0 ? 0 : this.yawFilter.filter(view.yawRate, nowSec)
      next.view.pitch = view.pitch === 0 ? 0 : this.pitchFilter.filter(view.pitch, nowSec)
      next.aim = { x: 0, y: 0 }
      next.fire = this.pinch.update(computePinchRatio(right.landmarks))
    }

    return this.smoother.update(next, dt)
  }
}
