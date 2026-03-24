import { useRef, useEffect, useCallback, useState } from 'react'
import type { HiraganaChar } from './hiraganaData'
import { extractStrokePaths, getStrokeOutlines } from './strokeExtractor'

interface Props {
  char: HiraganaChar
  onComplete: () => void
  onStrokeComplete?: (strokeIndex: number, totalStrokes: number) => void
  onStrokeFailed?: () => void
  onDemoPlay?: () => void
}

const CANVAS_RES = 800

// --- All thresholds as ratios of CANVAS_RES ---
const START_RADIUS_RATIO = 0.09       // 9% = 72px
const PATH_RADIUS_RATIO = 0.09        // 9% = 72px
const SCORE_THRESHOLD_RATIO = 0.07    // 7% = 56px
const END_RADIUS_RATIO = 0.12         // 12% = 96px

// --- Ratio-based pass conditions ---
const MIN_COVERAGE = 0.65             // 65% of path covered sequentially
const MAX_FAR_STREAK_RATIO = 0.40     // 40% of samples can be far
const MIN_SAMPLE_POINTS = 4
const MAX_CHECKPOINT_JUMP_RATIO = 0.40 // 40% jump allowed per sample
const MAX_LENGTH_RATIO = 1.20         // user drawn length must be <= 120% of ideal

const MIN_MOVE = 2
const PEN_WIDTH = 18
const GUIDE_OPACITY = 0.15
const TRACED_OPACITY = 0.85

const START_RADIUS = CANVAS_RES * START_RADIUS_RATIO
const PATH_RADIUS = CANVAS_RES * PATH_RADIUS_RATIO
const SCORE_THRESHOLD = CANVAS_RES * SCORE_THRESHOLD_RATIO
const END_RADIUS = CANVAS_RES * END_RADIUS_RATIO

interface StrokeTraceState {
  started: boolean
  nextCheckpoint: number
  pointCount: number
  totalDistance: number
  maxConsecutiveFar: number
  currentFarStreak: number
  lastX: number
  lastY: number
  userDrawLength: number
  prevMoveX: number
  prevMoveY: number
}

interface DebugInfo {
  coverage: number
  coverageReq: number
  avgDist: number
  avgDistReq: number
  farStreak: number
  farStreakReq: number
  samples: number
  samplesReq: number
  lengthRatio: number
  lengthReq: number
  passed: boolean
}

export function TracingCanvas({ char, onComplete, onStrokeComplete, onStrokeFailed, onDemoPlay }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const guideCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawCanvasRef = useRef<HTMLCanvasElement>(null)

  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const [currentStroke, setCurrentStroke] = useState(0)
  const traceState = useRef<StrokeTraceState>({
    started: false, nextCheckpoint: 0,
    pointCount: 0, totalDistance: 0, maxConsecutiveFar: 0, currentFarStreak: 0,
    lastX: 0, lastY: 0, userDrawLength: 0, prevMoveX: 0, prevMoveY: 0,
  })
  const completedStrokes = useRef<Set<number>>(new Set())
  const [isPlayingDemo, setIsPlayingDemo] = useState(false)
  const demoAnimRef = useRef<number | null>(null)
  const demoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hintPulse, setHintPulse] = useState(false)
  const [strokeFailed, setStrokeFailed] = useState(false)
  const [showGuideZones, setShowGuideZones] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)

  const [extractedPaths, setExtractedPaths] = useState<number[][][] | null>(null)
  const extractedPathsRef = useRef<number[][][] | null>(null)

  const resetTraceState = useCallback(() => {
    traceState.current = {
      started: false, nextCheckpoint: 0,
      pointCount: 0, totalDistance: 0, maxConsecutiveFar: 0, currentFarStreak: 0,
      lastX: 0, lastY: 0, userDrawLength: 0, prevMoveX: 0, prevMoveY: 0,
    }
  }, [])

  const distToPath = useCallback((x: number, y: number, stroke: number[][]): { dist: number; nearestIdx: number } => {
    let minDist = Infinity
    let nearestIdx = 0
    for (let i = 0; i < stroke.length; i++) {
      const dx = x - stroke[i][0], dy = y - stroke[i][1]
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < minDist) { minDist = d; nearestIdx = i }
    }
    for (let i = 0; i < stroke.length - 1; i++) {
      const ax = stroke[i][0], ay = stroke[i][1]
      const bx = stroke[i + 1][0], by = stroke[i + 1][1]
      const abx = bx - ax, aby = by - ay
      const len2 = abx * abx + aby * aby
      if (len2 === 0) continue
      const apx = x - ax, apy = y - ay
      const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2))
      const px = ax + t * abx, py = ay + t * aby
      const d = Math.sqrt((x - px) ** 2 + (y - py) ** 2)
      if (d < minDist) { minDist = d; nearestIdx = t < 0.5 ? i : i + 1 }
    }
    return { dist: minDist, nearestIdx }
  }, [])

  const drawCompletedStroke = useCallback((strokeIdx: number) => {
    const canvas = guideCanvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const margin = CANVAS_RES * 0.05, area = CANVAS_RES - margin * 2
    const outlines = getStrokeOutlines(char.char, CANVAS_RES)
    if (!outlines || strokeIdx >= outlines.length) return
    const scale = area / 1024
    ctx.save()
    ctx.beginPath(); ctx.rect(margin, margin, area, area); ctx.clip()
    ctx.globalAlpha = 0.55; ctx.fillStyle = '#4caf50'
    ctx.setTransform(scale, 0, 0, scale, margin, margin)
    ctx.fill(new Path2D(outlines[strokeIdx].path))
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.restore()
  }, [char])

  const drawGuide = useCallback(() => {
    const canvas = guideCanvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const size = CANVAS_RES; ctx.clearRect(0, 0, size, size)
    const margin = size * 0.05

    ctx.strokeStyle = 'rgba(180, 150, 120, 0.45)'; ctx.lineWidth = 2
    ctx.strokeRect(margin, margin, size - margin * 2, size - margin * 2)

    ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(180, 150, 120, 0.35)'; ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(size / 2, margin); ctx.lineTo(size / 2, size - margin)
    ctx.moveTo(margin, size / 2); ctx.lineTo(size - margin, size / 2)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(180, 150, 120, 0.18)'; ctx.beginPath()
    ctx.moveTo(margin, margin); ctx.lineTo(size - margin, size - margin)
    ctx.moveTo(size - margin, margin); ctx.lineTo(margin, size - margin)
    ctx.stroke(); ctx.setLineDash([])

    const area = size - margin * 2
    const outlines = getStrokeOutlines(char.char, size)
    if (outlines) {
      ctx.save(); ctx.beginPath(); ctx.rect(margin, margin, area, area); ctx.clip()
      ctx.globalAlpha = GUIDE_OPACITY; ctx.fillStyle = '#5a4a3a'
      const scale = area / 1024
      ctx.setTransform(scale, 0, 0, scale, margin, margin)
      for (const { path } of outlines) ctx.fill(new Path2D(path))
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.restore()
    }

    completedStrokes.current.forEach(idx => drawCompletedStroke(idx))

    const paths = extractedPaths; if (!paths) return

    if (showGuideZones && currentStroke < paths.length) {
      const stroke = paths[currentStroke]
      if (stroke.length >= 2) {
        ctx.save(); ctx.globalAlpha = 0.08; ctx.fillStyle = '#e85d3a'
        for (const pt of stroke) { ctx.beginPath(); ctx.arc(pt[0], pt[1], PATH_RADIUS, 0, Math.PI * 2); ctx.fill() }
        ctx.restore()
        ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#4caf50'
        ctx.beginPath(); ctx.arc(stroke[0][0], stroke[0][1], START_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.restore()
        const last = stroke[stroke.length - 1]
        ctx.save(); ctx.globalAlpha = 0.2; ctx.fillStyle = '#f44336'
        ctx.beginPath(); ctx.arc(last[0], last[1], END_RADIUS, 0, Math.PI * 2); ctx.fill(); ctx.restore()
      }
    }

    paths.forEach((stroke, idx) => {
      if (stroke.length === 0) return
      const sx = stroke[0][0], sy = stroke[0][1], r = 14
      ctx.save()
      if (idx < currentStroke) { ctx.globalAlpha = 0.4; ctx.fillStyle = '#4caf50' }
      else if (idx === currentStroke) {
        ctx.globalAlpha = hintPulse ? 1.0 : 0.9; ctx.fillStyle = '#e85d3a'
        if (hintPulse) { ctx.beginPath(); ctx.arc(sx, sy, r + 8, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(232, 93, 58, 0.5)'; ctx.lineWidth = 3; ctx.stroke() }
      } else { ctx.globalAlpha = 0.3; ctx.fillStyle = '#8b7355' }
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'white'; ctx.font = 'bold 14px "Noto Sans JP", sans-serif'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(String(idx + 1), sx, sy + 1); ctx.restore()
    })

    if (currentStroke < paths.length) {
      const stroke = paths[currentStroke]
      if (stroke.length >= 2) {
        ctx.save()
        ctx.strokeStyle = hintPulse ? 'rgba(232, 93, 58, 0.6)' : 'rgba(232, 93, 58, 0.3)'
        ctx.lineWidth = hintPulse ? 6 : 4; ctx.setLineDash([6, 6]); ctx.lineCap = 'round'; ctx.lineJoin = 'round'
        ctx.beginPath(); ctx.moveTo(stroke[0][0], stroke[0][1])
        if (stroke.length === 2) { ctx.lineTo(stroke[1][0], stroke[1][1]) }
        else { for (let i = 0; i < stroke.length - 1; i++) {
          const p0 = i > 0 ? stroke[i - 1] : stroke[i], p1 = stroke[i], p2 = stroke[i + 1]
          const p3 = i + 2 < stroke.length ? stroke[i + 2] : stroke[i + 1]
          ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
            p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1])
        }}
        ctx.stroke(); ctx.setLineDash([])
        const last = stroke[stroke.length - 1], prev = stroke[stroke.length - 2]
        const angle = Math.atan2(last[1] - prev[1], last[0] - prev[0])
        ctx.fillStyle = hintPulse ? 'rgba(232, 93, 58, 0.7)' : 'rgba(232, 93, 58, 0.4)'
        ctx.beginPath(); ctx.moveTo(last[0], last[1])
        ctx.lineTo(last[0] - 14 * Math.cos(angle - 0.5), last[1] - 14 * Math.sin(angle - 0.5))
        ctx.lineTo(last[0] - 14 * Math.cos(angle + 0.5), last[1] - 14 * Math.sin(angle + 0.5))
        ctx.closePath(); ctx.fill(); ctx.restore()
      }
    }
  }, [char, currentStroke, extractedPaths, drawCompletedStroke, hintPulse, showGuideZones])

  useEffect(() => {
    const guide = guideCanvasRef.current, draw = drawCanvasRef.current
    if (!guide || !draw) return
    guide.width = CANVAS_RES; guide.height = CANVAS_RES; draw.width = CANVAS_RES; draw.height = CANVAS_RES
    completedStrokes.current = new Set(); setCurrentStroke(0)
    setExtractedPaths(null); extractedPathsRef.current = null
    resetTraceState(); setStrokeFailed(false); setDebugInfo(null)
    const drawCtx = draw.getContext('2d'); if (drawCtx) drawCtx.clearRect(0, 0, CANVAS_RES, CANVAS_RES)
    const paths = extractStrokePaths(char.char, '', CANVAS_RES, char.strokes)
    extractedPathsRef.current = paths; setExtractedPaths(paths)
  }, [char, resetTraceState])

  useEffect(() => { drawGuide() }, [drawGuide])

  const playDemo = useCallback(() => {
    if (isPlayingDemo) return
    const paths = extractedPathsRef.current; if (!paths || paths.length === 0) return
    setIsPlayingDemo(true); onDemoPlay?.()
    const drawCtx = drawCanvasRef.current?.getContext('2d')
    if (drawCtx) drawCtx.clearRect(0, 0, CANVAS_RES, CANVAS_RES)
    completedStrokes.current = new Set(); resetTraceState()
    setCurrentStroke(0); setStrokeFailed(false); setDebugInfo(null)
    let si = 0, pi = 0
    const animate = () => {
      if (si >= paths.length) { setIsPlayingDemo(false)
        demoTimeoutRef.current = setTimeout(() => { if (drawCtx) drawCtx.clearRect(0, 0, CANVAS_RES, CANVAS_RES)
          completedStrokes.current = new Set(); resetTraceState(); setCurrentStroke(0) }, 800); return }
      const s = paths[si]; if (!drawCtx) return
      if (pi === 0) { drawCtx.beginPath(); drawCtx.lineCap = 'round'; drawCtx.lineJoin = 'round'
        drawCtx.lineWidth = PEN_WIDTH; drawCtx.strokeStyle = `rgba(45, 32, 22, ${TRACED_OPACITY})`; drawCtx.moveTo(s[0][0], s[0][1]) }
      if (pi < s.length) { drawCtx.lineTo(s[pi][0], s[pi][1]); drawCtx.stroke()
        drawCtx.beginPath(); drawCtx.moveTo(s[pi][0], s[pi][1]); pi++; demoAnimRef.current = requestAnimationFrame(animate) }
      else { completedStrokes.current.add(si); setCurrentStroke(si + 1); si++; pi = 0
        demoTimeoutRef.current = setTimeout(() => { demoAnimRef.current = requestAnimationFrame(animate) }, 300) }
    }; demoAnimRef.current = requestAnimationFrame(animate)
  }, [isPlayingDemo, char, resetTraceState, onDemoPlay])

  useEffect(() => () => { if (demoAnimRef.current) cancelAnimationFrame(demoAnimRef.current); if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current) }, [])

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = drawCanvasRef.current; if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    let cx: number, cy: number
    if ('touches' in e) { if (e.touches.length === 0) return null; cx = e.touches[0].clientX; cy = e.touches[0].clientY }
    else { cx = e.clientX; cy = e.clientY }
    return { x: ((cx - rect.left) / rect.width) * CANVAS_RES, y: ((cy - rect.top) / rect.height) * CANVAS_RES }
  }

  const triggerHint = useCallback(() => { setHintPulse(true); setTimeout(() => setHintPulse(false), 800) }, [])
  const clearDrawCanvas = useCallback(() => { const ctx = drawCanvasRef.current?.getContext('2d'); if (ctx) ctx.clearRect(0, 0, CANVAS_RES, CANVAS_RES) }, [])

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault(); if (isPlayingDemo) return
    const pos = getPos(e); if (!pos) return
    const paths = extractedPathsRef.current; if (!paths || currentStroke >= paths.length) return
    const stroke = paths[currentStroke]; if (stroke.length === 0) return
    setStrokeFailed(false); setDebugInfo(null)
    const dx = pos.x - stroke[0][0], dy = pos.y - stroke[0][1]
    if (Math.sqrt(dx * dx + dy * dy) > START_RADIUS) { triggerHint(); return }
    isDrawing.current = true; lastPos.current = pos; resetTraceState()
    traceState.current.started = true; traceState.current.nextCheckpoint = 0
    const { dist } = distToPath(pos.x, pos.y, stroke)
    traceState.current.pointCount = 1; traceState.current.totalDistance = dist
    traceState.current.lastX = pos.x; traceState.current.lastY = pos.y
    traceState.current.prevMoveX = pos.x; traceState.current.prevMoveY = pos.y; traceState.current.userDrawLength = 0
    const ctx = drawCanvasRef.current?.getContext('2d')
    if (ctx) { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = PEN_WIDTH
      ctx.strokeStyle = `rgba(45, 32, 22, ${TRACED_OPACITY})`; ctx.beginPath(); ctx.moveTo(pos.x, pos.y) }
  }

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault(); if (!isDrawing.current || isPlayingDemo) return
    const pos = getPos(e); if (!pos || !lastPos.current) return
    const dx = pos.x - lastPos.current.x, dy = pos.y - lastPos.current.y
    if (Math.sqrt(dx * dx + dy * dy) < MIN_MOVE) return
    const paths = extractedPathsRef.current; if (!paths || currentStroke >= paths.length) return
    const stroke = paths[currentStroke]
    const ctx = drawCanvasRef.current?.getContext('2d')
    if (ctx) { ctx.lineTo(pos.x, pos.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(pos.x, pos.y) }
    lastPos.current = pos
    traceState.current.lastX = pos.x; traceState.current.lastY = pos.y
    const segDx = pos.x - traceState.current.prevMoveX, segDy = pos.y - traceState.current.prevMoveY
    traceState.current.userDrawLength += Math.sqrt(segDx * segDx + segDy * segDy)
    traceState.current.prevMoveX = pos.x; traceState.current.prevMoveY = pos.y

    const { dist, nearestIdx } = distToPath(pos.x, pos.y, stroke)
    traceState.current.pointCount++; traceState.current.totalDistance += dist
    if (dist > PATH_RADIUS) { traceState.current.currentFarStreak++
      if (traceState.current.currentFarStreak > traceState.current.maxConsecutiveFar) traceState.current.maxConsecutiveFar = traceState.current.currentFarStreak
    } else { traceState.current.currentFarStreak = 0 }

    const maxJump = Math.max(1, Math.floor(stroke.length * MAX_CHECKPOINT_JUMP_RATIO))
    const cur = traceState.current.nextCheckpoint
    if (nearestIdx >= cur && nearestIdx <= cur + maxJump) { traceState.current.nextCheckpoint = nearestIdx + 1 }
  }

  const handleEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault(); if (!isDrawing.current) return
    isDrawing.current = false; lastPos.current = null
    const paths = extractedPathsRef.current; if (!paths || currentStroke >= paths.length) return
    const stroke = paths[currentStroke]; const ts = traceState.current

    if (!ts.started || ts.pointCount < MIN_SAMPLE_POINTS) { resetTraceState(); return }

    const avgDist = ts.totalDistance / ts.pointCount
    const coverage = ts.nextCheckpoint / stroke.length
    const farStreakRatio = ts.pointCount > 0 ? ts.maxConsecutiveFar / ts.pointCount : 0

    // Check end point distance using saved last position
    const endPoint = stroke[stroke.length - 1]
    const endDist = Math.sqrt((ts.lastX - endPoint[0]) ** 2 + (ts.lastY - endPoint[1]) ** 2)
    const reachedEnd = endDist <= END_RADIUS

    // Stroke length comparison
    let idealLength = 0
    for (let i = 1; i < stroke.length; i++) {
      const sdx = stroke[i][0] - stroke[i - 1][0], sdy = stroke[i][1] - stroke[i - 1][1]
      idealLength += Math.sqrt(sdx * sdx + sdy * sdy)
    }
    const lengthRatio = idealLength > 0 ? ts.userDrawLength / idealLength : 1
    const lengthOk = lengthRatio <= MAX_LENGTH_RATIO

    const passed = coverage >= MIN_COVERAGE && reachedEnd && avgDist <= SCORE_THRESHOLD && farStreakRatio < MAX_FAR_STREAK_RATIO && lengthOk

    if (showDebug) {
      setDebugInfo({
        coverage, coverageReq: MIN_COVERAGE,
        avgDist, avgDistReq: SCORE_THRESHOLD,
        farStreak: farStreakRatio, farStreakReq: MAX_FAR_STREAK_RATIO,
        samples: ts.pointCount, samplesReq: MIN_SAMPLE_POINTS,
        lengthRatio, lengthReq: MAX_LENGTH_RATIO,
        passed,
      })
    }

    if (passed) {
      completedStrokes.current.add(currentStroke)
      drawCompletedStroke(currentStroke); drawGuide(); resetTraceState()
      onStrokeComplete?.(currentStroke, char.strokes.length)
      const next = currentStroke + 1
      if (next >= char.strokes.length) { onComplete() }
      else { setCurrentStroke(next) }
    } else {
      setStrokeFailed(true); triggerHint(); onStrokeFailed?.()
      setTimeout(() => { clearDrawCanvas(); setStrokeFailed(false); resetTraceState() }, showDebug ? 3000 : 1000)
    }
  }

  return (
    <div className="tracing-wrapper" ref={containerRef}>
      {/* Buttons OUTSIDE canvas */}
      <div className="tracing-toolbar">
        <button className={`demo-btn ${isPlayingDemo ? 'playing' : ''}`} onClick={playDemo} disabled={isPlayingDemo}>
          {isPlayingDemo ? '再生中…' : '▶ お手本'}
        </button>
        <button className={`guide-btn ${showGuideZones ? 'active' : ''}`} onClick={() => setShowGuideZones(v => !v)}>
          {showGuideZones ? 'ガイド ON' : 'ガイド'}
        </button>
        <button className={`debug-btn ${showDebug ? 'active' : ''}`} onClick={() => { setShowDebug(v => !v); setDebugInfo(null) }}>
          🐛
        </button>
      </div>

      <div className="canvas-container">
        <canvas ref={guideCanvasRef} style={{ zIndex: 1 }} />
        <canvas ref={drawCanvasRef} style={{ zIndex: 2 }}
          onMouseDown={handleStart} onMouseMove={handleMove} onMouseUp={handleEnd} onMouseLeave={handleEnd}
          onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleEnd} onTouchCancel={handleEnd}
        />
        {strokeFailed && !showDebug && (
          <div className="stroke-score failed">もういちど！</div>
        )}
        <div className="stroke-order-dots" style={{ position: 'absolute', bottom: 12, left: 0, right: 0, zIndex: 3 }}>
          {char.strokes.map((_, idx) => (
            <div key={idx} className={`stroke-dot${completedStrokes.current.has(idx) ? ' completed' : idx === currentStroke ? ' current' : ''}`} />
          ))}
        </div>
        {/* Debug overlay inside canvas - no layout shift */}
        {showDebug && debugInfo && (
          <div className={`debug-overlay ${debugInfo.passed ? 'pass' : 'fail'}`}>
            <div className="debug-title">{debugInfo.passed ? '✅ 合格' : '❌ 不合格'}</div>
            <div>網羅:{(debugInfo.coverage * 100).toFixed(0)}%/{(debugInfo.coverageReq * 100).toFixed(0)}%{debugInfo.coverage >= debugInfo.coverageReq ? '✅' : '❌'} 距離:{debugInfo.avgDist.toFixed(0)}/{debugInfo.avgDistReq.toFixed(0)}{debugInfo.avgDist <= debugInfo.avgDistReq ? '✅' : '❌'}</div>
            <div>逸脱:{(debugInfo.farStreak * 100).toFixed(0)}%/{(debugInfo.farStreakReq * 100).toFixed(0)}%{debugInfo.farStreak < debugInfo.farStreakReq ? '✅' : '❌'} 長比:{(debugInfo.lengthRatio * 100).toFixed(0)}%/{(debugInfo.lengthReq * 100).toFixed(0)}%{debugInfo.lengthRatio <= debugInfo.lengthReq ? '✅' : '❌'}</div>
          </div>
        )}
      </div>
    </div>
  )
}
