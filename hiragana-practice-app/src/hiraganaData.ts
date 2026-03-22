// Character metadata for hiragana and katakana
// Stroke data comes from animCJK (see data/hiraganaStrokes.ts)

import { hiraganaStrokeData } from './data/hiraganaStrokes'

export interface HiraganaChar {
  char: string
  romaji: string
  strokeCount: number
  strokes: number[][][]  // placeholder for API compatibility
}

export interface GojuonRow {
  label: string
  chars: (HiraganaChar | null)[]
}

export type CharMode = 'hiragana' | 'katakana'

function createChar(char: string, romaji: string): HiraganaChar {
  const data = hiraganaStrokeData[char]
  const strokeCount = data ? data.strokes.length : 1
  const strokes = data
    ? data.strokes.map(s => s.median.map(([x, y]) => [x / 1024, y / 1024]))
    : [[[0.5, 0.5]]]
  return { char, romaji, strokeCount, strokes }
}

export const gojuonTable: GojuonRow[] = [
  { label: 'あ行', chars: [createChar('あ', 'a'), createChar('い', 'i'), createChar('う', 'u'), createChar('え', 'e'), createChar('お', 'o')] },
  { label: 'か行', chars: [createChar('か', 'ka'), createChar('き', 'ki'), createChar('く', 'ku'), createChar('け', 'ke'), createChar('こ', 'ko')] },
  { label: 'さ行', chars: [createChar('さ', 'sa'), createChar('し', 'shi'), createChar('す', 'su'), createChar('せ', 'se'), createChar('そ', 'so')] },
  { label: 'た行', chars: [createChar('た', 'ta'), createChar('ち', 'chi'), createChar('つ', 'tsu'), createChar('て', 'te'), createChar('と', 'to')] },
  { label: 'な行', chars: [createChar('な', 'na'), createChar('に', 'ni'), createChar('ぬ', 'nu'), createChar('ね', 'ne'), createChar('の', 'no')] },
  { label: 'は行', chars: [createChar('は', 'ha'), createChar('ひ', 'hi'), createChar('ふ', 'fu'), createChar('へ', 'he'), createChar('ほ', 'ho')] },
  { label: 'ま行', chars: [createChar('ま', 'ma'), createChar('み', 'mi'), createChar('む', 'mu'), createChar('め', 'me'), createChar('も', 'mo')] },
  { label: 'や行', chars: [createChar('や', 'ya'), null, createChar('ゆ', 'yu'), null, createChar('よ', 'yo')] },
  { label: 'ら行', chars: [createChar('ら', 'ra'), createChar('り', 'ri'), createChar('る', 'ru'), createChar('れ', 're'), createChar('ろ', 'ro')] },
  { label: 'わ行', chars: [createChar('わ', 'wa'), null, null, createChar('を', 'wo'), createChar('ん', 'n')] },
]

export const katakanaGojuonTable: GojuonRow[] = [
  { label: 'ア行', chars: [createChar('ア', 'a'), createChar('イ', 'i'), createChar('ウ', 'u'), createChar('エ', 'e'), createChar('オ', 'o')] },
  { label: 'カ行', chars: [createChar('カ', 'ka'), createChar('キ', 'ki'), createChar('ク', 'ku'), createChar('ケ', 'ke'), createChar('コ', 'ko')] },
  { label: 'サ行', chars: [createChar('サ', 'sa'), createChar('シ', 'shi'), createChar('ス', 'su'), createChar('セ', 'se'), createChar('ソ', 'so')] },
  { label: 'タ行', chars: [createChar('タ', 'ta'), createChar('チ', 'chi'), createChar('ツ', 'tsu'), createChar('テ', 'te'), createChar('ト', 'to')] },
  { label: 'ナ行', chars: [createChar('ナ', 'na'), createChar('ニ', 'ni'), createChar('ヌ', 'nu'), createChar('ネ', 'ne'), createChar('ノ', 'no')] },
  { label: 'ハ行', chars: [createChar('ハ', 'ha'), createChar('ヒ', 'hi'), createChar('フ', 'fu'), createChar('ヘ', 'he'), createChar('ホ', 'ho')] },
  { label: 'マ行', chars: [createChar('マ', 'ma'), createChar('ミ', 'mi'), createChar('ム', 'mu'), createChar('メ', 'me'), createChar('モ', 'mo')] },
  { label: 'ヤ行', chars: [createChar('ヤ', 'ya'), null, createChar('ユ', 'yu'), null, createChar('ヨ', 'yo')] },
  { label: 'ラ行', chars: [createChar('ラ', 'ra'), createChar('リ', 'ri'), createChar('ル', 'ru'), createChar('レ', 're'), createChar('ロ', 'ro')] },
  { label: 'ワ行', chars: [createChar('ワ', 'wa'), null, null, createChar('ヲ', 'wo'), createChar('ン', 'n')] },
]

function tableToChars(table: GojuonRow[]): HiraganaChar[] {
  return table.flatMap(row => row.chars).filter((c): c is HiraganaChar => c !== null)
}

export const allHiragana: HiraganaChar[] = tableToChars(gojuonTable)
export const allKatakana: HiraganaChar[] = tableToChars(katakanaGojuonTable)

// Default export for backward compatibility
export const allChars = allHiragana
