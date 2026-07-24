export interface ControlState {
  tracking: { leftHand: boolean; rightHand: boolean }
  view: { yawRate: number; pitch: number }
  move: { x: number; z: number }
  jet: { active: boolean; thrust: number }
  aim: { x: number; y: number }
  fire: boolean
}

export interface ControlSource {
  start(): Promise<void>
  latest(): ControlState
  dispose(): void
}

export interface Landmark {
  x: number
  y: number
  z?: number
}

export interface Point2 {
  x: number
  y: number
}

export interface RawHand {
  handedness: 'Left' | 'Right'
  landmarks: Landmark[]
}

export interface RawTrackingFrame {
  hands: RawHand[]
  timestampMs: number
}

export const DEFAULT_CONTROL_STATE: ControlState = {
  tracking: { leftHand: false, rightHand: false },
  view: { yawRate: 0, pitch: 0 },
  move: { x: 0, z: 0 },
  jet: { active: false, thrust: 0 },
  aim: { x: 0, y: 0 },
  fire: false,
}

export function cloneControlState(state: ControlState = DEFAULT_CONTROL_STATE): ControlState {
  return {
    tracking: { ...state.tracking },
    view: { ...state.view },
    move: { ...state.move },
    jet: { ...state.jet },
    aim: { ...state.aim },
    fire: state.fire,
  }
}

export function mergeControlState(partial: Partial<ControlState>): ControlState {
  return {
    tracking: { ...DEFAULT_CONTROL_STATE.tracking, ...partial.tracking },
    view: { ...DEFAULT_CONTROL_STATE.view, ...partial.view },
    move: { ...DEFAULT_CONTROL_STATE.move, ...partial.move },
    jet: { ...DEFAULT_CONTROL_STATE.jet, ...partial.jet },
    aim: { ...DEFAULT_CONTROL_STATE.aim, ...partial.aim },
    fire: partial.fire ?? DEFAULT_CONTROL_STATE.fire,
  }
}
