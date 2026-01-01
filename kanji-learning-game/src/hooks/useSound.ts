// Web Audio APIで効果音を生成
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// 正解音（ピンポン!! - 速くて明るい2音）
export function playCorrectSound(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // 1音目「ピン」- 高くて短い
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = 1047; // C6
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc1.start(now);
    osc1.stop(now + 0.08);

    // 2音目「ポン」- さらに高くて短い（すぐ続く）
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = 1319; // E6
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.4, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.18);
  } catch (e) {
    console.warn('Sound playback failed:', e);
  }
}

// 不正解音（低いブザー音）
export function playIncorrectSound(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 200; // 低い音
    osc.type = 'square';
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.setValueAtTime(0.01, now + 0.3);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch (e) {
    console.warn('Sound playback failed:', e);
  }
}

// AudioContextを起動（ユーザー操作時に呼ぶ）
export function initSound(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
  } catch (e) {
    console.warn('AudioContext init failed:', e);
  }
}
