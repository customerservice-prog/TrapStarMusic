import { Link } from 'react-router-dom';
import FeedbackCard from './FeedbackCard.jsx';
import { VAULT_VOCAL_STYLES, VAULT_POLISH, VAULT_SPACE, inferVaultSelection } from '../lib/vaultSmartMaps.js';

function WordRow({ title, options, activeId, onPick }) {
  return (
    <div className="vault-engine-row">
      <div className="vault-engine-row__title">{title}</div>
      <div className="vault-engine-row__chips" role="list">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="listitem"
            className={`vault-chip ${activeId === o.id ? 'vault-chip--active' : ''}`}
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
      <div className="vault-trust vault-trust--idle">
        <span className="vault-trust__hint">Record a take — the Smart Engine handles the rest.</span>
      </div>
    );
  }
  const items = ['Cleaned', 'Tuned', 'Leveled', 'Mixed'];
  return (
    <div className="vault-trust" aria-label="Processing status">
      {items.map((label) => (
        <span key={label} className="vault-trust__badge">
          {label}
        </span>
      ))}
    </div>
  );
}

export default function VaultSmartEngine({
  sessionId,
  sessionName,
  vocalMode,
  setVocalMode,
  vibe,
  setVibe,
  lastFeedback,
  setLastFeedback,
  selectedTrack,
}) {
  const inferred = inferVaultSelection(vocalMode, vibe);

  const applyStyle = (o) => {
    setVocalMode(o.vocalMode);
    setVibe(o.vibe);
  };

  const applyPolish = (o) => setVibe(o.vibe);

  const applySpace = (o) => setVibe(o.vibe);

  return (
    <aside className="vault-engine glass-panel" aria-label="Smart Engine">
      <div className="vault-engine__head">
        <h2 className="vault-engine__title">Smart Engine</h2>
        <p className="vault-engine__sub">Plain language — no mixer, no plugin names.</p>
      </div>

      <WordRow
        title="Vocal mode"
        options={VAULT_VOCAL_STYLES}
        activeId={inferred.style}
        onPick={applyStyle}
      />
      <WordRow
        title="Polish level"
        options={VAULT_POLISH}
        activeId={inferred.polish}
        onPick={applyPolish}
      />
      <WordRow
        title="Space"
        options={VAULT_SPACE}
        activeId={inferred.space}
        onPick={applySpace}
      />

      <div className="vault-engine__section">
        <div className="vault-engine-row__title">Process</div>
        <TrustBadges track={selectedTrack} />
      </div>

      <FeedbackCard
        grade={lastFeedback?.grade || selectedTrack?.feedback_grade}
        detail={lastFeedback?.detail || selectedTrack?.feedback_text}
        onDismiss={() => setLastFeedback(null)}
      />

      {sessionId && (
        <Link to={`/export/${sessionId}`} className="vault-engine__export btn btn-primary">
          Export session
        </Link>
      )}

      {sessionName && <p className="vault-engine__session">{sessionName}</p>}
    </aside>
  );
}
