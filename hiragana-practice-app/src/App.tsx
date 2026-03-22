import { useState, useCallback, useMemo } from 'react'
import {
  allHiragana, allKatakana,
  gojuonTable, katakanaGojuonTable,
  type HiraganaChar, type CharMode,
} from './hiraganaData'
import { TracingCanvas } from './TracingCanvas'
import { CharacterSelect } from './CharacterSelect'

export default function App() {
  const [mode, setMode] = useState<CharMode>('hiragana')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showSelector, setShowSelector] = useState(false)
  const [completedChars, setCompletedChars] = useState<Set<string>>(new Set())
  const [showSuccess, setShowSuccess] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  const chars = useMemo(() => mode === 'hiragana' ? allHiragana : allKatakana, [mode])
  const table = useMemo(() => mode === 'hiragana' ? gojuonTable : katakanaGojuonTable, [mode])
  const currentChar = chars[currentIndex] || chars[0]

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

  const toggleMode = useCallback(() => {
    setMode(m => m === 'hiragana' ? 'katakana' : 'hiragana')
    setCurrentIndex(0)
    setShowSuccess(false)
    setResetKey(k => k + 1)
  }, [])

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === 'hiragana' ? 'active' : ''}`}
            onClick={() => { if (mode !== 'hiragana') toggleMode() }}
          >
            ひらがな
          </button>
          <button
            className={`mode-btn ${mode === 'katakana' ? 'active' : ''}`}
            onClick={() => { if (mode !== 'katakana') toggleMode() }}
          >
            カタカナ
          </button>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={handleReset}>
            クリア
          </button>
          <button className="btn btn-primary" onClick={() => setShowSelector(true)}>
            50音
          </button>
        </div>
      </header>

      {/* Practice area */}
      <div className="practice-area">
        <TracingCanvas
          key={`${mode}-${resetKey}`}
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
        <button className="char-nav-btn" onClick={goPrev} disabled={currentIndex === 0}>
          ◀
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="current-char-display">{currentChar.char}</div>
          <div className="stroke-info">{currentChar.romaji} ・ {currentChar.strokeCount}画</div>
        </div>
        <button className="char-nav-btn" onClick={goNext} disabled={currentIndex === chars.length - 1}>
          ▶
        </button>
      </div>

      {/* License attribution */}
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
        />
      )}
    </div>
  )
}
