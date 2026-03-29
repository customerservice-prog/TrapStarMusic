import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore.jsx';
import { decisionToCopy, decisionDotClass } from '../lib/decisionCopy.js';
import BrandLogo from '../components/BrandLogo.jsx';

function formatSessionTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
  } = useStore();

  useEffect(() => {
    loadSessions();
    loadRecentDecisionsGlobal();
  }, [loadSessions, loadRecentDecisionsGlobal]);

  const decisionsShow = (recentDecisionsGlobal || []).slice(0, 4);
  const hasMore = (recentDecisionsGlobal || []).length > 4;

  let lastSessionId = null;
  try {
    lastSessionId = localStorage.getItem('vault_last_session_id');
  } catch {
    /* */
  }
  const resumeSession = lastSessionId ? sessions.find((s) => s.id === lastSessionId) : null;

  return (
    <main className="page-dash">
      <div className="brand-hero-wrap">
        <BrandLogo variant="hero" />
      </div>
      {resumeSession && (
        <div
          className="card-spec"
          style={{
            marginBottom: 20,
            padding: 16,
            borderRadius: 12,
            borderColor: 'var(--gold2)',
            background: 'var(--gold-dim)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: 'var(--gold2)', fontWeight: 600, letterSpacing: 1 }}>CONTINUE</div>
            <div style={{ fontSize: 15, color: 'var(--text)', marginTop: 4 }}>{resumeSession.name}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              Last opened · {formatSessionTime(resumeSession.updated_at)}
            </div>
          </div>
          <Link to={`/studio/${resumeSession.id}`} className="btn btn-primary">
            Open session
          </Link>
        </div>
      )}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 36,
              letterSpacing: 3,
              fontWeight: 400,
              margin: 0,
              lineHeight: 1,
              color: 'var(--text)',
            }}
          >
            YOUR SESSIONS
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text3)' }}>
            {sessions.length} project{sessions.length === 1 ? '' : 's'} saved
          </p>
        </div>
        <Link to="/new" className="btn btn-primary">
          + New Session
        </Link>
      </header>

      <div className="grid-sessions-dash">
        <Link
          to="/new"
          className="session-new-card"
          style={{
            minHeight: 130,
            borderRadius: 12,
            border: '1px dashed var(--border2)',
            background: 'var(--bg3)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
            transition: 'all 200ms ease',
          }}
        >
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '2px solid var(--gold)',
              color: 'var(--gold2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              marginBottom: 8,
            }}
          >
            +
          </span>
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>New Session</span>
        </Link>

        {sessions.map((s) => {
          const mixReady = (s.track_count || 0) > 0;
          const { dots, more } = modeToTrackDots(s.track_count || 0);
          return (
            <div
              key={s.id}
              className="session-card-spec"
              style={{
                position: 'relative',
                minHeight: 130,
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--bg3)',
                padding: 16,
                cursor: 'pointer',
                transition: 'all 220ms ease',
              }}
              role="link"
              tabIndex={0}
              onClick={() => nav(`/studio/${s.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && nav(`/studio/${s.id}`)}
            >
              <span
                className="mono"
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 12,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: mixReady ? 'var(--green-dim)' : 'var(--gold-dim)',
                  color: mixReady ? 'var(--green)' : 'var(--gold2)',
                }}
              >
                {mixReady ? 'MIX-READY' : 'IN PROGRESS'}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                title="Delete session"
                style={{
                  position: 'absolute',
                  top: 36,
                  right: 10,
                  padding: '2px 6px',
                  opacity: 0,
                  fontSize: 14,
                }}
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
              <div
                className="mono"
                style={{
                  display: 'inline-block',
                  fontSize: 10,
                  color: 'var(--text3)',
                  background: 'var(--bg2)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  marginBottom: 8,
                }}
              >
                {s.bpm || '—'} BPM · {s.musical_key || '—'} · {s.genre || '—'}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', paddingRight: 72 }}>{s.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                {s.track_count || 0} layers · {s.beat_label || s.beat_filename ? 'beat loaded' : 'no beat'}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center' }}>
                {dots.map((c, i) => (
                  <span
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: c === 'gold' ? 'var(--gold)' : 'var(--blue)',
                      opacity: 1,
                    }}
                  />
                ))}
                {more > 0 && <span className="mono" style={{ fontSize: 9, color: 'var(--text4)' }}>+{more}</span>}
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text4)', marginTop: 8 }}>
                {formatSessionTime(s.updated_at)}
              </div>
            </div>
          );
        })}
      </div>

      {!sessions.length && backendOnline && (
        <p style={{ textAlign: 'center', color: 'var(--text3)', marginTop: 32, fontSize: 14 }}>
          Your first session is one click away
        </p>
      )}

      <section className="card-spec" style={{ marginTop: 28, padding: 18 }}>
        <div className="section-label">Smart Engine · Recent Decisions</div>
        {!decisionsShow.length && (
          <p style={{ color: 'var(--text3)', fontSize: 13, margin: '12px 0 0' }}>Start recording to see Smart Engine decisions</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          {decisionsShow.map((row) => {
            const copy = decisionToCopy(row);
            const dc = decisionDotClass(row.decision_type);
            const dotColor =
              dc === 'blue' ? 'var(--blue)' : dc === 'green' ? 'var(--green)' : 'var(--gold)';
            return (
              <div
                key={row.id}
                className="card-spec"
                style={{
                  padding: 10,
                  background: 'var(--bg4)',
                  borderRadius: 8,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{copy.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.5, marginTop: 4 }}>{copy.message}</div>
                </div>
              </div>
            );
          })}
        </div>
        {hasMore && (
          <button type="button" className="btn btn-ghost" style={{ marginTop: 12, fontSize: 11 }} onClick={() => loadRecentDecisionsGlobal()}>
            Refresh log
          </button>
        )}
      </section>

      <style>{`
        .session-card-spec:hover {
          border-color: var(--border2) !important;
          transform: translateY(-2px);
          background: var(--bg4) !important;
          box-shadow: inset 0 2px 0 0 var(--gold);
        }
        .session-card-spec:hover .btn.btn-ghost[title='Delete session'] {
          opacity: 1 !important;
        }
        .session-new-card:hover {
          border-color: var(--gold) !important;
          background: var(--gold-dim) !important;
        }
        .session-new-card:hover span:last-child {
          color: var(--gold2) !important;
        }
      `}</style>
    </main>
  );
}
