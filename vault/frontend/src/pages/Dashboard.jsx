import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore.jsx';
import { decisionToCopy, decisionDotClass } from '../lib/decisionCopy.js';
import { sessionProgressMeta } from '../lib/sessionProgress.js';
import BrandLogo from '../components/BrandLogo.jsx';
import { trackTypeLabel } from '../lib/layerPalette.js';

function formatSessionTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatAgo(iso) {
  if (!iso) return '';
  const t = Date.now() - new Date(iso).getTime();
  if (t < 60_000) return 'just now';
  if (t < 3_600_000) return `${Math.floor(t / 60_000)} min ago`;
  if (t < 86_400_000) return `${Math.floor(t / 3_600_000)} hr ago`;
  return formatSessionTime(iso);
}

function modeToTrackDots(count) {
  const n = Math.min(count, 8);
  const dots = [];
  for (let i = 0; i < n; i++) dots.push('gold');
  return { dots, more: count > 8 ? count - 8 : 0 };
}

export default function Dashboard() {
  const nav = useNavigate();
  const {
    sessions,
    loadSessions,
    backendOnline,
    recentDecisionsGlobal,
    loadRecentDecisionsGlobal,
    deleteSessionApi,
    patchSession,
  } = useStore();

  const [renameId, setRenameId] = useState(null);
  const [renameVal, setRenameVal] = useState('');

  useEffect(() => {
    loadSessions();
    loadRecentDecisionsGlobal();
  }, [loadSessions, loadRecentDecisionsGlobal]);

  const decisionsShow = (recentDecisionsGlobal || []).slice(0, 4);
  const hasMore = (recentDecisionsGlobal || []).length > 4;

  let lastSessionId = null;
  try {
    lastSessionId =
      localStorage.getItem('rapfactory_last_session_id') || localStorage.getItem('vault_last_session_id');
  } catch {
    /* */
  }
  const resumeSession = lastSessionId ? sessions.find((s) => s.id === lastSessionId) : null;

  const startRename = (e, s) => {
    e.stopPropagation();
    e.preventDefault();
    setRenameId(s.id);
    setRenameVal(s.name);
  };

  const commitRename = async (sessionId) => {
    const v = renameVal.trim();
    if (v) await patchSession(sessionId, { name: v });
    await loadSessions();
    setRenameId(null);
  };

  return (
    <main className="page-dash">
      <header className="rf-dash-head">
        <div className="rf-dash-head__brand">
          <BrandLogo variant="inline" className="rf-dash-logo" />
          <div>
            <h1 className="rf-dash-title">YOUR SESSIONS</h1>
            <p className="rf-dash-sub">
              {sessions.length} song{sessions.length === 1 ? '' : 's'} in progress · RAP FACTORY keeps the booth sound consistent
              across every take.
            </p>
          </div>
        </div>
        <Link to="/new" className="btn btn-primary">
          + New session
        </Link>
      </header>

      {resumeSession && (
        <div className="rf-continue-card card-spec">
          <div>
            <div className="rf-continue-label">Continue your record</div>
            <div className="rf-continue-name">{resumeSession.name}</div>
            <div className="rf-continue-progress">
              {sessionProgressMeta(resumeSession, resumeSession.track_count || 0, resumeSession.last_layer_type).hint}
            </div>
            <div className="mono rf-continue-meta">Last opened · {formatAgo(resumeSession.updated_at)}</div>
          </div>
          <div className="rf-continue-actions">
            <Link to={`/studio/${resumeSession.id}`} className="btn btn-primary">
              Open studio
            </Link>
            <Link to={`/export/${resumeSession.id}`} className="btn btn-ghost">
              Export
            </Link>
          </div>
        </div>
      )}

      <div className="grid-sessions-dash">
        <Link to="/new" className="session-new-card">
          <span className="session-new-card__icon">+</span>
          <span className="session-new-card__label">New session</span>
        </Link>

        {sessions.map((s) => {
          const progress = sessionProgressMeta(s, s.track_count || 0, s.last_layer_type);
          const { dots, more } = modeToTrackDots(s.track_count || 0);
          const lastLayer = s.last_layer_type ? trackTypeLabel(s.last_layer_type) : null;

          return (
            <div
              key={s.id}
              className="session-card-spec rf-session-card"
              role="link"
              tabIndex={0}
              onClick={() => nav(`/studio/${s.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && nav(`/studio/${s.id}`)}
            >
              <span className={`rf-session-badge rf-session-badge--${progress.stage === 'no_beat' ? 'warn' : 'ok'}`}>
                {progress.badge}
              </span>
              <button
                type="button"
                className="btn btn-ghost rf-session-delete"
                title="Delete session"
                onClick={(e) => {
                  e.stopPropagation();
                  if (
                    confirm(
                      'Delete this entire session, all tracks, and takes? This cannot be undone unless you restore from a saved version later.'
                    )
                  )
                    deleteSessionApi(s.id);
                }}
              >
                ✕
              </button>

              <div className="mono rf-session-meta-row">
                {s.bpm || '—'} BPM · {s.musical_key || '—'} · {s.genre || '—'}
              </div>

              {renameId === s.id ? (
                <div className="rf-session-rename" onClick={(e) => e.stopPropagation()}>
                  <input
                    className="input-spec"
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && commitRename(s.id)}
                    autoFocus
                  />
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => commitRename(s.id)}>
                    Save
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRenameId(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="rf-session-title">{s.name}</div>
              )}

              <div className="rf-session-subline">
                {s.track_count || 0} layers · {s.beat_label || s.beat_filename ? 'beat loaded' : 'no beat'}
                {lastLayer && ` · last: ${lastLayer}`}
              </div>
              <div className="rf-session-progress-hint">{progress.hint}</div>

              <div className="rf-session-dots">
                {dots.map((c, i) => (
                  <span
                    key={i}
                    className="rf-session-dot"
                    style={{ background: c === 'gold' ? 'var(--gold)' : 'var(--blue)' }}
                  />
                ))}
                {more > 0 && <span className="mono rf-session-more">+{more}</span>}
              </div>
              <div className="mono rf-session-time">{formatSessionTime(s.updated_at)}</div>

              <div className="rf-session-actions" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => startRename(e, s)}>
                  Rename
                </button>
                <Link to={`/export/${s.id}`} className="btn btn-ghost btn-sm">
                  Export
                </Link>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => nav(`/studio/${s.id}`)}>
                  Open
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!sessions.length && backendOnline && (
        <p className="rf-dash-empty">Your first session is one click away — start a song and drop a beat when you are ready.</p>
      )}

      <section className="card-spec rf-intel-section">
        <div className="section-label">Studio intelligence</div>
        <p className="rf-intel-intro">What the built-in producer is doing for your sound — not debug logs.</p>
        {!decisionsShow.length && (
          <p className="rf-intel-empty">Record a take to see how RAP FACTORY shapes your chain for this session.</p>
        )}
        <div className="rf-intel-list">
          {decisionsShow.map((row) => {
            const copy = decisionToCopy(row);
            const dc = decisionDotClass(row.decision_type);
            const dotColor =
              dc === 'blue' ? 'var(--blue)' : dc === 'green' ? 'var(--green)' : 'var(--gold)';
            return (
              <div key={row.id} className="rf-intel-item card-spec">
                <span className="rf-intel-dot" style={{ background: dotColor }} />
                <div>
                  <div className="rf-intel-title">{copy.title}</div>
                  <div className="rf-intel-msg">{copy.message}</div>
                </div>
              </div>
            );
          })}
        </div>
        {hasMore && (
          <button type="button" className="btn btn-ghost rf-intel-refresh" onClick={() => loadRecentDecisionsGlobal()}>
            Refresh
          </button>
        )}
      </section>

      <style>{`
        .rf-dash-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 28px;
          flex-wrap: wrap;
        }
        .rf-dash-head__brand {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .rf-dash-logo {
          max-height: 48px;
          width: auto;
        }
        .rf-dash-title {
          font-family: var(--font-display);
          font-size: 32px;
          letter-spacing: 3px;
          font-weight: 400;
          margin: 0;
          line-height: 1;
          color: var(--text);
        }
        .rf-dash-sub {
          margin: 8px 0 0;
          font-size: 13px;
          color: var(--text3);
          max-width: 520px;
          line-height: 1.5;
        }
        .rf-continue-card {
          margin-bottom: 20px;
          padding: 16px;
          border-radius: 12px;
          border-color: var(--gold2);
          background: var(--gold-dim);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .rf-continue-label {
          font-size: 11px;
          color: var(--gold2);
          font-weight: 600;
          letter-spacing: 1px;
        }
        .rf-continue-name {
          font-size: 15px;
          color: var(--text);
          margin-top: 4px;
        }
        .rf-continue-progress {
          font-size: 12px;
          color: var(--text2);
          margin-top: 6px;
          line-height: 1.4;
          max-width: 420px;
        }
        .rf-continue-meta {
          font-size: 11px;
          color: var(--text3);
          margin-top: 6px;
        }
        .rf-continue-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .session-new-card {
          min-height: 130px;
          border-radius: 12px;
          border: 1px dashed var(--border2);
          background: var(--bg3);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          transition: all 200ms ease;
        }
        .session-new-card__icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2px solid var(--gold);
          color: var(--gold2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          margin-bottom: 8px;
        }
        .session-new-card__label {
          font-size: 13px;
          color: var(--text3);
        }
        .rf-session-card {
          position: relative;
          min-height: 200px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--bg3);
          padding: 16px;
          cursor: pointer;
          transition: all 220ms ease;
        }
        .rf-session-card:hover {
          border-color: var(--border2) !important;
          transform: translateY(-2px);
          background: var(--bg4) !important;
          box-shadow: inset 0 2px 0 0 var(--gold);
        }
        .rf-session-card:hover .rf-session-delete {
          opacity: 1 !important;
        }
        .rf-session-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          padding: 4px 8px;
          border-radius: 4px;
          max-width: 120px;
          text-align: center;
          line-height: 1.2;
        }
        .rf-session-badge--ok {
          background: var(--green-dim);
          color: var(--green);
        }
        .rf-session-badge--warn {
          background: var(--gold-dim);
          color: var(--gold2);
        }
        .rf-session-badge--neutral {
          background: var(--bg5);
          color: var(--text3);
        }
        .rf-session-delete {
          position: absolute;
          top: 40px;
          right: 10px;
          padding: 2px 6px;
          opacity: 0;
          font-size: 14px;
        }
        .rf-session-meta-row {
          display: inline-block;
          font-size: 10px;
          color: var(--text3);
          background: var(--bg2);
          padding: 2px 8px;
          border-radius: 4px;
          margin-bottom: 8px;
        }
        .rf-session-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--text);
          padding-right: 120px;
        }
        .rf-session-subline {
          font-size: 11px;
          color: var(--text3);
          margin-top: 6px;
        }
        .rf-session-progress-hint {
          font-size: 11px;
          color: var(--text4);
          margin-top: 8px;
          line-height: 1.4;
        }
        .rf-session-dots {
          display: flex;
          gap: 4px;
          margin-top: 10px;
          align-items: center;
        }
        .rf-session-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          opacity: 1;
        }
        .rf-session-more {
          font-size: 9px;
          color: var(--text4);
        }
        .rf-session-time {
          font-size: 10px;
          color: var(--text4);
          margin-top: 8px;
        }
        .rf-session-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 12px;
        }
        .btn-sm {
          padding: 4px 10px;
          font-size: 11px;
        }
        .rf-session-rename {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          margin-top: 4px;
        }
        .rf-session-rename .input-spec {
          flex: 1;
          min-width: 140px;
        }
        .rf-dash-empty {
          text-align: center;
          color: var(--text3);
          margin-top: 32px;
          font-size: 14px;
        }
        .rf-intel-section {
          margin-top: 28px;
          padding: 18px;
        }
        .rf-intel-intro {
          font-size: 12px;
          color: var(--text3);
          margin: 4px 0 0;
        }
        .rf-intel-empty {
          color: var(--text3);
          font-size: 13px;
          margin: 12px 0 0;
        }
        .rf-intel-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 12px;
        }
        .rf-intel-item {
          padding: 10px;
          background: var(--bg4);
          border-radius: 8px;
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .rf-intel-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          margin-top: 5px;
          flex-shrink: 0;
        }
        .rf-intel-title {
          font-size: 11px;
          font-weight: 600;
          color: var(--text);
        }
        .rf-intel-msg {
          font-size: 10px;
          color: var(--text3);
          line-height: 1.5;
          margin-top: 4px;
        }
        .rf-intel-refresh {
          margin-top: 12px;
          font-size: 11px;
        }
        .session-new-card:hover {
          border-color: var(--gold) !important;
          background: var(--gold-dim) !important;
        }
        .session-new-card:hover .session-new-card__label {
          color: var(--gold2) !important;
        }
      `}</style>
    </main>
  );
}
