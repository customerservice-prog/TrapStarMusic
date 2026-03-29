import { useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api.js';
import { vibeUiToApi } from '../lib/vibeMap.js';

function layerLabel(layer) {
  if (layer === 'adlib') return 'Adlib';
  if (layer === 'double') return 'Double';
  if (layer === 'harmony') return 'Harmony';
  return 'Main';
}

function pickChain(override, preview) {
  const procs = override?.processors;
  if (Array.isArray(procs) && procs.length) return override;
  return preview;
}

export default function SmartChainPanel({
  sessionId,
  vibe,
  chainOverride,
  recording,
  trackLayer,
  settleKey,
  selectedTrackId,
}) {
  const [preview, setPreview] = useState(null);
  const [loadErr, setLoadErr] = useState(null);

  const vibePayload = useMemo(
    () => vibeUiToApi(vibe),
    [
      vibe?.cleanGritty,
      vibe?.naturalTuned,
      vibe?.drySpacious,
      vibe?.upfrontBlended,
      vibe?.space,
      vibe?.shine,
      vibe?.punch,
      vibe?.width,
      vibe?.grit,
    ]
  );

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setPreview(null);
      setLoadErr(null);
      return undefined;
    }
    (async () => {
      try {
        const data = await api.chainPreview(sessionId, vibePayload, trackLayer);
        if (!cancelled) {
          setPreview(data);
          setLoadErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e?.message || 'Could not load chain preview.');
          setPreview(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, vibePayload, trackLayer, settleKey]);

  const chain = pickChain(chainOverride, preview);
  const processors = Array.isArray(chain?.processors) ? chain.processors : [];
  const fromTake = !!(chainOverride?.processors?.length);
  const tone = typeof chain?.tone === 'number' ? chain.tone : null;

  const statusLine = recording
    ? 'Live input — chain follows your armed layer and vibe.'
    : fromTake
      ? 'Chain from your last processed take on this layer.'
      : 'Preview — moves with vibe sliders and layer focus.';

  return (
    <section className="smart-chain-panel" aria-label="Smart processing chain">
      <div className="section-label" style={{ marginBottom: 8 }}>
        Smart chain
      </div>
      <div
        className="card-spec"
        style={{
          padding: 12,
          borderRadius: 8,
          border: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <span className="mono" style={{ fontSize: 10, color: 'var(--gold2)' }}>
            {layerLabel(trackLayer)} ·{' '}
            {recording || selectedTrackId === '__rec__'
              ? 'recording'
              : selectedTrackId
                ? 'armed lane'
                : 'preview'}
          </span>
          {tone != null && (
            <span className="mono" style={{ fontSize: 10, color: 'var(--text3)' }}>
              tone {Math.round(tone * 100)}%
            </span>
          )}
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 10, color: 'var(--text3)', lineHeight: 1.45 }}>
          {statusLine}
        </p>

        {loadErr && !fromTake && (
          <p style={{ margin: '0 0 10px', fontSize: 10, color: 'var(--red)' }} role="alert">
            {loadErr}
          </p>
        )}

        <ul
          key={settleKey}
          style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {processors.map((p) => (
            <li key={p.id}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 10,
                  color: 'var(--text2)',
                }}
              >
                <span>{p.name || p.id}</span>
                <span className="mono" style={{ color: 'var(--text3)', minWidth: 36, textAlign: 'right' }}>
                  {Math.round((p.value ?? 0) * 100)}%
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  marginTop: 4,
                  borderRadius: 2,
                  background: 'var(--bg4)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.round((p.value ?? 0) * 100)}%`,
                    borderRadius: 2,
                    background: 'linear-gradient(90deg, var(--gold-dim), var(--gold2))',
                    transition: 'width 280ms ease',
                  }}
                />
              </div>
            </li>
          ))}
        </ul>

        {!processors.length && !loadErr && (
          <p style={{ margin: 0, fontSize: 10, color: 'var(--text3)' }}>No chain data yet.</p>
        )}
      </div>
    </section>
  );
}
