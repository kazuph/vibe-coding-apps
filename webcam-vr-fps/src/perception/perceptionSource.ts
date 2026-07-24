import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { createCalibration, StabilityWindow, type CalibrationState } from '../control/calibration'
import { computeFingerExtensionScore, computeFingerExtensions } from '../control/gestureFsm'
import { IntentMapper } from '../control/intentMapper'
import { cloneControlState, DEFAULT_CONTROL_STATE, type ControlSource, type ControlState, type Landmark, type RawTrackingFrame } from '../control/types'
import { createCameraStream, type CameraStream } from './camera'
import { createLandmarkers, detectTrackingFrame, drawDebugLandmarks, type LandmarkerBundle } from './landmarker'

export class PerceptionControlSource implements ControlSource {
  private camera: CameraStream | null = null
  private bundle: LandmarkerBundle | null = null
  private state = cloneControlState(DEFAULT_CONTROL_STATE)
  private mapper: IntentMapper | null = null
  private calibration: CalibrationState | null = null
  private running = false
  private lastFrameTime = performance.now()
  private stable = new StabilityWindow()
  private debugCanvas: HTMLCanvasElement | null = null
  private signalElement: HTMLElement | null = null
  private handResult: HandLandmarkerResult | undefined
  private lastFrame: RawTrackingFrame | null = null

  constructor(
    private readonly videoMount: HTMLElement,
    private readonly debug: boolean,
  ) {}

  async start(): Promise<void> {
    this.camera = await createCameraStream()
    this.camera.video.className = 'video-preview'
    this.videoMount.appendChild(this.camera.video)

    if (this.debug) {
      this.debugCanvas = document.createElement('canvas')
      this.debugCanvas.className = 'debug-layer'
      this.videoMount.appendChild(this.debugCanvas)
      this.signalElement = document.createElement('div')
      this.signalElement.className = 'signal-meter'
      this.videoMount.appendChild(this.signalElement)
    }

    this.bundle = await createLandmarkers()
    this.running = true
    this.tick()
  }

  latest(): ControlState {
    return cloneControlState(this.state)
  }

  calibrationReady(): boolean {
    return Boolean(this.calibration)
  }

  recalibrate(): void {
    this.calibration = null
    this.mapper = null
    this.stable.reset()
  }

  dispose(): void {
    this.running = false
    this.camera?.dispose()
    this.bundle?.dispose()
    this.debugCanvas?.remove()
    this.signalElement?.remove()
  }

  private tick = (): void => {
    if (!this.running || !this.camera || !this.bundle) return

    const now = performance.now()
    const dt = Math.max(0.001, (now - this.lastFrameTime) / 1000)
    this.lastFrameTime = now

    const result = detectTrackingFrame(this.camera.video, this.bundle, now)
    this.handResult = result.handResult
    this.consumeFrame(result.frame, dt)
    this.drawDebug()

    if (this.camera.video.requestVideoFrameCallback) {
      this.camera.video.requestVideoFrameCallback(() => this.tick())
    } else {
      window.setTimeout(this.tick, 33)
    }
  }

  private consumeFrame(frame: RawTrackingFrame, dt: number): void {
    this.lastFrame = frame
    if (!this.calibration) {
      const candidate = createCalibration(frame)
      const stableFor = this.stable.update(Boolean(candidate), dt)
      if (candidate && stableFor >= 2) {
        this.calibration = candidate
        this.mapper = new IntentMapper(candidate)
      }
      this.state = {
        ...cloneControlState(DEFAULT_CONTROL_STATE),
        tracking: {
          leftHand: Boolean(frame.hands.find((hand) => hand.handedness === 'Left')),
          rightHand: Boolean(frame.hands.find((hand) => hand.handedness === 'Right')),
        },
      }
      return
    }

    this.state = this.mapper?.map(frame) ?? cloneControlState()
  }

  private drawDebug(): void {
    if (!this.debug || !this.camera) return
    if (this.debugCanvas) {
      drawDebugLandmarks(this.debugCanvas, this.camera.video, this.handResult)
    }
    if (this.signalElement) {
      const state = this.latest()
      this.signalElement.textContent = [
        `left=${state.tracking.leftHand} right=${state.tracking.rightHand}`,
        `yawRate=${state.view.yawRate.toFixed(2)} pitch=${state.view.pitch.toFixed(2)}`,
        `move=(${state.move.x.toFixed(2)}, ${state.move.z.toFixed(2)}) jet=${state.jet.active}`,
        formatFingerDebug('leftJet', this.lastFrame?.hands.find((hand) => hand.handedness === 'Left')?.landmarks),
        `aim=(${state.aim.x.toFixed(2)}, ${state.aim.y.toFixed(2)}) fire=${state.fire}`,
        formatFingerDebug('rightHand', this.lastFrame?.hands.find((hand) => hand.handedness === 'Right')?.landmarks),
      ].join('\n')
    }
  }
}

function formatFingerDebug(label: string, landmarks: Landmark[] | undefined): string {
  if (!landmarks) {
    return `${label}: score=0.00 index:missing(0.00) middle:missing(0.00) ring:missing(0.00) pinky:missing(0.00)`
  }
  const fingers = computeFingerExtensions(landmarks)
  const parts = fingers.map((finger) => (
    `${finger.name}:${finger.extended ? 'on' : 'off'}(${finger.ratio.toFixed(2)})`
  ))
  return `${label}: score=${computeFingerExtensionScore(landmarks).toFixed(2)} ${parts.join(' ')}`
}
