import { useNavigate, useLocation, useMatch } from 'react-router-dom';
import { useStore } from '../hooks/useStore.jsx';
import BrandLogo from './BrandLogo.jsx';

export default function Nav() {
  const nav = useNavigate();
  const loc = useLocation();
  const studioMatch = useMatch('/studio/:id');
  const exportMatch = useMatch('/export/:id');
  const { backendOnline, backendStatus, savedFlash, session } = useStore();

  const sessionId = studioMatch?.params?.id || exportMatch?.params?.id || null;
  const sessionName = sessionId && session?.id === sessionId ? session.name : null;

  const tab = (path, label, active) => (
    <button
      type="button"
      className={`nav-tab ${active ? 'active' : ''}`}
      onClick={() => nav(path)}
    >
      {label}
    </button>
  );

  const statusLabel =
    backendStatus === 'ready' ? 'READY' : backendStatus === 'offline' ? 'OFFLINE' : 'CONNECTING';

  return (
    <header className="nav-root">
      <button type="button" className="nav-logo nav-logo--brand" onClick={() => nav('/')}>
        <BrandLogo variant="nav" />
        <span className="nav-logo__wordmark">Rap Factory</span>
      </button>
      <nav className="nav-tabs" aria-label="Main">
        {tab('/', 'Sessions', loc.pathname === '/' || loc.pathname === '/new')}
        <button
          type="button"
          className={`nav-tab ${loc.pathname.startsWith('/studio/') ? 'active' : ''}`}
          disabled={!sessionId}
          onClick={() => sessionId && nav(`/studio/${sessionId}`)}
        >
          Studio
        </button>
        <button
          type="button"
          className={`nav-tab ${loc.pathname.startsWith('/export/') ? 'active' : ''}`}
          disabled={!sessionId}
          onClick={() => sessionId && nav(`/export/${sessionId}`)}
        >
          Export
        </button>
        {tab('/settings', 'Settings', loc.pathname === '/settings')}
      </nav>
      <div className="nav-status">
        <span
          className={`status-dot ${backendOnline ? 'ok' : backendOnline === false ? 'bad' : 'wait'}`}
          title={backendOnline ? 'Connected' : 'Disconnected'}
        />
        <span className="status-text">{statusLabel}</span>
        {sessionName && <span className="nav-session-name">{sessionName}</span>}
        <span className={`saved-pill ${savedFlash ? 'on' : ''}`}>SAVED</span>
      </div>
    </header>
  );
}
