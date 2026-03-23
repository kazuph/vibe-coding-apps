/**
 * useSpeech.ts
 * SpeechSynthesis API wrapper for character reading
 */

let speechEnabled = true

export function speak(text: string, rate = 0.8) {
  if (!speechEnabled || !window.speechSynthesis) return

  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  u.rate = rate
  u.pitch = 1.1
  u.volume = 1.0

  // Try to pick a Japanese voice
  const voices = window.speechSynthesis.getVoices()
  const jaVoice = voices.find(v => v.lang.startsWith('ja'))
  if (jaVoice) u.voice = jaVoice

  window.speechSynthesis.speak(u)
}

export function speakChar(char: string) {
  speak(char, 0.7)
}

export function speakPraise() {
  const phrases = ['じょうず！', 'すごい！', 'できたね！', 'やったね！', 'かんぺき！']
  const phrase = phrases[Math.floor(Math.random() * phrases.length)]
  // Small delay so char reading finishes first
  setTimeout(() => speak(phrase, 0.9), 600)
}

export function toggleSpeech(): boolean {
  speechEnabled = !speechEnabled
  return speechEnabled
}

export function isSpeechEnabled(): boolean {
  return speechEnabled
}
