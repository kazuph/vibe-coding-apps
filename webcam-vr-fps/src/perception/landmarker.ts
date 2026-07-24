import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision'
import type { Landmark, RawHand, RawTrackingFrame } from '../control/types'

export interface LandmarkerBundle {
  hands: HandLandmarker
  dispose(): void
}

const TASKS_VERSION = '0.10.35'
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}/wasm`
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'

export async function createLandmarkers(): Promise<LandmarkerBundle> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE)
  const hands = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.5,
  })

  return {
    hands,
    dispose() {
      hands.close()
    },
  }
}

export function detectTrackingFrame(
  video: HTMLVideoElement,
  bundle: LandmarkerBundle,
  timestampMs: number,
): { frame: RawTrackingFrame; handResult: HandLandmarkerResult } {
  const handResult = bundle.hands.detectForVideo(video, timestampMs)
  return {
    frame: {
      hands: handsFromResult(handResult),
      timestampMs,
    },
    handResult,
  }
}

function handsFromResult(result: HandLandmarkerResult): RawHand[] {
  return result.landmarks.map((landmarks, index) => {
    const category = result.handedness[index]?.[0] ?? result.handednesses[index]?.[0]
    const modelHandedness = category?.categoryName === 'Left' ? 'Left' : 'Right'
    return {
      // MediaPipe assumes mirrored selfie input. detectForVideo receives the
      // unmirrored camera video, so convert its label to the person's hand.
      handedness: correctHandednessForUnmirroredInput(modelHandedness),
      landmarks: landmarks.map((point): Landmark => ({ x: point.x, y: point.y, z: point.z })),
    }
  })
}

export function correctHandednessForUnmirroredInput(
  modelHandedness: RawHand['handedness'],
): RawHand['handedness'] {
  return modelHandedness === 'Left' ? 'Right' : 'Left'
}

export function drawDebugLandmarks(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  handResult?: HandLandmarkerResult,
): void {
  const context = canvas.getContext('2d')
  if (!context) return
  canvas.width = video.videoWidth || 640
  canvas.height = video.videoHeight || 480
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.save()
  context.scale(-1, 1)
  context.translate(-canvas.width, 0)
  context.fillStyle = 'rgba(255, 45, 149, 0.9)'
  for (const landmarks of handResult?.landmarks ?? []) {
    for (const point of landmarks) drawPoint(context, point.x * canvas.width, point.y * canvas.height, 3)
  }
  context.restore()
}

function drawPoint(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fill()
}
