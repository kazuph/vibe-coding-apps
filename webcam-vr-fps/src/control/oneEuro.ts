export interface OneEuroOptions {
  minCutoff?: number
  beta?: number
  derivativeCutoff?: number
}

function smoothingFactor(dt: number, cutoff: number): number {
  const tau = 1 / (2 * Math.PI * cutoff)
  return 1 / (1 + tau / Math.max(dt, 0.0001))
}

class LowPassFilter {
  private initialized = false
  private value = 0

  filter(value: number, alpha: number): number {
    if (!this.initialized) {
      this.initialized = true
      this.value = value
      return value
    }

    this.value = alpha * value + (1 - alpha) * this.value
    return this.value
  }

  latest(): number {
    return this.value
  }
}

export class OneEuroFilter {
  private readonly minCutoff: number
  private readonly beta: number
  private readonly derivativeCutoff: number
  private readonly valueFilter = new LowPassFilter()
  private readonly derivativeFilter = new LowPassFilter()
  private lastTime: number | null = null
  private lastRaw: number | null = null

  constructor(options: OneEuroOptions = {}) {
    this.minCutoff = options.minCutoff ?? 1.0
    this.beta = options.beta ?? 0.05
    this.derivativeCutoff = options.derivativeCutoff ?? 1.0
  }

  filter(value: number, timeSec: number): number {
    if (this.lastTime === null || this.lastRaw === null) {
      this.lastTime = timeSec
      this.lastRaw = value
      return this.valueFilter.filter(value, 1)
    }

    const dt = Math.max(0.0001, timeSec - this.lastTime)
    const derivative = (value - this.lastRaw) / dt
    const filteredDerivative = this.derivativeFilter.filter(
      derivative,
      smoothingFactor(dt, this.derivativeCutoff),
    )
    const cutoff = this.minCutoff + this.beta * Math.abs(filteredDerivative)
    const filtered = this.valueFilter.filter(value, smoothingFactor(dt, cutoff))

    this.lastTime = timeSec
    this.lastRaw = value
    return filtered
  }

  reset(): void {
    this.lastTime = null
    this.lastRaw = null
  }
}
