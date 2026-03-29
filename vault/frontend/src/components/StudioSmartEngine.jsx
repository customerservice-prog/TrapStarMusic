import { Link } from 'react-router-dom';
import FeedbackCard from './FeedbackCard.jsx';
import {
  SMART_VOCAL_STYLES,
  SMART_POLISH_LEVELS,
  SMART_SPACE_PRESETS,
  inferSmartEngineSelection,
} from '../lib/studioSmartMaps.js';
import { suggestNextStudioMove } from '../lib/sessionProgress.js';

function WordRow({ title, options, activeId, onPick }) {
  return (
    <div className="rf-engine-row">
      <div className="rf-engine-row__title">{title}</div>
      <div className="rf-engine-row__chips" role="list">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="listitem"
            className={`rf-chip ${activeId === o.id ? 'rf-chip--active' : ''}`}
            onClick={() => onPick(o)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TrustBadges({ track }) {
  const hasTake = !!(track?.active_take_id || (track?.takes || []).length);
  if (!hasTake) {
    return (
      <div className="rf-trust rf-trust--idle">
        <span className="rf-trust__hint">
          Hit record — cleanup, level, and polish run like a producer is in the room with you.
        </span>
      </div>
    );
  }
  const items = ['Cleaned', 'Tuned', 'Leveled', 'Mixed'];
  return (
    <div className="rf-trust" aria-label="Last take processing">
      {items.map((label) => (
        <span key={label} className="rf-trust__badge">
          {label}
        </span>
      ))}
    </div>
  );
}

export default function StudioSmartEngine({
  sessionId,
  sessionName,
  vocalMode,
  setVocalMode,
  vibe,
  setVibe,
  lastFeedback,
  setLastFeedback,
  selectedTrack,
  tracks,
  /** When false, playback is dry (strip EQ only); chain still builds for new takes. */
  engineeredPlaybackOn = true,
}) {
  const inferred = inferSmartEngineSelection(vocalMode, vibe);
  const nextMove = suggestNextStudioMove(tracks, vocalMode);
  const polishOpt = SMART_POLISH_LEVELS.find((p) => p.id === inferred.polish);
  const spaceOpt = SMART_SPACE_PRESETS.find((s) => s.id === inferred.space);
  const styleOpt = SMART_VOCAL_STYLES.find((s) => s.id === inferred.style);

  const applyStyle = (o) => {
    setVocalMode(o.vocalMode);
    setVibe(o.vibe);
  };

  const applyPolish = (o) => setVibe(o.vibe);

  const applySpace = (o) => setVibe(o.vibe);

  const lastResult =
    lastFeedback?.detail ||
    selectedTrack?.feedback_text ||
    (selectedTrack?.active_take_id ? 'Lead vocal cleaned, leveled, and set forward in the beat.' : null);

  return (
    <aside className="rf-engine glass-panel" aria-label="Built-in producer">
      <div className="rf-engine__head">
        <h2 className="rf-engine__title">Smart Engine</h2>
        <p className="rf-engine__sub">Your built-in producer — booth sound without touching a DAW.</p>
      </div>

      <div className="rf-engine-producer">
        <div className="rf-engine-producer__label">Vocal profile</div>
        <p className="rf-engine-producer__text">
          {styleOpt?.label || 'Studio'} · polish: {polishOpt?.label || 'Balanced'} · space: {spaceOpt?.label || 'Light'}
        </p>
        <div className="rf-engine-producer__label">In the booth now</div>
        <p className="rf-engine-producer__text">
          Chain is listening for {(vocalMode || 'auto').replace(/_/g, ' ')} energy — tweak chips below and the next take follows.
        </p>
        <div className="rf-engine-producer__label">Suggested next move</div>
        <p className="rf-engine-producer__text">{nextMove}</p>
      </div>

      <WordRow title="Vocal mode" options={SMART_VOCAL_STYLES} activeId={inferred.style} onPick={applyStyle} />
      <WordRow title="Polish level" options={SMART_POLISH_LEVELS} activeId={inferred.polish} onPick={applyPolish} />
      <WordRow title="Space" options={SMART_SPACE_PRESETS} activeId={inferred.space} onPick={applySpace} />

      {!engineeredPlaybackOn && (
        <p className="rf-engine__playback-hint" role="status">
          Engineered playback is off — you hear raw takes plus strip EQ. Turn it on under{' '}
          <Link to="/settings">Settings → Smart sound → Engineered playback</Link>.
        </p>
      )}

      <div className="rf-engine__section">
        <div className="rf-engine-row__title">Chain status</div>
        <TrustBadges track={selectedTrack} />
      </div>

      <FeedbackCard
        grade={lastFeedback?.grade || selectedTrack?.feedback_grade}
        detail={lastFeedback?.detail || selectedTrack?.feedback_text}
        onDismiss={() => setLastFeedback(null)}
      />

      {sessionId && (
        <Link to={`/export/${sessionId}`} className="rf-engine__export btn btn-primary">
          Export mix
        </Link>
      )}

      {sessionName && <p className="rf-engine__session">{sessionName}</p>}
    </aside>
  );
}
