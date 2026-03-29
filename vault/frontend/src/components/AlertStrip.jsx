export default function AlertStrip({ alert, onDismiss, onFix }) {
  if (!alert) return null;
  const err = alert.severity === 'error';
  return (
    <div className={`alert-strip-spec ${err ? 'error' : 'warning'}`} role="alert">
      <span style={{ fontSize: 16 }}>{err ? '!' : '⚠'}</span>
      <span style={{ flex: 1, fontSize: 12, color: err ? '#ffb4b4' : 'var(--text2)' }}>{alert.message}</span>
      {onFix && (
        <button type="button" className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={onFix}>
          Fix It
        </button>
      )}
      <button type="button" className="btn btn-ghost" style={{ fontSize: 14, padding: '4px 8px' }} onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
