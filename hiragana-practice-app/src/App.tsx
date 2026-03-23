import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  allHiragana, allKatakana,
  gojuonTable, katakanaGojuonTable,
  dakuonTable, katakanaDakuonTable,
  getKanjiTable, getKanjiChars,
  GRADE_LABELS,
  type HiraganaChar, type CharMode, type GradeIndex, type GojuonRow,
} from './hiraganaData'
import { TracingCanvas } from './TracingCanvas'
import { CharacterSelect } from './CharacterSelect'
import { speakChar, speakPraise, speakStrokeComplete, speakRetry, isSpeechEnabled, toggleSpeech } from './useSpeech'

const STORAGE_KEY = 'hiragana-practice-progress'

type PracticeMode = null | 'free' | 'row' | 'random'

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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getRowLabels(charMode: CharMode): string[] {
  if (charMode === 'hiragana') {
    return [...gojuonTable, ...dakuonTable].filter(r => r.label).map(r => r.label)
  }
  if (charMode === 'katakana') {
    return [...katakanaGojuonTable, ...katakanaDakuonTable].filter(r => r.label).map(r => r.label)
  }
  return GRADE_LABELS.map(l => l)
}

function getRowChars(charMode: CharMode, rowLabel: string): HiraganaChar[] {
  let tables: GojuonRow[]
  if (charMode === 'hiragana') {
    tables = [...gojuonTable, ...dakuonTable]
  } else if (charMode === 'katakana') {
    tables = [...katakanaGojuonTable, ...katakanaDakuonTable]
  } else {
    return []
  }
  const row = tables.find(r => r.label === rowLabel)
  if (!row) return []
  return row.chars.filter((c): c is HiraganaChar => c !== null)
}

export default function App() {
  const [charMode, setCharMode] = useState<CharMode>('hiragana')
  const [kanjiGrade, setKanjiGrade] = useState<GradeIndex>(0)
  const [practiceMode, setPracticeMode] = useState<PracticeMode>(null)
  const [selectedRow, setSelectedRow] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showSelector, setShowSelector] = useState(false)
  const [completedChars, setCompletedChars] = useState<Set<string>>(() => {
    const data = loadProgress()
    return new Set(data['hiragana'] || [])
  })
  const [showSuccess, setShowSuccess] = useState(false)
  const [successChar, setSuccessChar] = useState('')
  const [successPraise, setSuccessPraise] = useState('')
  const [resetKey, setResetKey] = useState(0)
  const [soundOn, setSoundOn] = useState(true)

  const modeKey = charMode === 'kanji' ? `kanji-${kanjiGrade}` : charMode

  useEffect(() => {
    const data = loadProgress()
    setCompletedChars(new Set(data[modeKey] || []))
  }, [modeKey])

  // Build character list based on practice mode
  const chars = useMemo(() => {
    let base: HiraganaChar[]
    if (charMode === 'hiragana') base = allHiragana
    else if (charMode === 'katakana') base = allKatakana
    else base = getKanjiChars(kanjiGrade)

    if (practiceMode === 'row' && selectedRow) {
      if (charMode === 'kanji') {
        // For kanji, selectedRow is grade label index
        return base
      }
      return getRowChars(charMode, selectedRow)
    }
    if (practiceMode === 'random') {
      return shuffle(base)
    }
    return base
  }, [charMode, kanjiGrade, practiceMode, selectedRow])

  const table = useMemo(() => {
    if (charMode === 'hiragana') return [...gojuonTable, ...dakuonTable]
    if (charMode === 'katakana') return [...katakanaGojuonTable, ...katakanaDakuonTable]
    return getKanjiTable(kanjiGrade)
  }, [charMode, kanjiGrade])

  const currentChar = chars[Math.min(currentIndex, chars.length - 1)] || chars[0]

  // Speak character when it changes (including initial display)
  useEffect(() => {
    if (practiceMode && currentChar && isSpeechEnabled()) {
      speakChar(currentChar.char)
    }
  }, [currentChar, practiceMode])

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

    if (isSpeechEnabled()) {
      speakChar(currentChar.char)
      speakPraise()
    }
  }, [currentChar, modeKey])

  const handleRetry = useCallback(() => {
    setShowSuccess(false)
    setResetKey(k => k + 1)
  }, [])

  const handleReset = useCallback(() => {
    setShowSuccess(false)
    setResetKey(k => k + 1)
  }, [])

  const handleStrokeComplete = useCallback((strokeIndex: number, totalStrokes: number) => {
    if (isSpeechEnabled()) {
      speakStrokeComplete(strokeIndex, totalStrokes)
    }
  }, [])

  const handleStrokeFailed = useCallback(() => {
    if (isSpeechEnabled()) {
      speakRetry()
    }
  }, [])

  const switchCharMode = useCallback((newMode: CharMode) => {
    if (charMode !== newMode) {
      setCharMode(newMode)
      setCurrentIndex(0)
      setShowSuccess(false)
      setResetKey(k => k + 1)
      // Go back to start screen when switching char type
      setPracticeMode(null)
      setSelectedRow(null)
    }
  }, [charMode])

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

  const startPractice = useCallback((pm: PracticeMode, row?: string) => {
    setPracticeMode(pm)
    if (row) setSelectedRow(row)
    setCurrentIndex(0)
    setShowSuccess(false)
    setResetKey(k => k + 1)
  }, [])

  const goBackToStart = useCallback(() => {
    setPracticeMode(null)
    setSelectedRow(null)
    setCurrentIndex(0)
    setShowSuccess(false)
  }, [])

  const rowLabels = useMemo(() => getRowLabels(charMode), [charMode])

  // === Start screen ===
  if (practiceMode === null) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="mode-toggle">
            <button className={`mode-btn ${charMode === 'hiragana' ? 'active' : ''}`} onClick={() => switchCharMode('hiragana')}>
              ひらがな
            </button>
            <button className={`mode-btn ${charMode === 'katakana' ? 'active' : ''}`} onClick={() => switchCharMode('katakana')}>
              カタカナ
            </button>
            <button className={`mode-btn ${charMode === 'kanji' ? 'active' : ''}`} onClick={() => switchCharMode('kanji')}>
              漢字
            </button>
          </div>
          <div className="header-actions">
            <button className="btn btn-icon-sm" onClick={handleToggleSound} title={soundOn ? '音声オフ' : '音声オン'}>
              {soundOn ? '🔊' : '🔇'}
            </button>
          </div>
        </header>

        {charMode === 'kanji' && (
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

        <div className="start-screen">
          <div className="start-title">
            {charMode === 'hiragana' ? 'ひらがな' : charMode === 'katakana' ? 'カタカナ' : '漢字'}れんしゅう
          </div>
          <div className="start-subtitle">れんしゅうモードをえらんでね</div>

          <div className="start-modes">
            <button className="start-mode-card" onClick={() => startPractice('free')}>
              <div className="start-mode-icon">📋</div>
              <div className="start-mode-label">じゆうにえらぶ</div>
              <div className="start-mode-desc">すきな文字かられんしゅう</div>
            </button>

            <button className="start-mode-card" onClick={() => setPracticeMode('row')}>
              <div className="start-mode-icon">📖</div>
              <div className="start-mode-label">行をえらぶ</div>
              <div className="start-mode-desc">あ行、か行…からえらぶ</div>
            </button>

            <button className="start-mode-card" onClick={() => startPractice('random')}>
              <div className="start-mode-icon">🎲</div>
              <div className="start-mode-label">ランダム</div>
              <div className="start-mode-desc">ランダムじゅんばんで出題</div>
            </button>
          </div>

          {/* Row selection sub-screen */}
          {practiceMode === 'row' && (
            <div className="row-select-overlay" onClick={(e) => {
              if (e.target === e.currentTarget) setPracticeMode(null)
            }}>
              <div className="row-select-panel">
                <div className="char-select-header">
                  <span className="char-select-title">行をえらぶ</span>
                  <button className="char-select-close" onClick={() => setPracticeMode(null)}>✕</button>
                </div>
                <div className="row-select-grid">
                  {rowLabels.map(label => (
                    <button
                      key={label}
                      className="row-select-btn"
                      onClick={() => startPractice('row', label)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="license-footer">
          Stroke data: <a href="https://github.com/parsimonhi/animCJK" target="_blank" rel="noopener noreferrer">animCJK</a> (LGPL-3.0)
        </div>
      </div>
    )
  }

  // === Practice screen ===
  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <button className="btn btn-back" onClick={goBackToStart}>← もどる</button>
        </div>
        <div className="header-actions">
          <button className="btn btn-icon-sm" onClick={handleToggleSound} title={soundOn ? '音声オフ' : '音声オン'}>
            {soundOn ? '🔊' : '🔇'}
          </button>
          <button className="btn btn-secondary" onClick={handleReset}>クリア</button>
          {practiceMode === 'free' && (
            <button className="btn btn-primary" onClick={() => setShowSelector(true)}>
              {charMode === 'kanji' ? '一覧' : '50音'}
            </button>
          )}
        </div>
      </header>

      <div className="practice-area">
        <TracingCanvas
          key={`${charMode}-${kanjiGrade}-${resetKey}`}
          char={currentChar}
          onComplete={handleComplete}
          onStrokeComplete={handleStrokeComplete}
          onStrokeFailed={handleStrokeFailed}
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

      <div className="bottom-controls">
        <button className="char-nav-btn" onClick={goPrev} disabled={currentIndex === 0}>◀</button>
        <div style={{ textAlign: 'center' }}>
          <div className="current-char-display">{currentChar.char}</div>
          <div className="stroke-info">
            {currentChar.romaji ? `${currentChar.romaji} ・ ` : ''}{currentChar.strokeCount}画
            {practiceMode === 'row' && selectedRow ? ` ・ ${selectedRow}` : ''}
            {practiceMode === 'random' ? ' ・ ランダム' : ''}
            {` (${currentIndex + 1}/${chars.length})`}
          </div>
        </div>
        <button className="char-nav-btn" onClick={goNext} disabled={currentIndex === chars.length - 1}>▶</button>
      </div>

      <div className="license-footer">
        Stroke data: <a href="https://github.com/parsimonhi/animCJK" target="_blank" rel="noopener noreferrer">animCJK</a> (LGPL-3.0)
      </div>

      {showSelector && (
        <CharacterSelect
          rows={table}
          currentChar={currentChar.char}
          completedChars={completedChars}
          onSelect={handleSelectChar}
          onClose={() => setShowSelector(false)}
          gridCols={charMode === 'kanji' ? 8 : 5}
        />
      )}
    </div>
  )
}
