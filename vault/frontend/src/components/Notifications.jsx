import { useEffect } from 'react';
import { useStore } from '../hooks/useStore.jsx';

function ToastItem({ n, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(n.id), 3500);
    return () => clearTimeout(t);
  }, [n.id, onDismiss]);

  return (
    <div className={`toast ${n.level}`}>
      {n.title && <div className="toast-title">{n.title}</div>}
      <p className="toast-msg">{n.text}</p>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ marginTop: 8, padding: '4px 8px', fontSize: 11 }}
        onClick={() => onDismiss(n.id)}
      >
        Dismiss
      </button>
    </div>
  );
}

export default function Notifications() {
  const { notifications, dismiss } = useStore();

  return (
    <div className="toast-stack" aria-live="polite">
      {notifications.map((n) => (
        <ToastItem key={n.id} n={n} onDismiss={dismiss} />
      ))}
    </div>
  );
}
