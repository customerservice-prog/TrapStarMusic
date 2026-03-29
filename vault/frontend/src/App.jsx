import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useStore } from './hooks/useStore.jsx';
import Nav from './components/Nav.jsx';
import Notifications from './components/Notifications.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Studio from './pages/Studio.jsx';
import ExportPage from './pages/ExportPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import NewSession from './pages/NewSession.jsx';

function AppMain() {
  const loc = useLocation();
  return (
    <main key={loc.pathname} className="app-main">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/new" element={<NewSession />} />
        <Route path="/studio/:id" element={<Studio />} />
        <Route path="/export/:id" element={<ExportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}

export default function App() {
  const { checkBackend, backendOnline, backendMessage } = useStore();

  useEffect(() => {
    checkBackend();
    const t = setInterval(() => checkBackend(), 10000);
    return () => clearInterval(t);
  }, [checkBackend]);

  return (
    <>
      {backendOnline === false && backendMessage && (
        <div className="offline-banner" role="alert">
          {backendMessage}
        </div>
      )}
      <Nav />
      <Notifications />
      <AppMain />
    </>
  );
}
