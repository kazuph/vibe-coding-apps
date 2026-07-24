import {
  cloneControlState,
  DEFAULT_CONTROL_STATE,
  mergeControlState,
  type ControlSource,
  type ControlState,
} from './types'

interface ScriptFrame {
  at: number
  state: Partial<ControlState>
}

interface ScriptFile {
  frames: ScriptFrame[]
  loop?: boolean
}

export class ScriptedControlSource implements ControlSource {
  private frames: ScriptFrame[] = []
  private startedAt = 0
  private current = cloneControlState(DEFAULT_CONTROL_STATE)
  private loop = false

  constructor(private readonly scriptUrl: string) {}

  async start(): Promise<void> {
    const response = await fetch(this.scriptUrl)
    if (!response.ok) {
      throw new Error(`script load failed: ${this.scriptUrl}`)
    }

    const data = (await response.json()) as ScriptFile
    this.frames = data.frames.toSorted((a, b) => a.at - b.at)
    this.loop = data.loop ?? false
    this.resetTimeline()
  }

  resetTimeline(): void {
    this.startedAt = 0
    this.current = this.frames.length > 0 ? mergeControlState(this.frames[0].state) : cloneControlState()
  }

  latest(): ControlState {
    if (this.frames.length === 0) return cloneControlState(this.current)
    if (this.startedAt === 0) this.startedAt = performance.now()

    const duration = this.frames[this.frames.length - 1].at
    let elapsed = performance.now() - this.startedAt
    if (this.loop && duration > 0) elapsed %= duration

    let frame = this.frames[0]
    for (const candidate of this.frames) {
      if (candidate.at > elapsed) break
      frame = candidate
    }
    this.current = mergeControlState(frame.state)
    return cloneControlState(this.current)
  }

  dispose(): void {
    this.frames = []
  }
}
