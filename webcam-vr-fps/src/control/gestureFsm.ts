import type { Landmark } from './types'

export type FingerName = 'index' | 'middle' | 'ring' | 'pinky'

export interface FingerExtension {
  name: FingerName
  tipDistance: number
  pipDistance: number
  ratio: number
  extended: boolean
}

interface HysteresisOptions {
  onThreshold: number
  offThreshold: number
  lowerIsOn?: boolean
  initial?: boolean
}

export class HysteresisGesture {
  private active: boolean
  private readonly onThreshold: number
  private readonly offThreshold: number
  private readonly lowerIsOn: boolean

  constructor(options: HysteresisOptions) {
    this.onThreshold = options.onThreshold
    this.offThreshold = options.offThreshold
    this.lowerIsOn = options.lowerIsOn ?? false
    this.active = options.initial ?? false
  }

  update(value: number): boolean {
    if (this.lowerIsOn) {
      if (!this.active && value < this.onThreshold) this.active = true
      if (this.active && value > this.offThreshold) this.active = false
    } else {
      if (!this.active && value > this.onThreshold) this.active = true
      if (this.active && value < this.offThreshold) this.active = false
    }

    return this.active
  }

  reset(active = false): void {
    this.active = active
  }

  latest(): boolean {
    return this.active
  }
}

export function distance(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = (a.z ?? 0) - (b.z ?? 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function handScale(landmarks: Landmark[]): number {
  if (landmarks.length <= 9) return 1
  return Math.max(0.0001, distance(landmarks[0], landmarks[9]))
}

export function palmCenter(landmarks: Landmark[]): { x: number; y: number } {
  const indexes = [0, 5, 17]
  const sum = indexes.reduce(
    (acc, index) => {
      const point = landmarks[index] ?? landmarks[0]
      return { x: acc.x + point.x, y: acc.y + point.y }
    },
    { x: 0, y: 0 },
  )
  return { x: sum.x / indexes.length, y: sum.y / indexes.length }
}

export function computeFingerExtensionScore(landmarks: Landmark[]): number {
  const fingers = computeFingerExtensions(landmarks)
  if (fingers.length === 0) return 0
  return fingers.filter((finger) => finger.extended).length / fingers.length
}

export function computeFingerExtensions(landmarks: Landmark[]): FingerExtension[] {
  if (landmarks.length < 21) return []
  const wrist = landmarks[0]
  const fingers: { name: FingerName; pip: number; tip: number }[] = [
    { name: 'index', pip: 6, tip: 8 },
    { name: 'middle', pip: 10, tip: 12 },
    { name: 'ring', pip: 14, tip: 16 },
    { name: 'pinky', pip: 18, tip: 20 },
  ]

  return fingers.map((finger) => {
    const tipDistance = distance(wrist, landmarks[finger.tip])
    const pipDistance = Math.max(0.0001, distance(wrist, landmarks[finger.pip]))
    const ratio = tipDistance / pipDistance
    return {
      name: finger.name,
      tipDistance,
      pipDistance,
      ratio,
      extended: ratio > 1.15,
    }
  })
}

export function computePinchRatio(landmarks: Landmark[]): number {
  if (landmarks.length < 9) return Number.POSITIVE_INFINITY
  return distance(landmarks[4], landmarks[8]) / handScale(landmarks)
}
