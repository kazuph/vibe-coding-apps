import { useState, useCallback, useMemo } from 'react'
import {
  allHiragana, allKatakana,
  gojuonTable, katakanaGojuonTable,
  getKanjiTable, getKanjiChars,
  GRADE_LABELS,
  type HiraganaChar, type CharMode, type GradeIndex,
} from './hiraganaData'
import { TracingCanvas } from './TracingCanvas'
import { CharacterSelect } from './CharacterSelect'

export default function App() {
  const [mode, setMode] = useState<CharMode>('hiragana')
  const [kanjiGrade, setKanjiGrade] = useState<GradeIndex>(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showSelector, setShowSelector] = useState(false)
  const [completedChars, setCompletedChars] = useState<Set<string>>(new Set())
  const [showSuccess, setShowSuccess] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  const chars = useMemo(() => {
    if (mode === 'hiragana') return allHiragana
    if (mode === 'katakana') return allKatakana
    return getKanjiChars(kanjiGrade)
  }, [mode, kanjiGrade])

  const table = useMemo(() => {
    if (mode === 'hiragana') return gojuonTable
    if (mode === 'katakana') return katakanaGojuonTable
    return getKanjiTable(kanjiGrade)
  }, [mode, kanjiGrade])

  const currentChar = chars[Math.min(currentIndex, chars.length - 1)] || chars[0]

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index)
    setShowSuccess(false)
    setResetKey(k => k + 1)
  }, [])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) goTo(currentIndex - 1)
  }, [currentIndex, goTo])

  const goNext = useCallback(() => {
    if (currentIndex < chars.length - 1) goTo(currentIndex + 1)
  }, [currentIndex, chars.length, goTo])

  const handleSelectChar = useCallback((char: HiraganaChar) => {
    const idx = chars.findIndex(c => c.char === char.char)
    if (idx >= 0) goTo(idx)
    setShowSelector(false)
  }, [chars, goTo])

  const handleComplete = useCallback(() => {
    setCompletedChars(prev => new Set(prev).add(currentChar.char))
    setShowSuccess(true)
    setTimeout(() => {
      setShowSuccess(false)
      if (currentIndex < chars.length - 1) {
        goTo(currentIndex + 1)
      }
    }, 1500)
  }, [currentChar, currentIndex, chars.length, goTo])

  const handleReset = useCallback(() => {
    setShowSuccess(false)
    setResetKey(k => k + 1)
  }, [])

  const switchMode = useCallback((newMode: CharMode) => {
    if (mode !== newMode) {
      setMode(newMode)
      setCurrentIndex(0)
      setShowSuccess(false)
      setResetKey(k => k + 1)
    }
  }, [mode])

  const switchGrade = useCallback((grade: GradeIndex) => {
    setKanjiGrade(grade)
    setCurrentIndex(0)
    setShowSuccess(false)
    setResetKey(k => k + 1)
  }, [])

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="mode-toggle">
          <button className={`mode-btn ${mode === 'hiragana' ? 'active' : ''}`} onClick={() => switchMode('hiragana')}>
            ひらがな
          </button>
          <button className={`mode-btn ${mode === 'katakana' ? 'active' : ''}`} onClick={() => switchMode('katakana')}>
            カタカナ
          </button>
          <button className={`mode-btn ${mode === 'kanji' ? 'active' : ''}`} onClick={() => switchMode('kanji')}>
            漢字
          </button>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleReset}>クリア</button>
          <button className="btn btn-primary" onClick={() => setShowSelector(true)}>
            {mode === 'kanji' ? '一覧' : '50音'}
          </button>
        </div>
      </header>

      {/* Grade selector for kanji mode */}
      {mode === 'kanji' && (
        <div className="grade-selector">
          {GRADE_LABELS.map((label, i) => (
            <button
              key={i}
              className={`grade-btn ${kanjiGrade === i ? 'active' : ''}`}
              onClick={() => switchGrade(i as GradeIndex)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Practice area */}
      <div className="practice-area">
        <TracingCanvas
          key={`${mode}-${kanjiGrade}-${resetKey}`}
          char={currentChar}
          onComplete={handleComplete}
        />

        {showSuccess && (
          <div className="success-overlay" onClick={() => setShowSuccess(false)}>
            <div className="success-content">
              <div className="success-char">{currentChar.char}</div>
              <div className="success-text">じょうず！</div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom navigation */}
      <div className="bottom-controls">
        <button className="char-nav-btn" onClick={goPrev} disabled={currentIndex === 0}>◀</button>
        <div style={{ textAlign: 'center' }}>
          <div className="current-char-display">{currentChar.char}</div>
          <div className="stroke-info">
            {currentChar.romaji ? `${currentChar.romaji} ・ ` : ''}{currentChar.strokeCount}画
          </div>
        </div>
        <button className="char-nav-btn" onClick={goNext} disabled={currentIndex === chars.length - 1}>▶</button>
      </div>

      {/* License */}
      <div className="license-footer">
        Stroke data: <a href="https://github.com/parsimonhi/animCJK" target="_blank" rel="noopener noreferrer">animCJK</a> (LGPL-3.0)
      </div>

      {/* Character selection */}
      {showSelector && (
        <CharacterSelect
          rows={table}
          currentChar={currentChar.char}
          completedChars={completedChars}
          onSelect={handleSelectChar}
          onClose={() => setShowSelector(false)}
          gridCols={mode === 'kanji' ? 8 : 5}
        />
      )}
    </div>
  )
}
