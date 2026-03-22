import { useState, useCallback } from 'react'
import { allChars, gojuonTable, type HiraganaChar } from './hiraganaData'
import { TracingCanvas } from './TracingCanvas'
import { CharacterSelect } from './CharacterSelect'

export default function App() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showSelector, setShowSelector] = useState(false)
  const [completedChars, setCompletedChars] = useState<Set<string>>(new Set())
  const [showSuccess, setShowSuccess] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  const currentChar = allChars[currentIndex]

  const goTo = useCallback((index: number) => {
    setCurrentIndex(index)
    setShowSuccess(false)
    setResetKey(k => k + 1)
  }, [])

  const goPrev = useCallback(() => {
    if (currentIndex > 0) goTo(currentIndex - 1)
  }, [currentIndex, goTo])

  const goNext = useCallback(() => {
    if (currentIndex < allChars.length - 1) goTo(currentIndex + 1)
  }, [currentIndex, goTo])

  const handleSelectChar = useCallback((char: HiraganaChar) => {
    const idx = allChars.findIndex(c => c.char === char.char)
    if (idx >= 0) goTo(idx)
    setShowSelector(false)
  }, [goTo])

  const handleComplete = useCallback(() => {
    setCompletedChars(prev => new Set(prev).add(currentChar.char))
    setShowSuccess(true)
    setTimeout(() => {
      setShowSuccess(false)
      if (currentIndex < allChars.length - 1) {
        goTo(currentIndex + 1)
      }
    }, 1500)
  }, [currentChar, currentIndex, goTo])

  const handleReset = useCallback(() => {
    setShowSuccess(false)
    setResetKey(k => k + 1)
  }, [])

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <span className="app-title">ひらがな</span>
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
          key={resetKey}
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
        <button className="char-nav-btn" onClick={goNext} disabled={currentIndex === allChars.length - 1}>
          ▶
        </button>
      </div>

      {/* Character selection */}
      {showSelector && (
        <CharacterSelect
          rows={gojuonTable}
          currentChar={currentChar.char}
          completedChars={completedChars}
          onSelect={handleSelectChar}
          onClose={() => setShowSelector(false)}
        />
      )}
    </div>
  )
}
