import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Mixcraft / Logic-style bar ruler with playhead; click seeks the beat timeline.
 */
export default function ArrangementRuler({
  duration = 1,
  bpm = 140,
  currentTime = 0,
  liveClock = false,
  getPlaybackTime,
  onSeek,
  variant = 'default',
}) {
  const ref = useRef(null);
  const timeFnRef = useRef(getPlaybackTime);
  timeFnRef.current = getPlaybackTime;
  const [liveT, setLiveT] = useState(currentTime);

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

  const barSec = useMemo(() => (60 / Math.max(72, Number(bpm) || 140)) * 4, [bpm]);
  const dur = Math.max(0.01, duration || 1);
  const totalBars = Math.max(1, Math.ceil(dur / barSec));

  const t = liveClock ? liveT : currentTime;
  const playPct = Math.min(100, Math.max(0, (t / dur) * 100));

  const click = useCallback(
    (e) => {
      const el = ref.current;
      if (!el || !onSeek) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const ratio = Math.max(0, Math.min(1, x / r.width));
      onSeek(ratio * dur);
    },
    [dur, onSeek]
  );

  const labelBars = useMemo(() => {
    const out = [];
    for (let n = 1; n <= totalBars; n++) {
      if (n === 1 || (n - 1) % 4 === 0) out.push(n);
    }
    return out;
  }, [totalBars]);

  const vault = variant === 'vault';

  return (
    <div
      ref={ref}
      className={`arrangement-ruler${vault ? ' arrangement-ruler--vault' : ''}`}
      style={vault ? { position: 'relative' } : undefined}
      onClick={click}
      role="presentation"
      aria-hidden
    >
      {!vault && (
        <div
          className="arrangement-ruler__grid"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent calc(${100 / totalBars}% - 1px), var(--daw-ruler-line) calc(${100 / totalBars}% - 1px), var(--daw-ruler-line) calc(${100 / totalBars}%))`,
          }}
        />
      )}
      {vault && <div className="arrangement-ruler__vault-glow" />}
      {!vault && (
        <div className="arrangement-ruler__labels">
          {labelBars.map((n) => (
            <span
              key={n}
              className="arrangement-ruler__num mono"
              style={{ left: `${((n - 0.5) / totalBars) * 100}%` }}
            >
              {n}
            </span>
          ))}
        </div>
      )}
      <div className={`arrangement-ruler__playhead${vault ? ' arrangement-ruler__playhead--vault' : ''}`} style={{ left: `${playPct}%` }} />
    </div>
  );
}
