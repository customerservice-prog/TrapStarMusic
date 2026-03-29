function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function audioBufferToWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const length = buffer.length * numCh * 2 + 44;
  const out = new ArrayBuffer(length);
  const view = new DataView(out);
  const sampleRate = buffer.sampleRate;

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + buffer.length * numCh * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, buffer.length * numCh * 2, true);

  const chData = [];
  for (let c = 0; c < numCh; c++) chData.push(buffer.getChannelData(c));

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, chData[c][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

/**
 * Linear in/out fades at clip edges (e.g. punch-in boundaries) to reduce clicks.
 * Slightly longer fades sound more natural on vocal punches.
 */
export async function applyEdgeFadesToBlob(blob, fadeSec = 0.05) {
  const ctx = new AudioContext();
  let buf;
  try {
    buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    await ctx.close();
    return blob;
  }
  const ch = buf.numberOfChannels;
  const rate = buf.sampleRate;
  const nFade = Math.min(Math.floor(fadeSec * rate), Math.floor(buf.length / 2));
  const copy = ctx.createBuffer(ch, buf.length, rate);
  for (let c = 0; c < ch; c++) {
    const src = buf.getChannelData(c);
    const dst = copy.getChannelData(c);
    dst.set(src);
    for (let i = 0; i < nFade; i++) {
      const g = i / nFade;
      dst[i] *= g;
      dst[buf.length - 1 - i] *= g;
    }
  }
  await ctx.close();
  return audioBufferToWav(copy);
}
