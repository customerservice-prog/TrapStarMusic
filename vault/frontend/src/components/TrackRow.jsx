import { useRef, useState, useEffect } from 'react';
import * as api from '../lib/api.js';

const TYPE_COLOR = {
  main: 'var(--gold)',
  double: 'var(--blue)',
  adlib: 'var(--green)',
  harmony: 'var(--purple)',
};

function MiniBars({ color, active, energy }) {
  const ref = useRef(null);

  useEffect(() => {
    let frame;
    const draw = () => {
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      const w = 70;
      const h = 26;
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      const bars = 14;
      const base = energy != null ? Math.min(1, Number(energy) * 4) : 0.35;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg5').trim() || '#222228';
      ctx.fillRect(0, 0, w, h);
      const t = active ? Date.now() / 200 : 0;
      for (let i = 0; i < bars; i++) {
        const v = base * (0.4 + Math.sin(i * 0.7 + t) * 0.35 + 0.25);
        const bh = Math.max(2, v * h * 0.85);
        ctx.fillStyle = color;
        ctx.globalAlpha = active ? 0.95 : 0.45;
        ctx.fillRect(4 + i * 4.5, h - bh - 2, 3, bh);
      }
      ctx.globalAlpha = 1;
      if (active) frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [color, active, energy]);

  return <canvas ref={ref} style={{ width: 70, height: 26, borderRadius: 4, display: 'block' }} />;
}

export default function TrackRow({
  track,
  selected,
  onSelect,
  onDelete,
  onComp,
  isPlaying,
  onPlayToggle,
  onPatch,
  soloTrackId,
  onSolo,
  recordArmed = false,
  className = '',
}) {
  const takes = track.takes || [];
  const activeId = track.active_take_id;
  const [compOpen, setCompOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const vol = track.volume != null ? Math.round(Number(track.volume) * 100) : 100;
  const muted = !!track.muted;
  const solo = soloTrackId === track.id;
  const color = TYPE_COLOR[track.track_type] || TYPE_COLOR.main;
  const take = takes.find((t) => t.id === activeId);
  const energy = take?.energy_score;

  const labelBadges = ['cleaned', 'tuned', 'leveled', 'mix-ready'];
  if (track.track_type === 'double') labelBadges.push('stacked');
  if (track.track_type === 'adlib') labelBadges.push('widened');
  if (track.track_type === 'harmony') labelBadges.push('harmony');

  return (
    <>
      <div
        className={`track-row-root ${className}`.trim()}
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => e.key === 'Enter' && onSelect()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        data-selected={selected ? 'true' : undefined}
        data-record-armed={recordArmed ? 'true' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--bg3)',
          border: `1px solid ${selected ? `${color}44` : 'var(--border)'}`,
          borderRadius: 8,
          padding: '8px 10px',
          marginBottom: compOpen ? 0 : 5,
          cursor: 'pointer',
          opacity: muted ? 0.45 : 1,
          transition: 'all 180ms ease',
        }}
      >
        <div
          style={{
            width: 3,
            height: 36,
            borderRadius: 2,
            background: color,
            opacity: selected ? 1 : 0.75,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {recordArmed && (
              <span className="track-row-arm-badge" title="Focused lane — levels, solo, and comping">
                R
              </span>
            )}
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {track.label || 'Vocal'}
          </div>
          </div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text3)' }}>
            {track.track_type} · {takes.length ? 'recorded' : 'empty'}
          </div>
          <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {labelBadges.map((b) => (
              <span
                key={b}
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: '1px solid var(--border)',
                  color: 'var(--text3)',
                }}
              >
                {b}
              </span>
            ))}
          </div>
        </div>
        <div className="track-row-mini-wave">
          <MiniBars color={color} active={isPlaying} energy={energy} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost track-row-dl"
            title="Download active take"
            style={{
              width: 22,
              height: 22,
              padding: 0,
              fontSize: 10,
              borderRadius: 4,
              color: 'var(--text3)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!activeId) return;
              const ext = take?.mime?.includes('wav') ? '.wav' : '.webm';
              api.triggerBrowserDownload(api.trackAudioUrl(track.id), `${(track.label || 'take').replace(/\s+/g, '_')}${ext}`);
            }}
            disabled={!activeId}
          >
            ⬇
          </button>
          <button
            type="button"
            className="btn btn-ghost track-row-solo"
            title={solo ? 'Clear solo' : 'Solo this layer'}
            style={{
              width: 22,
              height: 22,
              padding: 0,
              fontSize: 9,
              fontWeight: 700,
              borderRadius: 4,
              background: solo ? 'var(--gold-dim)' : 'transparent',
              color: solo ? 'var(--gold2)' : 'var(--text4)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSolo?.(solo ? null : track.id);
            }}
          >
            S
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              width: 22,
              height: 22,
              padding: 0,
              fontSize: 10,
              borderRadius: 4,
              background: muted ? 'var(--red-dim)' : 'transparent',
              color: muted ? 'var(--red)' : 'var(--text3)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onPatch({ muted: !muted });
            }}
          >
            M
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              width: 22,
              height: 22,
              padding: 0,
              fontSize: 10,
              borderRadius: 4,
              color: isPlaying ? 'var(--gold2)' : 'var(--text3)',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onPlayToggle(track);
            }}
          >
            ▶
          </button>
          {hover && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: 22, height: 22, padding: 0, fontSize: 10, borderRadius: 4, color: 'var(--red)' }}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(track.id);
              }}
            >
              ✕
            </button>
          )}
        </div>
        <div className="track-row-vol" style={{ width: 52 }} onClick={(e) => e.stopPropagation()}>
          <input
            type="range"
            className="range-spec"
            min={0}
            max={100}
            value={vol}
            onChange={(e) => onPatch({ volume: Number(e.target.value) / 100 })}
            style={{ marginTop: 0 }}
          />
          <div className="mono" style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center' }}>
            {vol}
          </div>
        </div>
        {takes.length > 1 && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: 10, padding: '4px 6px' }}
            onClick={(e) => {
              e.stopPropagation();
              setCompOpen((v) => !v);
            }}
          >
            Comp
          </button>
        )}
      </div>
      {compOpen && takes.length > 1 && (
        <div className="card-spec" style={{ padding: 10, marginBottom: 5, marginTop: -2 }}>
          {takes.map((tk) => (
            <CompTakeRow key={tk.id} trackId={track.id} take={tk} active={tk.id === activeId} onPick={onComp} />
          ))}
          <button type="button" className="btn btn-primary" style={{ marginTop: 8, width: '100%', fontSize: 11 }} onClick={() => onComp(track.id, 'smart')}>
            Smart Comp
          </button>
        </div>
      )}
    </>
  );
}

function CompTakeRow({ trackId, take, active, onPick }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.src = api.takeAudioUrl(trackId, take.id);
      a.play().catch(() => {});
      setPlaying(true);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <audio ref={audioRef} style={{ display: 'none' }} crossOrigin="anonymous" onEnded={() => setPlaying(false)} />
      <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={toggle}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <span className="mono" style={{ flex: 1, fontSize: 10 }}>
        {take.id.slice(0, 6)}… {active ? '· active' : ''}
      </span>
      {!active && (
        <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => onPick(trackId, take.id)}>
          Make active
        </button>
      )}
    </div>
  );
}
