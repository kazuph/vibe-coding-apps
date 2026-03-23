/**
 * strokeExtractor.ts
 *
 * animCJK-based stroke data provider.
 * No font pixel analysis - all data comes from animCJK SVG stroke data.
 * Returns median (centerline) paths and outline paths for each stroke.
 * Applies smoothing to soften brush-style curves for pencil tracing.
 */

import { hiraganaStrokeData, type StrokeData } from './data/hiraganaStrokes'
import { kanjiGrade1Data } from './data/kanjiGrade1'
import { kanjiGrade2Data } from './data/kanjiGrade2'
import { kanjiGrade3Data } from './data/kanjiGrade3'
import { kanjiGrade4Data } from './data/kanjiGrade4'
import { kanjiGrade5Data } from './data/kanjiGrade5'
import { kanjiGrade6Data } from './data/kanjiGrade6'

function findStrokeData(char: string): StrokeData | undefined {
  return hiraganaStrokeData[char]
    ?? kanjiGrade1Data[char]
    ?? kanjiGrade2Data[char]
    ?? kanjiGrade3Data[char]
    ?? kanjiGrade4Data[char]
    ?? kanjiGrade5Data[char]
    ?? kanjiGrade6Data[char]
}

export function extractStrokePaths(
  char: string,
  _font: string,
  canvasSize: number,
  _strokeHints: number[][][],
): number[][][] {
  const data = findStrokeData(char)
  if (!data) {
    const margin = canvasSize * 0.05
    const area = canvasSize - margin * 2
    return _strokeHints.map(stroke =>
      stroke.map(([nx, ny]) => [nx * area + margin, ny * area + margin])
    )
  }

  const margin = canvasSize * 0.05
  const area = canvasSize - margin * 2
  const scale = area / 1024
  const ox = margin
  const oy = margin

  return data.strokes.map(stroke => {
    // Transform to canvas coords
    const pts = stroke.median.map(([x, y]) => [x * scale + ox, y * scale + oy])
    // Apply smoothing: Douglas-Peucker simplify then moving average
    return smoothPath(pts)
  })
}

export function getStrokeOutlines(
  char: string,
  canvasSize: number,
): { path: string; transform: string }[] | null {
  const data = findStrokeData(char)
  if (!data) return null

  const margin = canvasSize * 0.05
  const area = canvasSize - margin * 2
  const scale = area / 1024

  return data.strokes.map(stroke => ({
    path: stroke.outline,
    transform: `translate(${margin}, ${margin}) scale(${scale})`,
  }))
}

// ---------------------------------------------------------------------------
// Path smoothing
// ---------------------------------------------------------------------------

function smoothPath(pts: number[][]): number[][] {
  if (pts.length <= 2) return pts

  // 1. Douglas-Peucker to remove noisy intermediate points
  const simplified = douglasPeucker(pts, 6)

  // 2. Moving average (window=3) x 2 passes to soften sharp corners
  //    Preserve start and end points
  let smoothed = simplified
  for (let pass = 0; pass < 2; pass++) {
    smoothed = movingAverage(smoothed, 3)
  }

  return smoothed
}

/** Douglas-Peucker polyline simplification */
function douglasPeucker(pts: number[][], epsilon: number): number[][] {
  if (pts.length <= 2) return pts

  // Find the point with max distance from the line (first, last)
  let maxDist = 0
  let maxIdx = 0
  const first = pts[0]
  const last = pts[pts.length - 1]

  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointToLineDist(pts[i], first, last)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(pts.slice(0, maxIdx + 1), epsilon)
    const right = douglasPeucker(pts.slice(maxIdx), epsilon)
    return left.slice(0, -1).concat(right)
  }

  return [first, last]
}

function pointToLineDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lenSq = dx * dx + dy * dy
  if (lenSq < 0.001) {
    const ex = p[0] - a[0], ey = p[1] - a[1]
    return Math.sqrt(ex * ex + ey * ey)
  }
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq))
  const px = a[0] + t * dx - p[0]
  const py = a[1] + t * dy - p[1]
  return Math.sqrt(px * px + py * py)
}

/** Moving average smoothing, preserving first and last points */
function movingAverage(pts: number[][], window: number): number[][] {
  if (pts.length <= 2) return pts
  const half = Math.floor(window / 2)
  const result: number[][] = [pts[0]] // preserve start

  for (let i = 1; i < pts.length - 1; i++) {
    let sx = 0, sy = 0, count = 0
    for (let j = -half; j <= half; j++) {
      const idx = Math.max(0, Math.min(pts.length - 1, i + j))
      sx += pts[idx][0]
      sy += pts[idx][1]
      count++
    }
    result.push([sx / count, sy / count])
  }

  result.push(pts[pts.length - 1]) // preserve end
  return result
}
