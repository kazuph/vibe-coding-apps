// Character metadata for hiragana, katakana, and kanji
// Stroke data comes from animCJK (see data/)

import { hiraganaStrokeData } from './data/hiraganaStrokes'
import { kanjiGrade1Data } from './data/kanjiGrade1'
import { kanjiGrade2Data } from './data/kanjiGrade2'
import { kanjiGrade3Data } from './data/kanjiGrade3'
import { kanjiGrade4Data } from './data/kanjiGrade4'
import { kanjiGrade5Data } from './data/kanjiGrade5'
import { kanjiGrade6Data } from './data/kanjiGrade6'
import { GRADE_1, GRADE_2, GRADE_3, GRADE_4, GRADE_5, GRADE_6, GRADE_LABELS, type GradeIndex } from './data/kanjiGrades'
import { kanjiReadings } from './data/kanjiReadings'
import type { StrokeData } from './data/hiraganaStrokes'

export type { GradeIndex }
export { GRADE_LABELS }

export interface HiraganaChar {
  char: string
  romaji: string
  strokeCount: number
  strokes: number[][][]
}

export interface GojuonRow {
  label: string
  chars: (HiraganaChar | null)[]
}

export type CharMode = 'hiragana' | 'katakana' | 'kanji'

const kanjiDataByGrade: Record<string, StrokeData>[] = [
  kanjiGrade1Data,
  kanjiGrade2Data,
  kanjiGrade3Data,
  kanjiGrade4Data,
  kanjiGrade5Data,
  kanjiGrade6Data,
]

function createChar(char: string, romaji: string): HiraganaChar {
  const data = hiraganaStrokeData[char]
  const strokeCount = data ? data.strokes.length : 1
  const strokes = data
    ? data.strokes.map(s => s.median.map(([x, y]) => [x / 1024, y / 1024]))
    : [[[0.5, 0.5]]]
  return { char, romaji, strokeCount, strokes }
}

function createKanjiChar(char: string, gradeData: Record<string, StrokeData>): HiraganaChar {
  const data = gradeData[char]
  const strokeCount = data ? data.strokes.length : 1
  const strokes = data
    ? data.strokes.map(s => s.median.map(([x, y]) => [x / 1024, y / 1024]))
    : [[[0.5, 0.5]]]
  return { char, romaji: kanjiReadings[char] || '', strokeCount, strokes }
}

// Hiragana 50-on table
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

// Hiragana dakuon/handakuon
export const dakuonTable: GojuonRow[] = [
  { label: '濁音', chars: [createChar('が', 'ga'), createChar('ぎ', 'gi'), createChar('ぐ', 'gu'), createChar('げ', 'ge'), createChar('ご', 'go')] },
  { label: '', chars: [createChar('ざ', 'za'), createChar('じ', 'ji'), createChar('ず', 'zu'), createChar('ぜ', 'ze'), createChar('ぞ', 'zo')] },
  { label: '', chars: [createChar('だ', 'da'), createChar('ぢ', 'di'), createChar('づ', 'du'), createChar('で', 'de'), createChar('ど', 'do')] },
  { label: '', chars: [createChar('ば', 'ba'), createChar('び', 'bi'), createChar('ぶ', 'bu'), createChar('べ', 'be'), createChar('ぼ', 'bo')] },
  { label: '半濁音', chars: [createChar('ぱ', 'pa'), createChar('ぴ', 'pi'), createChar('ぷ', 'pu'), createChar('ぺ', 'pe'), createChar('ぽ', 'po')] },
]

// Katakana 50-on table
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

// Katakana dakuon/handakuon
export const katakanaDakuonTable: GojuonRow[] = [
  { label: '濁音', chars: [createChar('ガ', 'ga'), createChar('ギ', 'gi'), createChar('グ', 'gu'), createChar('ゲ', 'ge'), createChar('ゴ', 'go')] },
  { label: '', chars: [createChar('ザ', 'za'), createChar('ジ', 'ji'), createChar('ズ', 'zu'), createChar('ゼ', 'ze'), createChar('ゾ', 'zo')] },
  { label: '', chars: [createChar('ダ', 'da'), createChar('ヂ', 'di'), createChar('ヅ', 'du'), createChar('デ', 'de'), createChar('ド', 'do')] },
  { label: '', chars: [createChar('バ', 'ba'), createChar('ビ', 'bi'), createChar('ブ', 'bu'), createChar('ベ', 'be'), createChar('ボ', 'bo')] },
  { label: '半濁音', chars: [createChar('パ', 'pa'), createChar('ピ', 'pi'), createChar('プ', 'pu'), createChar('ペ', 'pe'), createChar('ポ', 'po')] },
]

// Build kanji grid for a given grade (8 columns)
const KANJI_GRID_COLS = 8

function buildKanjiGrid(gradeStr: string, gradeData: Record<string, StrokeData>): GojuonRow[] {
  const chars = [...new Set(gradeStr)]
  const rows: GojuonRow[] = []
  for (let i = 0; i < chars.length; i += KANJI_GRID_COLS) {
    const chunk = chars.slice(i, i + KANJI_GRID_COLS)
    const rowChars: (HiraganaChar | null)[] = chunk.map(c => createKanjiChar(c, gradeData))
    // Pad to KANJI_GRID_COLS
    while (rowChars.length < KANJI_GRID_COLS) rowChars.push(null)
    rows.push({ label: i === 0 ? '' : '', chars: rowChars })
  }
  return rows
}

const gradeStrings = [GRADE_1, GRADE_2, GRADE_3, GRADE_4, GRADE_5, GRADE_6]

export function getKanjiTable(grade: GradeIndex): GojuonRow[] {
  return buildKanjiGrid(gradeStrings[grade], kanjiDataByGrade[grade])
}

export function getKanjiChars(grade: GradeIndex): HiraganaChar[] {
  const chars = [...new Set(gradeStrings[grade])]
  return chars.map(c => createKanjiChar(c, kanjiDataByGrade[grade]))
}

function tableToChars(table: GojuonRow[]): HiraganaChar[] {
  return table.flatMap(row => row.chars).filter((c): c is HiraganaChar => c !== null)
}

export const allHiragana: HiraganaChar[] = [...tableToChars(gojuonTable), ...tableToChars(dakuonTable)]
export const allKatakana: HiraganaChar[] = [...tableToChars(katakanaGojuonTable), ...tableToChars(katakanaDakuonTable)]
export const allChars = allHiragana
