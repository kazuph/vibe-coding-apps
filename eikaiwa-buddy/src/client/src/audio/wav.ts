import { downsamplePcmTo16kMono, encodePcmToWav16kMono } from "../../../shared/wav";

export function encodeAudioBufferToWav16kMono(buffer: AudioBuffer): Blob {
  const samples = downsampleTo16kMono(buffer);
  const wav = encodePcmToWav16kMono(samples);
  return new Blob([wav], { type: "audio/wav" });
}

export function downsampleTo16kMono(buffer: AudioBuffer): Float32Array {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const mono = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    mono[i] = channels.reduce((sum, channel) => sum + channel[i], 0) / channels.length;
  }
  return downsamplePcmTo16kMono([mono], buffer.sampleRate);
}
