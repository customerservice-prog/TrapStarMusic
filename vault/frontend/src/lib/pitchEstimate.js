/**
 * Lightweight pitch contour for Flex Pitch-style display (YIN-inspired windowed autocorrelation).
 * Returns semitones relative to ~middle C band for visualization (not a tuner replacement).
 */
export function estimatePitchContour(audioBuffer, opts = {}) {
  const ch = audioBuffer.numberOfChannels > 0 ? audioBuffer.getChannelData(0) : null;
  if (!ch || ch.length < 512) return { times: [], semitones: [] };

  const sampleRate = audioBuffer.sampleRate;
  const hop = opts.hopSamples ?? Math.floor(sampleRate * 0.02);
  const win = opts.windowSamples ?? Math.floor(sampleRate * 0.05);
  const minF = opts.minHz ?? 80;
  const maxF = opts.maxHz ?? 800;
  const minLag = Math.floor(sampleRate / maxF);
  const maxLag = Math.floor(sampleRate / minF);

  const times = [];
  const semitones = [];
  const refHz = 261.63;

  for (let start = 0; start + win < ch.length; start += hop) {
    let bestLag = 0;
    let bestCorr = 0;
    for (let lag = minLag; lag <= maxLag && lag < win / 2; lag++) {
      let sum = 0;
      let n = 0;
      for (let i = 0; i < win - lag; i++) {
        const a = ch[start + i];
        const b = ch[start + i + lag];
        sum += a * b;
        n++;
      }
      const c = n > 0 ? sum / n : 0;
      if (c > bestCorr) {
        bestCorr = c;
        bestLag = lag;
      }
    }
    if (bestLag < minLag || bestCorr < 0.0008) {
      times.push(start / sampleRate);
      semitones.push(null);
      continue;
    }
    const hz = sampleRate / bestLag;
    const st = 12 * Math.log2(hz / refHz);
    times.push(start / sampleRate);
    semitones.push(Number.isFinite(st) ? st : null);
  }

  return { times, semitones };
}

export function smoothContour(semitones, window = 3) {
  const out = [];
  const w = Math.max(1, Math.floor(window / 2));
  for (let i = 0; i < semitones.length; i++) {
    const slice = [];
    for (let j = -w; j <= w; j++) {
      const v = semitones[i + j];
      if (v != null && Number.isFinite(v)) slice.push(v);
    }
    out.push(slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null);
  }
  return out;
}
