import { useRef, useEffect, useCallback, useState } from 'react'
import type { HiraganaChar } from './hiraganaData'
import { extractStrokePaths, getStrokeOutlines } from './strokeExtractor'

interface Props {
  char: HiraganaChar
  onComplete: () => void
}

const CANVAS_RES = 800
const HIT_RADIUS_PX = 45
const MIN_MOVE = 2
const PEN_WIDTH = 18
const GUIDE_OPACITY = 0.15
const TRACED_OPACITY = 0.85

export function TracingCanvas({ char, onComplete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const guideCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawCanvasRef = useRef<HTMLCanvasElement>(null)

  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  const [currentStroke, setCurrentStroke] = useState(0)
  const strokeProgress = useRef<number[]>([])
  const completedStrokes = useRef<Set<number>>(new Set())
  const [isPlayingDemo, setIsPlayingDemo] = useState(false)
  const demoAnimRef = useRef<number | null>(null)
  const demoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hintPulse, setHintPulse] = useState(false)

  const [extractedPaths, setExtractedPaths] = useState<number[][][] | null>(null)
  const extractedPathsRef = useRef<number[][][] | null>(null)

  // Draw a completed stroke outline with color
  const drawCompletedStroke = useCallback((strokeIdx: number) => {
    const canvas = guideCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = CANVAS_RES
    const margin = size * 0.05
    const area = size - margin * 2
    const outlines = getStrokeOutlines(char.char, size)
    if (!outlines || strokeIdx >= outlines.length) return

    const scale = area / 1024
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.fillStyle = '#4caf50'
    ctx.setTransform(scale, 0, 0, scale, margin, margin)
    const p2d = new Path2D(outlines[strokeIdx].path)
    ctx.fill(p2d)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.restore()
  }, [char])

  const drawGuide = useCallback(() => {
    const canvas = guideCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const size = CANVAS_RES
    ctx.clearRect(0, 0, size, size)

    ctx.strokeStyle = 'rgba(180, 150, 120, 0.45)'
    ctx.lineWidth = 2
    const margin = size * 0.05
    ctx.strokeRect(margin, margin, size - margin * 2, size - margin * 2)

    ctx.setLineDash([10, 8])
    ctx.strokeStyle = 'rgba(180, 150, 120, 0.35)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(size / 2, margin)
    ctx.lineTo(size / 2, size - margin)
    ctx.moveTo(margin, size / 2)
    ctx.lineTo(size - margin, size / 2)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(180, 150, 120, 0.18)'
    ctx.beginPath()
    ctx.moveTo(margin, margin)
    ctx.lineTo(size - margin, size - margin)
    ctx.moveTo(size - margin, margin)
    ctx.lineTo(margin, size - margin)
    ctx.stroke()
    ctx.setLineDash([])

    const area = size - margin * 2
    const outlines = getStrokeOutlines(char.char, size)
    if (outlines) {
      ctx.save()
      ctx.globalAlpha = GUIDE_OPACITY
      ctx.fillStyle = '#5a4a3a'
      const scale = area / 1024
      ctx.setTransform(scale, 0, 0, scale, margin, margin)
      for (const { path } of outlines) {
        const p2d = new Path2D(path)
        ctx.fill(p2d)
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.restore()
    }

    // Draw completed stroke outlines in green
    completedStrokes.current.forEach(idx => {
      drawCompletedStroke(idx)
    })

    const paths = extractedPaths
    if (!paths) return

    paths.forEach((stroke, idx) => {
      if (stroke.length === 0) return
      const startX = stroke[0][0]
      const startY = stroke[0][1]
      const circleR = 14
      ctx.save()

      if (idx < currentStroke) {
        ctx.globalAlpha = 0.4
        ctx.fillStyle = '#4caf50'
      } else if (idx === currentStroke) {
        ctx.globalAlpha = hintPulse ? 1.0 : 0.9
        ctx.fillStyle = '#e85d3a'
        if (hintPulse) {
          ctx.beginPath()
          ctx.arc(startX, startY, circleR + 8, 0, Math.PI * 2)
          ctx.strokeStyle = 'rgba(232, 93, 58, 0.5)'
          ctx.lineWidth = 3
          ctx.stroke()
        }
      } else {
        ctx.globalAlpha = 0.3
        ctx.fillStyle = '#8b7355'
      }

      ctx.beginPath()
      ctx.arc(startX, startY, circleR, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'white'
      ctx.font = 'bold 14px "Noto Sans JP", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(idx + 1), startX, startY + 1)
      ctx.restore()
    })

    if (currentStroke < paths.length) {
      const stroke = paths[currentStroke]
      if (stroke.length >= 2) {
        ctx.save()
        ctx.strokeStyle = hintPulse ? 'rgba(232, 93, 58, 0.6)' : 'rgba(232, 93, 58, 0.3)'
        ctx.lineWidth = hintPulse ? 6 : 4
        ctx.setLineDash([6, 6])
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(stroke[0][0], stroke[0][1])
        if (stroke.length === 2) {
          ctx.lineTo(stroke[1][0], stroke[1][1])
        } else {
          for (let i = 0; i < stroke.length - 1; i++) {
            const p0 = i > 0 ? stroke[i - 1] : stroke[i]
            const p1 = stroke[i]
            const p2 = stroke[i + 1]
            const p3 = i + 2 < stroke.length ? stroke[i + 2] : stroke[i + 1]
            const cp1x = p1[0] + (p2[0] - p0[0]) / 6
            const cp1y = p1[1] + (p2[1] - p0[1]) / 6
            const cp2x = p2[0] - (p3[0] - p1[0]) / 6
            const cp2y = p2[1] - (p3[1] - p1[1]) / 6
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1])
          }
        }
        ctx.stroke()
        ctx.setLineDash([])

        const last = stroke[stroke.length - 1]
        const prev = stroke[stroke.length - 2]
        const angle = Math.atan2(last[1] - prev[1], last[0] - prev[0])
        const ex = last[0], ey = last[1]
        ctx.fillStyle = hintPulse ? 'rgba(232, 93, 58, 0.7)' : 'rgba(232, 93, 58, 0.4)'
        ctx.beginPath()
        ctx.moveTo(ex, ey)
        ctx.lineTo(ex - 14 * Math.cos(angle - 0.5), ey - 14 * Math.sin(angle - 0.5))
        ctx.lineTo(ex - 14 * Math.cos(angle + 0.5), ey - 14 * Math.sin(angle + 0.5))
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }
  }, [char, currentStroke, extractedPaths, drawCompletedStroke, hintPulse])

  useEffect(() => {
    const guide = guideCanvasRef.current
    const draw = drawCanvasRef.current
    if (!guide || !draw) return

    guide.width = CANVAS_RES
    guide.height = CANVAS_RES
    draw.width = CANVAS_RES
    draw.height = CANVAS_RES

    strokeProgress.current = new Array(char.strokes.length).fill(0)
    completedStrokes.current = new Set()
    setCurrentStroke(0)
    setExtractedPaths(null)
    extractedPathsRef.current = null

    const drawCtx = draw.getContext('2d')
    if (drawCtx) drawCtx.clearRect(0, 0, CANVAS_RES, CANVAS_RES)

    const paths = extractStrokePaths(char.char, '', CANVAS_RES, char.strokes)
    extractedPathsRef.current = paths
    setExtractedPaths(paths)
  }, [char])

  useEffect(() => {
    drawGuide()
  }, [drawGuide])

  // Demo animation
  const playDemo = useCallback(() => {
    if (isPlayingDemo) return
    const paths = extractedPathsRef.current
    if (!paths || paths.length === 0) return

    setIsPlayingDemo(true)
    const drawCtx = drawCanvasRef.current?.getContext('2d')
    if (drawCtx) drawCtx.clearRect(0, 0, CANVAS_RES, CANVAS_RES)

    // Reset completed for visual
    completedStrokes.current = new Set()
    strokeProgress.current = new Array(char.strokes.length).fill(0)
    setCurrentStroke(0)

    let strokeIdx = 0
    let pointIdx = 0

    const animate = () => {
      if (strokeIdx >= paths.length) {
        setIsPlayingDemo(false)
        demoTimeoutRef.current = setTimeout(() => {
          if (drawCtx) drawCtx.clearRect(0, 0, CANVAS_RES, CANVAS_RES)
          completedStrokes.current = new Set()
          strokeProgress.current = new Array(char.strokes.length).fill(0)
          setCurrentStroke(0)
        }, 800)
        return
      }

      const stroke = paths[strokeIdx]
      if (!drawCtx) return

      if (pointIdx === 0) {
        drawCtx.beginPath()
        drawCtx.lineCap = 'round'
        drawCtx.lineJoin = 'round'
        drawCtx.lineWidth = PEN_WIDTH
        drawCtx.strokeStyle = `rgba(45, 32, 22, ${TRACED_OPACITY})`
        drawCtx.moveTo(stroke[0][0], stroke[0][1])
      }

      if (pointIdx < stroke.length) {
        drawCtx.lineTo(stroke[pointIdx][0], stroke[pointIdx][1])
        drawCtx.stroke()
        drawCtx.beginPath()
        drawCtx.moveTo(stroke[pointIdx][0], stroke[pointIdx][1])
        pointIdx++
        demoAnimRef.current = requestAnimationFrame(animate)
      } else {
        completedStrokes.current.add(strokeIdx)
        setCurrentStroke(strokeIdx + 1)
        strokeIdx++
        pointIdx = 0
        demoTimeoutRef.current = setTimeout(() => {
          demoAnimRef.current = requestAnimationFrame(animate)
        }, 300)
      }
    }

    demoAnimRef.current = requestAnimationFrame(animate)
  }, [isPlayingDemo, char])

  useEffect(() => {
    return () => {
      if (demoAnimRef.current) cancelAnimationFrame(demoAnimRef.current)
      if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current)
    }
  }, [])

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = drawCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()

    let clientX: number, clientY: number
    if ('touches' in e) {
      if (e.touches.length === 0) return null
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_RES,
      y: ((clientY - rect.top) / rect.height) * CANVAS_RES,
    }
  }

  const checkStrokeProgress = (x: number, y: number) => {
    const paths = extractedPathsRef.current
    if (!paths || currentStroke >= paths.length) return

    const stroke = paths[currentStroke]
    const hitR = HIT_RADIUS_PX

    let maxHitIdx = -1
    for (let i = 0; i < stroke.length; i++) {
      const dx = x - stroke[i][0]
      const dy = y - stroke[i][1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < hitR) {
        maxHitIdx = i
      }
    }

    if (maxHitIdx >= 0) {
      const progress = (maxHitIdx + 1) / stroke.length
      if (!strokeProgress.current[currentStroke] || progress > strokeProgress.current[currentStroke]) {
        strokeProgress.current[currentStroke] = progress
      }

      if (maxHitIdx >= stroke.length - 1 && strokeProgress.current[currentStroke] > 0.5) {
        completedStrokes.current.add(currentStroke)
      }
    }
  }

  const triggerHint = useCallback(() => {
    setHintPulse(true)
    setTimeout(() => setHintPulse(false), 800)
  }, [])

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    if (isPlayingDemo) return
    const pos = getPos(e)
    if (!pos) return
    isDrawing.current = true
    lastPos.current = pos

    const ctx = drawCanvasRef.current?.getContext('2d')
    if (ctx) {
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = PEN_WIDTH
      ctx.strokeStyle = `rgba(45, 32, 22, ${TRACED_OPACITY})`
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }

    // Check if far from current stroke start → hint
    const paths = extractedPathsRef.current
    if (paths && currentStroke < paths.length) {
      const stroke = paths[currentStroke]
      if (stroke.length > 0) {
        const dx = pos.x - stroke[0][0]
        const dy = pos.y - stroke[0][1]
        if (Math.sqrt(dx * dx + dy * dy) > HIT_RADIUS_PX * 3) {
          triggerHint()
        }
      }
    }

    checkStrokeProgress(pos.x, pos.y)
  }

  const handleMove = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    if (!isDrawing.current || isPlayingDemo) return
    const pos = getPos(e)
    if (!pos || !lastPos.current) return

    const dx = pos.x - lastPos.current.x
    const dy = pos.y - lastPos.current.y
    if (Math.sqrt(dx * dx + dy * dy) < MIN_MOVE) return

    const ctx = drawCanvasRef.current?.getContext('2d')
    if (ctx) {
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(pos.x, pos.y)
    }

    lastPos.current = pos
    checkStrokeProgress(pos.x, pos.y)
  }

  const handleEnd = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    if (!isDrawing.current) return
    isDrawing.current = false
    lastPos.current = null

    if (completedStrokes.current.has(currentStroke)) {
      drawCompletedStroke(currentStroke)
      drawGuide()

      const next = currentStroke + 1
      if (next >= char.strokes.length) {
        onComplete()
      } else {
        setCurrentStroke(next)
      }
    }
  }

  return (
    <div className="canvas-container" ref={containerRef}>
      <canvas ref={guideCanvasRef} style={{ zIndex: 1 }} />
      <canvas
        ref={drawCanvasRef}
        style={{ zIndex: 2 }}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
      />
      <button
        className={`demo-btn ${isPlayingDemo ? 'playing' : ''}`}
        onClick={playDemo}
        disabled={isPlayingDemo}
        title="お手本を見る"
      >
        {isPlayingDemo ? '再生中…' : '▶ お手本'}
      </button>
      <div className="stroke-order-dots" style={{ position: 'absolute', bottom: 12, left: 0, right: 0, zIndex: 3 }}>
        {char.strokes.map((_, idx) => (
          <div
            key={idx}
            className={`stroke-dot${
              completedStrokes.current.has(idx) ? ' completed' :
              idx === currentStroke ? ' current' : ''
            }`}
          />
        ))}
      </div>
    </div>
  )
}
