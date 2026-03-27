import { useState, useCallback, useEffect } from 'react'
import { type Locale, type TranslationKeys, translations, detectLocale } from '../i18n'

export function useLocale() {
  const [locale, setLocaleState] = useState<Locale>(detectLocale)

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    localStorage.setItem('wakuwaku-locale', l)
    document.documentElement.lang = l
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const t: TranslationKeys = translations[locale]
  const isJa = locale === 'ja'

  return { locale, setLocale, t, isJa }
}
