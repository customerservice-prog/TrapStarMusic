import Toggle from './Toggle.jsx';

export default function VaultPerformance({
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
}) {
  const rec = engine.isRecording;
  const live = engine.monitoringOn && !engine.micDenied;

  return (
    <section className="vault-performance glass-panel" aria-label="Record and balance">
      <div className="vault-performance__center">
        <button
          type="button"
          className={`vault-rec-btn${rec ? ' vault-rec-btn--recording' : ''}${processing ? ' vault-rec-btn--wait' : ''}`}
          aria-label={rec ? 'Stop recording' : 'Start recording'}
          disabled={processing}
          onClick={onRecordToggle}
        >
          <span className="vault-rec-btn__ring" />
          <span className="vault-rec-btn__core" />
        </button>
        <div className="vault-performance__meta">
          <div className="vault-performance__line1">
            {processing ? 'Finishing your take…' : rec ? 'Recording' : 'Ready'}
          </div>
          <div className="vault-performance__line2">
            {selectedTrack?.label || 'Pick a layer'}
            {rec && <span className="vault-performance__timer">{fmtTime(recSec)}</span>}
          </div>
        </div>
      </div>

      <div className="vault-performance__monitor">
        <div className="vault-live-row">
          <span className={`vault-live-pill ${live ? 'vault-live-pill--on' : ''}`}>
            {live ? 'LIVE' : 'MONITOR OFF'}
          </span>
          {latencyMs != null && <span className="vault-latency">~{latencyMs}ms</span>}
        </div>
        <div className="vault-meter vault-meter--smooth" role="meter" aria-valuenow={Math.round(meterWidthPct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="vault-meter__fill" style={{ width: `${meterWidthPct}%` }} />
        </div>
      </div>

      <div className="vault-balance">
        <div className="vault-balance__labels">
          <span>More beat</span>
          <span>More vocal</span>
        </div>
        <input
          type="range"
          className="vault-balance__input"
          min={0}
          max={100}
          value={balance}
          onChange={(e) => onBalance(Number(e.target.value))}
          aria-label="Beat and vocal balance"
        />
      </div>

      <div className="vault-performance__tools">
        <label className="vault-tool">
          <span className="vault-tool__label">Count-in</span>
          <select className="vault-tool__select" value={countInBars} onChange={(e) => onCountInChange(Number(e.target.value))}>
            <option value={0}>Off</option>
            <option value={1}>1 bar</option>
            <option value={2}>2 bars</option>
          </select>
        </label>
        <label className="vault-tool vault-tool--toggle">
          <Toggle on={engine.monitoringOn} onChange={(v) => engine.setMonitoringEnabled(v)} ariaLabel="Hear yourself" />
          <span>Hear myself</span>
        </label>
        <label className="vault-tool">
          <span className="vault-tool__label">Monitor level</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(monitorVol * 100)}
            onChange={(e) => onMonitorVol(Number(e.target.value) / 100)}
            className="vault-tool__range"
          />
        </label>
        <button type="button" className={`vault-punch ${punchMode ? 'vault-punch--on' : ''}`} onClick={onPunchToggle}>
          Punch in
        </button>
      </div>

      <div className="vault-transport-min">
        <button type="button" className="vault-transport-min__play" onClick={() => (engine.isPlaying ? engine.pauseBeat() : engine.playBeat())}>
          {engine.isPlaying ? 'Pause' : 'Play beat'}
        </button>
        <button type="button" className="vault-transport-min__rew" onClick={() => engine.seekBeat(0)}>
          Back to start
        </button>
      </div>
    </section>
  );
}
