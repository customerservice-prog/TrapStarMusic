import { useEffect, useRef, useCallback, useMemo, useState } from 'react';

const NUM_BARS = 100;

function computeBarHeights(buffer) {
  if (!buffer) return null;
  const ch = buffer.getChannelData(0);
  const n = NUM_BARS;
  const step = Math.floor(ch.length / n);
  const heights = [];
  for (let i = 0; i < n; i++) {
    let max = 0;
    const start = i * step;
    const end = Math.min(ch.length, start + step);
    for (let j = start; j < end; j++) {
      const v = Math.abs(ch[j]);
      if (v > max) max = v;
    }
    heights.push(max);
  }
  return heights;
}

function pseudoHeights(bpm, duration) {
  const n = NUM_BARS;
  const beatSec = bpm > 0 ? 60 / bpm : 0.4;
  const beats = duration > 0 ? duration / beatSec : 16;
  const h = [];
  for (let i = 0; i < n; i++) {
    const phase = (i / n) * beats * Math.PI * 2;
    const noise = Math.sin(i * 12.9898 + duration * 78.233) * 0.5 + 0.5;
    const env = 0.22 + Math.sin(phase * 0.7) * 0.14 + noise * 0.32;
    const spike = i % Math.max(1, Math.floor(n / Math.max(1, beats))) < 2 ? 0.32 : 0;
    h.push(Math.min(1, env + spike));
  }
  return h;
}

export default function WaveformDisplay({
  audioBuffer,
  currentTime = 0,
  duration = 0,
  bpm = 140,
  onSeek,
  punchMode,
  punchRange,
  onWaveClick,
  barHeight = 54,
  /** Smooth playhead while beat plays without parent re-rendering every frame */
  liveClock = false,
  getPlaybackTime,
  /** Waveform / playhead accent (default: theme gold) */
  accent,
  className = '',
  variant = 'default',
}) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [, setTick] = useState(0);
  const [liveT, setLiveT] = useState(currentTime);
  const timeFnRef = useRef(getPlaybackTime);
  timeFnRef.current = getPlaybackTime;

  useEffect(() => {
    if (!liveClock) setLiveT(currentTime);
  }, [currentTime, liveClock]);

  useEffect(() => {
    if (!liveClock) return;
    let id;
    const tick = () => {
      let t = 0;
      try {
        t = timeFnRef.current?.() ?? 0;
      } catch {
        t = 0;
      }
      setLiveT(t);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [liveClock]);

  const heights = useMemo(() => {
    const bpmVal = bpm || 140;
    const dur = duration || 1;
    if (audioBuffer) {
      return computeBarHeights(audioBuffer) || pseudoHeights(bpmVal, dur);
    }
    return pseudoHeights(bpmVal, dur);
  }, [audioBuffer, bpm, duration]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const lw = canvas.clientWidth;
    const lh = canvas.clientHeight;
    if (lw < 2 || lh < 2) return;

    const root = getComputedStyle(document.documentElement);
    const bg3 = root.getPropertyValue('--bg3').trim() || '#161619';
    const gold = accent || root.getPropertyValue('--gold').trim() || '#c9a84c';

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bg3;
    ctx.fillRect(0, 0, lw, lh);

    const dur = duration || 1;
    const t = liveClock ? liveT : currentTime;
    const playRatio = Math.min(1, Math.max(0, t / dur));
    const playX = playRatio * lw;

    if (punchRange?.start != null && punchRange?.end != null) {
      const x1 = (punchRange.start / dur) * lw;
      const x2 = (punchRange.end / dur) * lw;
      ctx.fillStyle = `${gold}28`;
      ctx.fillRect(x1, 0, Math.max(2, x2 - x1), lh);
      ctx.strokeStyle = gold;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, 0.5, Math.max(2, x2 - x1), lh - 1);
    }

    const mid = lh / 2;
    const barW = lw / NUM_BARS;
    const maxBarHalf = (mid - 4) * 0.92;

    for (let i = 0; i < NUM_BARS; i++) {
      const amp = heights[i] ?? 0.15;
      const bh = amp * maxBarHalf;
      const x = i * barW;
      const barPx = Math.max(1, barW * 0.72);
      const centerX = x + barW / 2 - barPx / 2;
      const beforePlay = x + barW / 2 < playX;
      const alphaTop = beforePlay ? 0.9 : 0.25;
      const alphaBot = beforePlay ? 0.45 : 0.12;

      ctx.fillStyle = hexToRgba(gold, alphaTop);
      ctx.fillRect(centerX, mid - bh, barPx, bh);
      ctx.fillStyle = hexToRgba(gold, alphaBot);
      ctx.fillRect(centerX, mid, barPx, bh);
    }

    ctx.shadowColor = gold;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, lh);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [accent, currentTime, duration, punchRange, heights, liveClock, liveT]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssH = Math.max(28, barHeight);
      canvas.width = Math.max(200, rect.width) * dpr;
      canvas.height = cssH * dpr;
      canvas.style.height = `${cssH}px`;
      canvas.style.width = '100%';
      setTick((x) => x + 1);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [barHeight]);

  useEffect(() => {
    draw();
  }, [draw]);

  const click = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const t = ratio * (duration || 0);
    if (onWaveClick) onWaveClick(t);
    else if (onSeek) onSeek(t);
  };

  const rf = variant === 'rf';

  return (
    <div
      ref={wrapRef}
      className={`waveform-wrap-spec ${rf ? 'waveform-wrap-spec--rf ' : ''}${className}`.trim()}
      style={{
        borderRadius: rf ? 16 : 8,
        border: rf ? '1px solid rgba(201, 168, 76, 0.2)' : '1px solid var(--border)',
        overflow: 'hidden',
        cursor: 'pointer',
        boxShadow: rf ? 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.25)' : undefined,
      }}
      onClick={click}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%' }} />
    </div>
  );
}

function hexToRgba(hex, a) {
  if (!hex.startsWith('#')) return `rgba(201,168,76,${a})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
