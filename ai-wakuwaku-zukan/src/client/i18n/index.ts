import { ja } from './ja'
import { en } from './en'

export type Locale = 'ja' | 'en'
export type TranslationKeys = typeof ja

export const translations: Record<Locale, TranslationKeys> = { ja, en }

export function detectLocale(): Locale {
  const saved = localStorage.getItem('wakuwaku-locale')
  if (saved === 'ja' || saved === 'en') return saved
  const nav = navigator.language.toLowerCase()
  return nav.startsWith('ja') ? 'ja' : 'en'
}
