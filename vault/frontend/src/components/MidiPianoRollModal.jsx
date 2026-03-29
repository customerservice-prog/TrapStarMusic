import { useEffect, useState } from 'react';
import { parseClips, clipsToJson } from '../lib/trackClips.js';

export default function MidiPianoRollModal({ open, track, clipId, onClose, onSave }) {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    if (!open || !track || !clipId) return;
    const clips = parseClips(track);
    const c = clips.find((x) => x.id === clipId);
    setNotes(Array.isArray(c?.notes) ? c.notes.map((n) => ({ ...n })) : []);
  }, [open, track, clipId]);

  if (!open || !track || !clipId) return null;

  const persist = () => {
    const clips = parseClips(track);
    const next = clips.map((c) => (c.id === clipId ? { ...c, notes: [...notes] } : c));
    onSave(track.id, clipsToJson(next));
    onClose();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="card-spec modal-spec midi-roll-modal">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginTop: 0 }}>MIDI clip editor</h2>
        <p style={{ fontSize: 12, color: 'var(--text3)' }}>Edit note list (time in seconds from clip start, MIDI pitch, duration).</p>
        <div className="midi-roll-list">
          {notes.map((n, i) => (
            <div key={i} className="midi-roll-row">
              <label>
                t
                <input
                  type="number"
                  className="input-spec"
                  step={0.01}
                  value={n.t}
                  onChange={(e) => {
                    const v = [...notes];
                    v[i] = { ...v[i], t: Number(e.target.value) || 0 };
                    setNotes(v);
                  }}
                />
              </label>
              <label>
                midi
                <input
                  type="number"
                  className="input-spec"
                  min={0}
                  max={127}
                  value={n.midi}
                  onChange={(e) => {
                    const v = [...notes];
                    v[i] = { ...v[i], midi: Math.round(Number(e.target.value) || 60) };
                    setNotes(v);
                  }}
                />
              </label>
              <label>
                dur
                <input
                  type="number"
                  className="input-spec"
                  step={0.01}
                  value={n.dur}
                  onChange={(e) => {
                    const v = [...notes];
                    v[i] = { ...v[i], dur: Number(e.target.value) || 0.1 };
                    setNotes(v);
                  }}
                />
              </label>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setNotes(notes.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: 8 }}
          onClick={() => setNotes([...notes, { t: 0, midi: 60, dur: 0.2, vel: 0.75 }])}
        >
          + Note
        </button>
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={persist}>
            Save clip
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
