import { trackTypeLabel } from '../lib/layerPalette.js';

/**
 * Compact channel strips — visual studio credibility without full DAW complexity.
 */
export default function StudioMixerStrip({
  tracks,
  session,
  soloTrackId,
  onSolo,
  onPatchTrack,
  playingMap,
}) {
  const beatLoaded = !!(session?.beat_filename || session?.beat_label);

  return (
    <section className="rf-mixer glass-panel" aria-label="Mixer overview">
      <div className="rf-mixer__head">
        <span className="rf-mixer__title">Console</span>
        <span className="rf-mixer__hint">Mute / solo · levels follow your layers</span>
      </div>
      <div className="rf-mixer__strips">
        <div className={`rf-strip rf-strip--beat ${!beatLoaded ? 'rf-strip--dim' : ''}`}>
          <div className="rf-strip__label">Beat</div>
          <div className="rf-strip__meter" aria-hidden>
            <span className="rf-strip__meter-fill" style={{ height: beatLoaded ? '72%' : '12%' }} />
          </div>
          <div className="rf-strip__tag">{beatLoaded ? 'Loaded' : 'Empty'}</div>
        </div>
        {tracks.map((t) => {
          const muted = !!t.muted;
          const solo = soloTrackId === t.id;
          const playing = !!playingMap[t.id];
          const vol = t.volume != null ? Math.min(1, Math.max(0, Number(t.volume))) : 1;
          return (
            <div key={t.id} className={`rf-strip ${playing ? 'rf-strip--active' : ''}`}>
              <div className="rf-strip__label">{trackTypeLabel(t.track_type)}</div>
              <div className="rf-strip__meter" aria-hidden>
                <span
                  className="rf-strip__meter-fill"
                  style={{ height: `${Math.round((playing ? 55 : 18) + vol * 40)}%` }}
                />
              </div>
              <div className="rf-strip__controls">
                <button
                  type="button"
                  className={`rf-strip__btn ${muted ? 'is-on' : ''}`}
                  onClick={() => onPatchTrack(t.id, { muted: !muted })}
                >
                  M
                </button>
                <button
                  type="button"
                  className={`rf-strip__btn ${solo ? 'is-solo' : ''}`}
                  onClick={() => onSolo(solo ? null : t.id)}
                >
                  S
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
