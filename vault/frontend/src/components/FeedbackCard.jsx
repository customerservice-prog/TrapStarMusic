function gradeStyle(grade) {
  const g = (grade || '').toLowerCase();
  if (g.includes('great')) return { border: '1px solid #3ddd8833', icon: '★', color: 'var(--green)' };
  if (g.includes('good')) return { border: '1px solid #c9a84c33', icon: '✓', color: 'var(--gold2)' };
  if (g.includes('grow') || g.includes('redo')) return { border: '1px solid #ff444433', icon: '⚠', color: 'var(--red)' };
  return { border: '1px solid #c9a84c33', icon: '⚡', color: 'var(--gold2)' };
}

export default function FeedbackCard({ grade, detail, onDismiss, onCompare }) {
  if (!grade) return null;
  const st = gradeStyle(grade);
  return (
    <div
      className="feedback-card-spec card-spec"
      style={{
        position: 'relative',
        padding: 14,
        marginTop: 12,
        background: 'var(--bg4)',
        border: st.border,
      }}
    >
      {onDismiss && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ position: 'absolute', top: 8, right: 8, padding: '2px 6px', fontSize: 14 }}
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
      <div style={{ fontSize: 20, color: st.color, marginBottom: 6 }}>{st.icon}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{grade}</div>
      <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>{detail}</p>
      {onCompare && (
        <button type="button" className="btn btn-ghost" style={{ marginTop: 10, fontSize: 11, fontWeight: 600, color: 'var(--gold2)', padding: 0 }}>
          Compare takes →
        </button>
      )}
    </div>
  );
}
