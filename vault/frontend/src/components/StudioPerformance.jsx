import Toggle from './Toggle.jsx';

export default function StudioPerformance({
  engine,
  processing,
  recSec,
  fmtTime,
  selectedTrack,
  onRecordToggle,
  monitorVol,
  onMonitorVol,
  balance,
  onBalance,
  punchMode,
  onPunchToggle,
  countInBars,
  onCountInChange,
  meterWidthPct,
  latencyMs,
  beatTimeSec,
  beatDurationSec,
}) {
  const rec = engine.isRecording;
  const live = engine.monitoringOn && !engine.micDenied;

  const line1 = processing ? 'Processing' : rec ? 'Recording' : 'Ready';
  const line2 = processing
    ? 'Polishing your take…'
    : rec
      ? 'Signal is printing to this layer'
      : selectedTrack?.label || 'Choose a layer to arm';

  const posLabel =
    beatDurationSec > 0 && beatTimeSec != null
      ? `${fmtTime(beatTimeSec)} / ${fmtTime(beatDurationSec)}`
      : null;

  return (
    <section className="rf-performance glass-panel" aria-label="Record and balance">
      <div className="rf-performance__center">
        <button
          type="button"
          className={`rf-rec-btn${rec ? ' rf-rec-btn--recording' : ''}${processing ? ' rf-rec-btn--wait' : ''}`}
          aria-label={rec ? 'Stop recording' : 'Start recording'}
          disabled={processing}
          onClick={onRecordToggle}
        >
          <span className="rf-rec-btn__ring" />
          <span className="rf-rec-btn__core" />
        </button>
        <div className="rf-performance__meta">
          <div className="rf-performance__line1">{line1}</div>
          <div className="rf-performance__line2">
            {line2}
            {rec && <span className="rf-performance__timer">{fmtTime(recSec)}</span>}
          </div>
          {posLabel && (
            <div className="rf-performance__beatpos" aria-label="Beat position">
              Beat · {posLabel}
            </div>
          )}
        </div>
      </div>

      <div className="rf-performance__monitor">
        <div className="rf-live-row">
          <span className={`rf-live-pill ${live ? 'rf-live-pill--on' : ''}`}>
            {live ? 'LIVE' : 'MONITOR OFF'}
          </span>
          {latencyMs != null && <span className="rf-latency">Monitor ~{latencyMs}ms</span>}
        </div>
        <div
          className="rf-meter rf-meter--smooth"
          role="meter"
          aria-valuenow={Math.round(meterWidthPct)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="rf-meter__fill" style={{ width: `${meterWidthPct}%` }} />
        </div>
      </div>

      <div className="rf-balance">
        <div className="rf-balance__labels">
          <span>More beat</span>
          <span>More vocal</span>
        </div>
        <input
          type="range"
          className="rf-balance__input"
          min={0}
          max={100}
          value={balance}
          onChange={(e) => onBalance(Number(e.target.value))}
          aria-label="Beat and vocal balance"
        />
      </div>

      <div className="rf-performance__tools">
        <label className="rf-tool">
          <span className="rf-tool__label">Count-in</span>
          <select className="rf-tool__select" value={countInBars} onChange={(e) => onCountInChange(Number(e.target.value))}>
            <option value={0}>Off</option>
            <option value={1}>1 bar</option>
            <option value={2}>2 bars</option>
          </select>
        </label>
        <label className="rf-tool rf-tool--toggle">
          <Toggle on={engine.monitoringOn} onChange={(v) => engine.setMonitoringEnabled(v)} ariaLabel="Hear yourself" />
          <span>Hear myself</span>
        </label>
        <label className="rf-tool">
          <span className="rf-tool__label">Monitor level</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(monitorVol * 100)}
            onChange={(e) => onMonitorVol(Number(e.target.value) / 100)}
            className="rf-tool__range"
          />
        </label>
        <button type="button" className={`rf-punch ${punchMode ? 'rf-punch--on' : ''}`} onClick={onPunchToggle}>
          Punch in
        </button>
      </div>

      <p className="rf-performance__tip">
        Under <strong>Song</strong>, tell RAP FACTORY what mic you are on — the chain matches phone, USB, or booth capture.
      </p>

      <div className="rf-transport-min">
        <button type="button" className="rf-transport-min__play" onClick={() => (engine.isPlaying ? engine.pauseBeat() : engine.playBeat())}>
          {engine.isPlaying ? 'Pause' : 'Play beat'}
        </button>
        <button type="button" className="rf-transport-min__rew" onClick={() => engine.seekBeat(0)}>
          Back to start
        </button>
      </div>
    </section>
  );
}
