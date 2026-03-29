import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../hooks/useStore.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import { trackTypeLabel } from '../lib/layerPalette.js';

const MODES = [
  {
    id: 'full',
    title: 'Full mix',
    blurb: 'Beat plus every active vocal — one file, ready to share or stream as a reference.',
    tag: 'Recommended',
    mode: 'full',
  },
  {
    id: 'acapella',
    title: 'Acapella',
    blurb: 'Vocals only — perfect for remixes, placements, or sending to an engineer.',
    tag: 'Vocals only',
    mode: 'acapella',
  },
  {
    id: 'stems',
    title: 'Stems',
    blurb: 'Each layer as its own file — backup for the session or hand-off to a mixer.',
    tag: 'Multi-file',
    mode: 'stems',
  },
];

function formatWhen(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ExportPage() {
  const { id } = useParams();
  const { exportMix, notify, loadSession, session, loadTracks, tracks } = useStore();
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [done, setDone] = useState(null);
  const [lastExportAt, setLastExportAt] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    loadSession(id);
    loadTracks(id);
  }, [id, loadSession, loadTracks]);

  const summary = useMemo(() => {
    const beat = !!(session?.beat_filename || session?.beat_label);
    const n = tracks?.length || 0;
    const types = [...new Set((tracks || []).map((t) => t.track_type))].map(trackTypeLabel);
    return { beat, n, types };
  }, [session, tracks]);

  const readiness =
    summary.n > 0
      ? summary.beat
        ? 'Ready for a full mix, acapella, or stem pack.'
        : 'Beat not in session — full mix will bounce vocals only until you add the beat in Studio.'
      : 'Record at least one take in Studio before printing a bounce.';

  const run = async (card) => {
    if (!card.mode || busy) return;
    setBusy(true);
    setDone(null);
    setPhase(12);
    const step = setInterval(() => setPhase((p) => Math.min(92, p + 5)), 220);
    try {
      const r = await exportMix(id, card.mode);
      if (r?.downloadUrl) {
        setPhase(100);
        const name = r.suggestedFilename || r.downloadUrl.split('/').pop() || 'rap-factory-export.wav';
        setDone({
          title: card.title,
          url: r.downloadUrl,
          name,
          note: r.exportNote,
        });
        setLastExportAt(new Date().toISOString());
      } else {
        notify({ title: 'Export', text: r?.message || r?.error || 'Could not finish export.' }, 'warn');
      }
    } finally {
      clearInterval(step);
      setBusy(false);
      setTimeout(() => setPhase(0), 700);
    }
  };

  const replayDownload = () => {
    if (!done?.url) return;
    const a = document.createElement('a');
    a.href = done.url;
    a.download = done.name || 'rap-factory-export.wav';
    a.click();
  };

  return (
    <main className="page-export rf-export-page">
      <Link to={`/studio/${id}`} className="rf-export-back">
        ← Back to Studio
      </Link>
      <div className="brand-inline-wrap rf-export-brand">
        <BrandLogo variant="inline" />
      </div>
      <h1 className="rf-export-title">Print your bounce</h1>
      <p className="rf-export-sub">{session?.name || 'Session'}</p>
      <p className="rf-export-lead">You are in the mastering room — pick how you want this session to leave RAP FACTORY.</p>

      <section className="rf-export-summary glass-panel">
        <div className="rf-export-summary__title">Session snapshot</div>
        <ul className="rf-export-summary__list">
          <li>
            <strong>{summary.n}</strong> vocal layer{summary.n === 1 ? '' : 's'}
          </li>
          <li>{summary.beat ? 'Beat attached' : 'No beat file in session'}</li>
          {summary.types.length > 0 && (
            <li>
              Stack: {summary.types.join(' · ')}
            </li>
          )}
        </ul>
        <p className="rf-export-readiness">{readiness}</p>
        {lastExportAt && (
          <p className="rf-export-last">Last export started · {formatWhen(lastExportAt)}</p>
        )}
      </section>

      <div className="rf-export-grid">
        {MODES.map((c) => (
          <button
            key={c.id}
            type="button"
            className="rf-export-card glass-panel"
            disabled={busy}
            onClick={() => run(c)}
          >
            <span className="rf-export-card__tag">{c.tag}</span>
            <span className="rf-export-card__title">{c.title}</span>
            <span className="rf-export-card__blurb">{c.blurb}</span>
          </button>
        ))}
      </div>

      <p className="rf-export-footnote">Preview the latest bounce below when it finishes — loudness is mix-ready for reference, not replaced mastering.</p>

      {(busy || done) && (
        <div className="rf-export-result glass-panel">
          {!done ? (
            <>
              <p className="rf-export-result__label">Rendering your bounce…</p>
              <div className="rf-export-bar">
                <div className="rf-export-bar__fill" style={{ width: `${phase}%` }} />
              </div>
            </>
          ) : (
            <>
              <p className="rf-export-result__ok">Export ready</p>
              {done.note && <p className="rf-export-result__note">{done.note}</p>}
              <p className="rf-export-result__name">{done.name}</p>
              <div className="rf-export-wave" aria-hidden>
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <audio ref={audioRef} className="rf-export-audio" controls src={done.url} preload="metadata" />
              <button type="button" className="btn btn-primary rf-export-dl" onClick={replayDownload}>
                Download again
              </button>
            </>
          )}
        </div>
      )}
    </main>
  );
}
