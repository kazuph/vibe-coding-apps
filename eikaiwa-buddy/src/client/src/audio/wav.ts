export function encodeAudioBufferToWav16kMono(buffer: AudioBuffer): Blob {
  const samples = downsampleTo16kMono(buffer);
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true);
  view.setUint32(28, 16000 * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([wav], { type: "audio/wav" });
}

export function downsampleTo16kMono(buffer: AudioBuffer): Float32Array {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const mono = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    mono[i] = channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length;
  }
  if (buffer.sampleRate === 16000) return mono;
  const ratio = buffer.sampleRate / 16000;
  const length = Math.floor(mono.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), mono.length);
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += mono[j];
    output[i] = sum / Math.max(1, end - start);
  }
  return output;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
}
