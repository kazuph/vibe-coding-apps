/**
 * strokeExtractor.ts
 *
 * animCJK-based stroke data provider.
 * No font pixel analysis - all data comes from animCJK SVG stroke data.
 * Returns median (centerline) paths and outline paths for each stroke.
 */

import { hiraganaStrokeData } from './data/hiraganaStrokes'

/**
 * Extract stroke center-line paths from animCJK data.
 * Coordinates are in animCJK's 1024x1024 space, scaled to canvasSize.
 *
 * @param char - The hiragana character
 * @param _font - Unused (kept for API compatibility)
 * @param canvasSize - Target canvas size in pixels
 * @param _strokeHints - Unused (kept for API compatibility)
 * @returns Array of strokes, each being an array of [x, y] points
 */
export function extractStrokePaths(
  char: string,
  _font: string,
  canvasSize: number,
  _strokeHints: number[][][],
): number[][][] {
  const data = hiraganaStrokeData[char]
  if (!data) {
    // Fallback: return strokeHints mapped to canvas coordinates
    const margin = canvasSize * 0.05
    const area = canvasSize - margin * 2
    return _strokeHints.map(stroke =>
      stroke.map(([nx, ny]) => [nx * area + margin, ny * area + margin])
    )
  }

  const margin = canvasSize * 0.05
  const area = canvasSize - margin * 2

  // animCJK uses 1024x1024 viewBox
  const scale = area / 1024
  const offsetX = margin
  const offsetY = margin

  return data.strokes.map(stroke => {
    // Transform median coordinates from 1024x1024 to canvas space
    return stroke.median.map(([x, y]) => [
      x * scale + offsetX,
      y * scale + offsetY,
    ])
  })
}

/**
 * Get SVG outline paths for a character (for rendering the guide character).
 * Returns paths in canvas coordinate space.
 */
export function getStrokeOutlines(
  char: string,
  canvasSize: number,
): { path: string; transform: string }[] | null {
  const data = hiraganaStrokeData[char]
  if (!data) return null

  const margin = canvasSize * 0.05
  const area = canvasSize - margin * 2
  const scale = area / 1024

  return data.strokes.map(stroke => ({
    path: stroke.outline,
    transform: `translate(${margin}, ${margin}) scale(${scale})`,
  }))
}
