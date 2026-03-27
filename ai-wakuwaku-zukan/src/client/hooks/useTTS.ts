import { useState, useCallback, useEffect, useRef } from 'react'
import type { Locale } from '../i18n'

export type TTSSpeed = 'slow' | 'normal' | 'fast'

const speedRates: Record<TTSSpeed, number> = {
  slow: 0.6,
  normal: 1.0,
  fast: 1.4,
}

function findVoice(voices: SpeechSynthesisVoice[], langCode: string): SpeechSynthesisVoice | undefined {
  // Exact match first (e.g. "ja-JP")
  const exact = voices.find(v => v.lang === langCode)
  if (exact) return exact
  // Prefix match (e.g. "ja" matches "ja-JP")
  const prefix = langCode.split('-')[0]
  return voices.find(v => v.lang.startsWith(prefix))
}

export function useTTS(locale: Locale) {
  const [speed, setSpeed] = useState<TTSSpeed>('normal')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const synthRef = useRef<SpeechSynthesis | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    const synth = window.speechSynthesis
    synthRef.current = synth
    setIsSupported(true)

    const loadVoices = () => {
      const available = synth.getVoices()
      if (available.length > 0) {
        setVoices(available)
      }
    }

    // Voices may already be loaded (Safari) or load async (Chrome)
    loadVoices()
    synth.addEventListener('voiceschanged', loadVoices)
    return () => synth.removeEventListener('voiceschanged', loadVoices)
  }, [])

  const speak = useCallback((text: string, lang?: string) => {
    const synth = synthRef.current
    if (!synth || !text) return

    synth.cancel()

    const targetLang = lang ?? (locale === 'ja' ? 'ja-JP' : 'en-US')
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = targetLang
    utterance.rate = speedRates[speed]

    // Explicitly set voice — without this, Japanese silently fails on many browsers
    const voice = findVoice(voices, targetLang)
    if (voice) {
      utterance.voice = voice
    }

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    // Chrome bug workaround: small delay after cancel() before speak()
    setTimeout(() => synth.speak(utterance), 50)
  }, [locale, speed, voices])

  const stop = useCallback(() => {
    synthRef.current?.cancel()
    setIsSpeaking(false)
  }, [])

  return { speak, stop, isSpeaking, isSupported, speed, setSpeed }
}
