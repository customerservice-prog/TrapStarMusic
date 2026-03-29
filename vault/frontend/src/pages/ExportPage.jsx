import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../hooks/useStore.jsx';
import BrandLogo from '../components/BrandLogo.jsx';

const MODES = [
  {
    id: 'full',
    title: 'Full mix',
    blurb: 'Beat and vocals together — ready to share.',
    mode: 'full',
  },
  {
    id: 'acapella',
    title: 'Acapella',
    blurb: 'Vocals only, no beat.',
    mode: 'acapella',
  },
  {
    id: 'stems',
    title: 'Stems',
    blurb: 'Each layer as its own file.',
    mode: 'stems',
  },
];

export default function ExportPage() {
  const { id } = useParams();
  const { exportMix, notify, loadSession, session } = useStore();
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [done, setDone] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    loadSession(id);
  }, [id, loadSession]);

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
        setDone({
          title: card.title,
          url: r.downloadUrl,
          name: r.suggestedFilename || r.downloadUrl.split('/').pop() || 'rap-factory-export.wav',
        });
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
    <main className="page-export vault-export-page">
      <Link to={`/studio/${id}`} className="vault-export-back">
        ← Studio
      </Link>
      <div className="brand-inline-wrap vault-export-brand">
        <BrandLogo variant="inline" />
      </div>
      <h1 className="vault-export-title">Export</h1>
      <p className="vault-export-sub">{session?.name || 'Session'}</p>

      <div className="vault-export-grid">
        {MODES.map((c) => (
          <button
            key={c.id}
            type="button"
            className="vault-export-card glass-panel"
            disabled={busy}
            onClick={() => run(c)}
          >
            <span className="vault-export-card__title">{c.title}</span>
            <span className="vault-export-card__blurb">{c.blurb}</span>
          </button>
        ))}
      </div>

      {(busy || done) && (
        <div className="vault-export-result glass-panel">
          {!done ? (
            <>
              <p className="vault-export-result__label">Polishing your bounce…</p>
              <div className="vault-export-bar">
                <div className="vault-export-bar__fill" style={{ width: `${phase}%` }} />
              </div>
            </>
          ) : (
            <>
              <p className="vault-export-result__ok">Ready</p>
              <p className="vault-export-result__name">{done.name}</p>
              <div className="vault-export-wave" aria-hidden>
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <audio ref={audioRef} className="vault-export-audio" controls src={done.url} preload="metadata" />
              <button type="button" className="btn btn-primary vault-export-dl" onClick={replayDownload}>
                Download again
              </button>
            </>
          )}
        </div>
      )}
    </main>
  );
}
