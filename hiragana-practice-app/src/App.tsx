import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  allHiragana, allKatakana,
  gojuonTable, katakanaGojuonTable,
  dakuonTable, katakanaDakuonTable,
  getKanjiTable, getKanjiChars,
  GRADE_LABELS,
  type HiraganaChar, type CharMode, type GradeIndex,
} from './hiraganaData'
import { TracingCanvas } from './TracingCanvas'
import { CharacterSelect } from './CharacterSelect'
import { speakChar, speakPraise, isSpeechEnabled, toggleSpeech } from './useSpeech'

const STORAGE_KEY = 'hiragana-practice-progress'

function loadProgress(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveProgress(mode: string, chars: Set<string>) {
  const data = loadProgress()
  data[mode] = [...chars]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export default function App() {
  const [mode, setMode] = useState<CharMode>('hiragana')
  const [kanjiGrade, setKanjiGrade] = useState<GradeIndex>(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showSelector, setShowSelector] = useState(false)
  const [completedChars, setCompletedChars] = useState<Set<string>>(() => {
    const data = loadProgress()
    const key = 'hiragana'
    return new Set(data[key] || [])
  })
  const [showSuccess, setShowSuccess] = useState(false)
  const [successChar, setSuccessChar] = useState('')
  const [successPraise, setSuccessPraise] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [soundOn, setSoundOn] = useState(true)
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const modeKey = mode === 'kanji' ? `kanji-${kanjiGrade}` : mode

  // Load completed chars when mode changes
  useEffect(() => {
    const data = loadProgress()
    setCompletedChars(new Set(data[modeKey] || []))
  }, [modeKey])

  const chars = useMemo(() => {
    if (mode === 'hiragana') return allHiragana
    if (mode === 'katakana') return allKatakana
    return getKanjiChars(kanjiGrade)
  }, [mode, kanjiGrade])

  const table = useMemo(() => {
    if (mode === 'hiragana') return [...gojuonTable, ...dakuonTable]
    if (mode === 'katakana') return [...katakanaGojuonTable, ...katakanaDakuonTable]
    return getKanjiTable(kanjiGrade)
  }, [mode, kanjiGrade])

  const currentChar = chars[Math.min(currentIndex, chars.length - 1)] || chars[0]

  const goTo = useCallback((index: number) => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current)
      autoAdvanceTimer.current = null
    }
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
    const praiseList = ['じょうず！', 'すごい！', 'できたね！', 'やったね！', 'かんぺき！']
    const praise = praiseList[Math.floor(Math.random() * praiseList.length)]

    setCompletedChars(prev => {
      const next = new Set(prev).add(currentChar.char)
      saveProgress(modeKey, next)
      return next
    })
    setSuccessChar(currentChar.char)
    setSuccessPraise(praise)
    setShowSuccess(true)

    // Speech
    if (isSpeechEnabled()) {
      speakChar(currentChar.char)
      speakPraise()
    }

    // No auto advance - user chooses via buttons
  }, [currentChar, modeKey])

  const handleRetry = useCallback(() => {
    if (autoAdvanceTimer.current) {
      clearTimeout(autoAdvanceTimer.current)
      autoAdvanceTimer.current = null
    }
    setShowSuccess(false)
    setResetKey(k => k + 1)
  }, [])

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

  const handleToggleSound = useCallback(() => {
    const enabled = toggleSpeech()
    setSoundOn(enabled)
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
          <button className="btn btn-icon-sm" onClick={handleToggleSound} title={soundOn ? '音声オフ' : '音声オン'}>
            {soundOn ? '🔊' : '🔇'}
          </button>
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
          <div className="success-overlay">
            <div className="success-content">
              <div className="success-char">{successChar}</div>
              <div className="success-text">{successPraise}</div>
              <div className="success-buttons">
                <button className="btn btn-retry" onClick={handleRetry}>
                  もう一回
                </button>
                <button className="btn btn-next" onClick={() => {
                  if (currentIndex < chars.length - 1) goTo(currentIndex + 1)
                  else setShowSuccess(false)
                }}>
                  つぎへ ▶
                </button>
              </div>
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
