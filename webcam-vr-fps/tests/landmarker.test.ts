import { describe, expect, it } from 'vitest'
import { correctHandednessForUnmirroredInput } from '../src/perception/landmarker'

describe('unmirrored camera handedness', () => {
  it('converts MediaPipe labels to the photographed person’s physical hand', () => {
    expect(correctHandednessForUnmirroredInput('Left')).toBe('Right')
    expect(correctHandednessForUnmirroredInput('Right')).toBe('Left')
  })
})
