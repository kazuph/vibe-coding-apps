import type { Point2, RawTrackingFrame } from './types'
import { handScale, palmCenter } from './gestureFsm'

export interface CalibrationState {
  leftPalm: Point2
  rightPalm: Point2
  leftScale: number
  rightScale: number
}

export class StabilityWindow {
  private stableFor = 0

  update(isStable: boolean, dt: number): number {
    this.stableFor = isStable ? this.stableFor + dt : 0
    return this.stableFor
  }

  reset(): void {
    this.stableFor = 0
  }
}

export function createCalibration(frame: RawTrackingFrame): CalibrationState | null {
  const left = frame.hands.find((hand) => hand.handedness === 'Left')
  const right = frame.hands.find((hand) => hand.handedness === 'Right')
  if (!left || !right) return null

  return {
    leftPalm: palmCenter(left.landmarks),
    rightPalm: palmCenter(right.landmarks),
    leftScale: handScale(left.landmarks),
    rightScale: handScale(right.landmarks),
  }
}
