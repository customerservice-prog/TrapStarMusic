import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore.jsx';
import { useAudioEngine } from '../hooks/useAudioEngine.js';
import BrandLogo from '../components/BrandLogo.jsx';

/** Values must match backend key format (e.g. Am, C) */
const KEYS = [
  { label: 'A minor', value: 'Am' },
  { label: 'A major', value: 'A' },
  { label: 'C minor', value: 'Cm' },
  { label: 'C major', value: 'C' },
  { label: 'D minor', value: 'Dm' },
  { label: 'E minor', value: 'Em' },
  { label: 'F minor', value: 'Fm' },
  { label: 'G minor', value: 'Gm' },
];
const GENRES = ['Trap', 'Drill', 'R&B', 'Hip-Hop', 'Phonk', 'Other'];

export default function NewSession() {
  const nav = useNavigate();
  const { createSession, uploadBeatApi } = useStore();
  const { decodeFile } = useAudioEngine();
  const fileRef = useRef(null);
  const nameRef = useRef(null);
  const [name, setName] = useState('');
  const [beatName, setBeatName] = useState('');
  const [bpm, setBpm] = useState(140);
  const [key, setKey] = useState('A minor');
  const [genre, setGenre] = useState('Trap');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const submit = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    const s = await createSession({
      name: name.trim(),
      bpm: Number(bpm),
      musical_key: key,
      genre,
      beat_label: beatName.trim() || undefined,
    });
    if (!s?.id) {
      setBusy(false);
      return;
    }
    const f = fileRef.current?.files?.[0];
    if (f) {
      await decodeFile(f);
      await uploadBeatApi(s.id, f);
    }
    setBusy(false);
    nav(`/studio/${s.id}`);
  };

  return (
    <main className="page-new" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form
        className="card-spec"
        onSubmit={submit}
        style={{
          width: 440,
          maxWidth: '100%',
          padding: 32,
          borderRadius: 16,
          border: '1px solid var(--border2)',
        }}
      >
        <div className="brand-inline-wrap">
          <BrandLogo variant="inline" />
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            letterSpacing: 3,
            fontWeight: 400,
            margin: 0,
            color: 'var(--text)',
          }}
        >
          NEW SESSION
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text3)', margin: '8px 0 28px' }}>Fill in what you know — Rap Factory handles the rest</p>

        <label className="section-label" style={{ marginBottom: 6 }}>
          Session name *
        </label>
        <input
          ref={nameRef}
          className="input-spec"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. DARK ZONE, Untitled Banger..."
          required
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />

        <label className="section-label" style={{ margin: '16px 0 6px' }}>
          Beat name
        </label>
        <input
          className="input-spec"
          value={beatName}
          onChange={(e) => setBeatName(e.target.value)}
          placeholder="e.g. Prod. Metro Boomin..."
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16 }}>
          <div>
            <label className="section-label" style={{ marginBottom: 6 }}>
              BPM
            </label>
            <input className="input-spec" type="number" value={bpm} onChange={(e) => setBpm(e.target.value)} />
          </div>
          <div>
            <label className="section-label" style={{ marginBottom: 6 }}>
              Key
            </label>
            <select className="input-spec" value={key} onChange={(e) => setKey(e.target.value)}>
              {KEYS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="section-label" style={{ marginBottom: 6 }}>
              Genre
            </label>
            <select className="input-spec" value={genre} onChange={(e) => setGenre(e.target.value)}>
              {GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={() => nav('/')}>
            Back
          </button>
          <button type="submit" className={`btn btn-primary ${busy ? 'pulse-loading' : ''}`} disabled={!name.trim() || busy}>
            {busy ? 'Creating…' : 'Create Session →'}
          </button>
        </div>
      </form>
    </main>
  );
}
