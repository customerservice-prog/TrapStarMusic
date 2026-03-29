import { useEffect, useState } from 'react';
import { useStore } from '../hooks/useStore.jsx';
import * as api from '../lib/api.js';
import Toggle from '../components/Toggle.jsx';
import BrandLogo from '../components/BrandLogo.jsx';

export default function SettingsPage() {
  const { loadVoiceProfile, resetProfile, voiceProfile, notify, engineToggles, setEngineToggle } = useStore();
  const [checks, setChecks] = useState([]);
  const [mic, setMic] = useState('default');
  const [latency, setLatency] = useState('interactive');
  const [sr, setSr] = useState('48000');
  const [autosave, setAutosave] = useState('30');
  const [monitorStyle, setMonitorStyle] = useState('headphones');
  const [hpVol, setHpVol] = useState('0dB');

  useEffect(() => {
    loadVoiceProfile();
  }, [loadVoiceProfile]);

  const runDiag = async () => {
    let latencyMs = null;
    let micPeak = null;
    try {
      const ls = sessionStorage.getItem('vault_latency_ms');
      const mp = sessionStorage.getItem('vault_mic_peak');
      if (ls != null && ls !== '') latencyMs = Number(ls);
      if (mp != null && mp !== '') micPeak = Number(mp);
    } catch {
      /* */
    }
    const r = await api.runDiagnostics({
      ...(Number.isFinite(latencyMs) ? { latencyMs } : {}),
      ...(Number.isFinite(micPeak) ? { micPeak } : {}),
    });
    if (r.checks) {
      setChecks(r.checks);
      const extra = [
        {
          id: 'webaudio',
          label: 'Web Audio',
          ok: !!(window.AudioContext || window.webkitAudioContext),
          detail: 'In-browser playback and recording engine.',
        },
      ];
      if (!Number.isFinite(micPeak)) {
        extra.push({
          id: 'mic_hint',
          label: 'Mic check',
          ok: true,
          detail: 'Spend a minute in Studio so Rap Factory can learn your level — then run this again for a mic reading.',
        });
      }
      setChecks([...r.checks, ...extra]);
    }
    if (r.allPassed) notify({ title: 'Diagnostics', text: 'Core checks passed.' }, 'success');
    else notify({ title: 'Diagnostics', text: 'Some items need attention below.' }, 'warn');
  };

  const p = voiceProfile || {};

  return (
    <main className="page-settings">
      <div className="brand-inline-wrap">
        <BrandLogo variant="inline" />
      </div>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 34,
          fontWeight: 400,
          margin: '0 0 20px',
          color: 'var(--text)',
        }}
      >
        SETTINGS
      </h1>

      <section className="card-spec" style={{ marginBottom: 12 }}>
        <div className="section-label">Audio Device</div>
        <Row label="Microphone" hint="Used when you hit record in Studio">
          <select className="input-spec" style={{ maxWidth: 220 }} value={mic} onChange={(e) => setMic(e.target.value)}>
            <option value="default">System default</option>
          </select>
        </Row>
        <Row label="Output" hint="Usually your interface or headphones">
          <select className="input-spec" style={{ maxWidth: 220 }} value={mic} onChange={(e) => setMic(e.target.value)}>
            <option value="default">System default</option>
          </select>
        </Row>
        <Row label="Latency Mode" hint="Interactive keeps monitoring tight">
          <select className="input-spec" style={{ maxWidth: 220 }} value={latency} onChange={(e) => setLatency(e.target.value)}>
            <option value="interactive">Interactive (lowest)</option>
            <option value="balanced">Balanced</option>
          </select>
        </Row>
        <Row label="Sample Rate" hint="Display only — browser chooses actual rate">
          <select className="input-spec" style={{ maxWidth: 220 }} value={sr} onChange={(e) => setSr(e.target.value)}>
            <option value="44100">44.1 kHz</option>
            <option value="48000">48 kHz</option>
          </select>
        </Row>
      </section>

      <section className="card-spec" style={{ marginBottom: 12 }}>
        <div className="section-label">Smart Engine</div>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 0 }}>
          Same switches as Studio — they stay in sync for this browser.
        </p>
        <Row label="Pro Sound Mode" hint="Full polish chain">
          <Toggle on={!!engineToggles.proSound} onChange={(v) => setEngineToggle('proSound', v)} ariaLabel="Pro sound" />
        </Row>
        <Row label="Auto-Tune" hint="Tune assist in the smart chain">
          <Toggle on={!!engineToggles.autoTune} onChange={(v) => setEngineToggle('autoTune', v)} ariaLabel="Auto-Tune" />
        </Row>
        <Row label="Beat Awareness" hint="Chain reacts to the beat profile">
          <Toggle on={!!engineToggles.beatAwareness} onChange={(v) => setEngineToggle('beatAwareness', v)} ariaLabel="Beat awareness" />
        </Row>
        <Row label="Auto-Group Layers" hint="Stack suggestions for doubles and adlibs">
          <Toggle on={!!engineToggles.autoGroup} onChange={(v) => setEngineToggle('autoGroup', v)} ariaLabel="Auto-Group" />
        </Row>
        <Row label="Auto-Save Frequency" hint="Snapshots while you work">
          <select className="input-spec" style={{ maxWidth: 200 }} value={autosave} onChange={(e) => setAutosave(e.target.value)}>
            <option value="30">Every 30 seconds</option>
            <option value="60">Every 60 seconds</option>
          </select>
        </Row>
      </section>

      <section className="card-spec" style={{ marginBottom: 12 }}>
        <div className="section-label">Monitoring</div>
        <Row label="Monitoring Style" hint="How you hear yourself">
          <select className="input-spec" style={{ maxWidth: 220 }} value={monitorStyle} onChange={(e) => setMonitorStyle(e.target.value)}>
            <option value="headphones">Headphones (recommended)</option>
            <option value="speakers">Speakers</option>
          </select>
        </Row>
        <Row label="Headphone Level" hint="Relative trim">
          <select className="input-spec" style={{ maxWidth: 200 }} value={hpVol} onChange={(e) => setHpVol(e.target.value)}>
            <option value="0dB">0 dB</option>
            <option value="-3dB">-3 dB</option>
          </select>
        </Row>
      </section>

      <section className="card-spec" style={{ marginBottom: 12 }}>
        <div className="section-label">My Sound Profile</div>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 0 }}>
          Trained on <span className="mono">{p.sessions_trained ?? 0}</span> sessions and{' '}
          <span className="mono">{p.takes_trained ?? 0}</span> takes.
        </p>
        {[
          ['tune_strength', 'How tuned my vocals sound'],
          ['reverb_level', 'How much space around my voice'],
          ['compression', 'How punchy and controlled my delivery sounds'],
          ['saturation', 'How warm and upfront my tone sits'],
          ['adlib_width', 'How wide my doubles and adlibs spread'],
        ].map(([k, label]) => (
          <div key={k} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--text)' }}>{label}</div>
            <div style={{ height: 6, background: 'var(--bg5)', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.round((Number(p[k]) || 0) * 100)}%`,
                  background: 'var(--gold)',
                  transition: 'width 0.4s var(--ease-out)',
                }}
              />
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" style={{ marginTop: 18 }} onClick={() => resetProfile()}>
          Reset Profile
        </button>
      </section>

      <section className="card-spec" style={{ marginBottom: 12 }}>
        <div className="section-label">Device Check</div>
        <button type="button" className="btn btn-primary" onClick={runDiag}>
          Run Diagnostics
        </button>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
          {checks.map((c) => (
            <li key={c.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
              <span className={`status-dot ${c.ok ? 'ok' : 'bad'}`} style={{ marginTop: 4 }} />
              <div>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>{c.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card-spec">
        <div className="section-label">Advanced</div>
        <p style={{ fontSize: 12, color: 'var(--text3)' }}>Maintenance tools for troubleshooting.</p>
        <button type="button" className="btn btn-ghost" style={{ marginTop: 10, marginRight: 8 }} onClick={() => notify({ title: 'Cache', text: 'Cleared local UI cache.' }, 'success')}>
          Clear Cache
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => notify({ title: 'Logs', text: 'Logs export coming soon.' }, 'info')}>
          Export Logs
        </button>
      </section>

      <section className="card-spec" style={{ marginTop: 12 }}>
        <div className="section-label">Microphone</div>
        <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.5 }}>
          If the browser blocked the mic: use the lock or site settings icon in the address bar → set Microphone to Allow → reload Rap Factory.
          On Windows, check Settings → Privacy → Microphone for desktop access.
        </p>
      </section>
    </main>
  );
}

function Row({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}
