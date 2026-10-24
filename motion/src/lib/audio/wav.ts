/** 16-bit PCM WAV; a mono buffer is written into every channel. Remotion's audio tag plays it from public/generated. */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number,
  channels = 2,
): Uint8Array {
  const blockAlign = channels * 2;
  const dataBytes = samples.length * blockAlign;
  const out = new Uint8Array(44 + dataBytes);
  const v = new DataView(out.buffer);
  const ascii = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) out[offset + i] = s.charCodeAt(i);
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, dataBytes, true);
  samples.forEach((s, i) => {
    const pcm = Math.round(Math.max(-1, Math.min(1, s)) * 32767);
    for (let c = 0; c < channels; c++)
      v.setInt16(44 + (i * channels + c) * 2, pcm, true);
  });
  return out;
}
