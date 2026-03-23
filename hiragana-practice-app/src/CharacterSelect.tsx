import { type GojuonRow, type HiraganaChar } from './hiraganaData'

interface Props {
  rows: GojuonRow[]
  currentChar: string
  completedChars: Set<string>
  onSelect: (char: HiraganaChar) => void
  onClose: () => void
  gridCols?: number
}

export function CharacterSelect({ rows, currentChar, completedChars, onSelect, onClose, gridCols = 5 }: Props) {
  return (
    <div className="char-select-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose()
    }}>
      <div className="char-select-panel">
        <div className="char-select-header">
          <span className="char-select-title">{gridCols > 5 ? '漢字一覧' : '五十音'}</span>
          <button className="char-select-close" onClick={onClose}>✕</button>
        </div>
        <div className="gojuon-grid">
          {rows.map((row, ri) => (
            <div key={ri}>
              {row.label && <div className="gojuon-row-label">{row.label}</div>}
              <div className="gojuon-row" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
                {row.chars.map((char, ci) => {
                  if (!char) {
                    return <div key={ci} className="gojuon-cell empty" />
                  }
                  const isActive = char.char === currentChar
                  const isCompleted = completedChars.has(char.char)
                  return (
                    <button
                      key={char.char}
                      className={`gojuon-cell${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}`}
                      onClick={() => onSelect(char)}
                    >
                      <span className="gojuon-cell-char">{char.char}</span>
                      {char.romaji && <span className="gojuon-cell-romaji">{char.romaji}</span>}
                      {!char.romaji && <span className="gojuon-cell-romaji">{char.strokeCount}画</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
