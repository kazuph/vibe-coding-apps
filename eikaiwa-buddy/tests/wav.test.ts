import { describe, expect, it } from "vitest";
import { downsamplePcmTo16kMono, encodePcmToWav16kMono } from "../src/shared/wav";

describe("WAV encoder", () => {
  it("writes a 16kHz mono PCM WAV header", () => {
    const wav = encodePcmToWav16kMono(new Float32Array([0, 0.5, -0.5]));
    const view = new DataView(wav);
    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(readAscii(view, 8, 4)).toBe("WAVE");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
  });

  it("downsamples stereo-style PCM to 16kHz mono", () => {
    const left = new Float32Array(48_000).fill(0.5);
    const right = new Float32Array(48_000).fill(-0.5);
    const mono = downsamplePcmTo16kMono([left, right], 48_000);
    expect(mono.length).toBe(16_000);
    expect(mono[0]).toBeCloseTo(0);
  });
});

function readAscii(view: DataView, offset: number, length: number): string {
  return Array.from({ length }, (_, index) => String.fromCharCode(view.getUint8(offset + index))).join("");
}
