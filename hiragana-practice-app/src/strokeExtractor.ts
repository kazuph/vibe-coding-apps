/**
 * strokeExtractor.ts
 *
 * animCJK-based stroke data provider.
 * No font pixel analysis - all data comes from animCJK SVG stroke data.
 * Returns median (centerline) paths and outline paths for each stroke.
 */

import { hiraganaStrokeData, type StrokeData } from './data/hiraganaStrokes'
import { kanjiGrade1Data } from './data/kanjiGrade1'
import { kanjiGrade2Data } from './data/kanjiGrade2'
import { kanjiGrade3Data } from './data/kanjiGrade3'
import { kanjiGrade4Data } from './data/kanjiGrade4'
import { kanjiGrade5Data } from './data/kanjiGrade5'
import { kanjiGrade6Data } from './data/kanjiGrade6'

// Merged lookup: hiragana/katakana first, then kanji by grade
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
  const offsetX = margin
  const offsetY = margin

  return data.strokes.map(stroke =>
    stroke.median.map(([x, y]) => [
      x * scale + offsetX,
      y * scale + offsetY,
    ])
  )
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
