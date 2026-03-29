import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import * as api from '../lib/api.js';
import {
  putPendingTakeRecord,
  getPendingTakeRecord,
  clearPendingTakeRecord,
} from '../lib/pendingTakeIdb.js';

const StoreContext = createContext(null);

const PENDING_KEY = 'rapfactory_pending_upload';

function loadPending() {
  try {
    let raw = localStorage.getItem(PENDING_KEY);
    if (!raw) raw = localStorage.getItem('vault_pending_upload');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePending(data) {
  if (!data) localStorage.removeItem(PENDING_KEY);
  else localStorage.setItem(PENDING_KEY, JSON.stringify(data));
}

const initial = {
  backendOnline: null,
  backendMessage: null,
  backendStatus: 'connecting',
  sessions: [],
  session: null,
  tracks: [],
  vibe: {
    cleanGritty: 50,
    naturalTuned: 50,
    drySpacious: 50,
    upfrontBlended: 50,
  },
  vocalMode: 'auto',
  engineToggles: {
    proSound: true,
    beatAwareness: true,
    autoTune: true,
    autoGroup: true,
    /** When on, Studio playback runs the Web Audio chain from each take’s chain_snapshot. */
    smartChainPlayback: true,
  },
  decisions: [],
  recentDecisionsGlobal: [],
  beatAnalysis: null,
  notifications: [],
  savedFlash: false,
  studioTab: 'record',
  voiceProfile: null,
};

const ENGINE_TOGGLES_KEY = 'rapfactory_engine_toggles';

function readEngineTogglesFromStorage() {
  if (typeof localStorage === 'undefined') return null;
  try {
    let raw = localStorage.getItem(ENGINE_TOGGLES_KEY);
    if (!raw) raw = localStorage.getItem('vault_engine_toggles');
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return o;
  } catch {
    return null;
  }
}

function getInitialState() {
  const stored = readEngineTogglesFromStorage();
  return {
    ...initial,
    engineToggles: stored ? { ...initial.engineToggles, ...stored } : initial.engineToggles,
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_BACKEND':
      return {
        ...state,
        backendOnline: action.ok,
        backendMessage: action.message ?? null,
        backendStatus: action.ok ? 'ready' : action.ok === false ? 'offline' : 'connecting',
      };
    case 'SET_SESSIONS':
      return { ...state, sessions: action.sessions };
    case 'SET_SESSION':
      return { ...state, session: action.session };
    case 'SET_TRACKS':
      return { ...state, tracks: action.tracks };
    case 'SET_VIBE':
      return { ...state, vibe: { ...state.vibe, ...action.vibe } };
    case 'SET_DECISIONS':
      return { ...state, decisions: action.decisions };
    case 'SET_BEAT_ANALYSIS':
      return { ...state, beatAnalysis: action.beatAnalysis };
    case 'PUSH_NOTIFY':
      return {
        ...state,
        notifications: [
          ...state.notifications,
          {
            id: crypto.randomUUID(),
            level: action.level || 'info',
            title: action.title,
            text: action.text,
          },
        ].slice(-12),
      };
    case 'DISMISS_NOTIFY':
      return {
        ...state,
        notifications: state.notifications.filter((n) => n.id !== action.id),
      };
    case 'SAVED_FLASH':
      return { ...state, savedFlash: action.on };
    case 'SET_STUDIO_TAB':
      return { ...state, studioTab: action.tab };
    case 'SET_VOICE_PROFILE':
      return { ...state, voiceProfile: action.profile };
    case 'SET_VOCAL_MODE':
      return { ...state, vocalMode: action.mode };
    case 'SET_ENGINE_TOGGLE':
      return {
        ...state,
        engineToggles: { ...state.engineToggles, [action.key]: action.value },
      };
    case 'SET_RECENT_GLOBAL':
      return { ...state, recentDecisionsGlobal: action.rows };
    default:
      return state;
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, getInitialState);
  const pendingRef = useRef(loadPending());
  const failedBlobRef = useRef(null);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(ENGINE_TOGGLES_KEY, JSON.stringify(state.engineToggles));
    } catch {
      /* */
    }
  }, [state.engineToggles]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rec = await getPendingTakeRecord();
        if (cancelled || !rec?.blob) return;
        failedBlobRef.current = rec.blob;
        pendingRef.current = {
          trackId: rec.trackId,
          sessionId: rec.sessionId,
          metadata: rec.metadata,
          filename: rec.filename,
          at: rec.at,
        };
        savePending(pendingRef.current);
      } catch {
        /* IDB unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onBefore = (e) => {
      if (pendingRef.current || loadPending()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, []);

  const notify = useCallback((a, level = 'info') => {
    if (typeof a === 'string') {
      dispatch({ type: 'PUSH_NOTIFY', text: a, level });
    } else if (a && typeof a === 'object') {
      dispatch({
        type: 'PUSH_NOTIFY',
        title: a.title,
        text: a.text || a.message || '',
        level: a.level || level,
      });
    }
  }, []);

  const dismiss = useCallback((id) => {
    dispatch({ type: 'DISMISS_NOTIFY', id });
  }, []);

  const checkBackend = useCallback(async () => {
    try {
      const h = await api.health();
      const ok = h.ok && h.data?.healthy === true;
      dispatch({
        type: 'SET_BACKEND',
        ok,
        message: ok ? null : 'RAP FACTORY backend offline — start the server (default port 3001).',
      });
      return ok;
    } catch {
      dispatch({
        type: 'SET_BACKEND',
        ok: false,
        message: 'Backend offline — make sure the server is running (port 3001).',
      });
      return false;
    }
  }, []);

  const loadSessions = useCallback(async () => {
    if (!(await checkBackend())) return;
    try {
      const data = await api.listSessions();
      if (Array.isArray(data)) dispatch({ type: 'SET_SESSIONS', sessions: data });
      else notify(data.error || 'Could not load sessions', 'warn');
    } catch (e) {
      notify(e.message || 'Network error', 'warn');
    }
  }, [checkBackend, notify]);

  const loadSession = useCallback(
    async (id) => {
      if (!(await checkBackend())) return null;
      try {
        const s = await api.getSession(id);
        if (s.error) {
          notify(s.error, 'warn');
          return null;
        }
        dispatch({ type: 'SET_SESSION', session: s });
        return s;
      } catch (e) {
        notify(e.message, 'warn');
        return null;
      }
    },
    [checkBackend, notify]
  );

  const loadTracks = useCallback(
    async (sessionId) => {
      if (!sessionId) return;
      try {
        const data = await api.listTracks(sessionId);
        if (Array.isArray(data)) dispatch({ type: 'SET_TRACKS', tracks: data });
        else notify(data.error || 'Tracks failed', 'warn');
      } catch (e) {
        notify(e.message, 'warn');
      }
    },
    [notify]
  );

  const loadDecisions = useCallback(
    async (sessionId) => {
      if (!sessionId) return;
      try {
        const data = await api.getEngineDecisions(sessionId);
        if (Array.isArray(data)) dispatch({ type: 'SET_DECISIONS', decisions: data });
        const beat = data.find((d) => d.decision_type === 'beat_analysis');
        if (beat?.payload) dispatch({ type: 'SET_BEAT_ANALYSIS', beatAnalysis: beat.payload });
      } catch (_) {}
    },
    []
  );

  const createSession = useCallback(
    async (body) => {
      try {
        const s = await api.createSession(body);
        if (s.error) {
          notify(s.error, 'warn');
          return null;
        }
        await loadSessions();
        return s;
      } catch (e) {
        notify(e.message, 'warn');
        return null;
      }
    },
    [loadSessions, notify]
  );

  const uploadBeatApi = useCallback(
    async (sessionId, file) => {
      try {
        const r = await api.uploadBeat(sessionId, file);
        if (r.error) {
          notify(r.error, 'warn');
          return null;
        }
        if (r.session) dispatch({ type: 'SET_SESSION', session: r.session });
        if (r.analysis) dispatch({ type: 'SET_BEAT_ANALYSIS', beatAnalysis: r.analysis });
        await loadDecisions(sessionId);
        notify('Beat locked in.', 'success');
        return r;
      } catch (e) {
        notify(e.message, 'warn');
        return null;
      }
    },
    [loadDecisions, notify]
  );

  const patchSession = useCallback(
    async (id, body) => {
      try {
        const s = await api.patchSession(id, body);
        if (s.error) {
          notify(s.error, 'warn');
          return null;
        }
        dispatch({ type: 'SET_SESSION', session: s });
        return s;
      } catch (e) {
        notify(e.message, 'warn');
        return null;
      }
    },
    [notify]
  );

  const snapshot = useCallback(
    async (sessionId, label = 'autosave') => {
      if (!sessionId || typeof sessionId !== 'string') return false;
      try {
        const r = await api.saveSnapshot(sessionId, label);
        if (r.error) {
          notify(`Save failed: ${r.error}`, 'warn');
          return false;
        }
        dispatch({ type: 'SAVED_FLASH', on: true });
        setTimeout(() => dispatch({ type: 'SAVED_FLASH', on: false }), 1200);
        return true;
      } catch (e) {
        notify(`Save failed: ${e.message}`, 'warn');
        return false;
      }
    },
    [notify]
  );

  const restoreVersion = useCallback(
    async (sessionId, versionId) => {
      try {
        const r = await api.restoreVersion(sessionId, versionId);
        if (r.error) {
          notify(r.error, 'warn');
          return false;
        }
        dispatch({ type: 'SET_SESSION', session: r.session });
        await loadTracks(sessionId);
        notify('Version restored.', 'success');
        return true;
      } catch (e) {
        notify(e.message, 'warn');
        return false;
      }
    },
    [loadTracks, notify]
  );

  const createTrack = useCallback(
    async (sessionId, label, track_type = 'main') => {
      try {
        const t = await api.createTrack(sessionId, { label, track_type });
        if (t.error) {
          notify(t.error, 'warn');
          return null;
        }
        await loadTracks(sessionId);
        return t;
      } catch (e) {
        notify(e.message, 'warn');
        return null;
      }
    },
    [loadTracks, notify]
  );

  const patchTrackFields = useCallback(
    async (trackId, body, sessionId) => {
      try {
        const r = await api.patchTrack(trackId, body);
        if (r.error) notify(r.error, 'warn');
        else if (sessionId) await loadTracks(sessionId);
        return r;
      } catch (e) {
        notify(e.message, 'warn');
        return null;
      }
    },
    [loadTracks, notify]
  );

  const removeTrack = useCallback(
    async (trackId, sessionId) => {
      try {
        const r = await api.deleteTrack(trackId);
        if (r.error) {
          notify(r.error, 'warn');
          return;
        }
        await loadTracks(sessionId);
      } catch (e) {
        notify(e.message, 'warn');
      }
    },
    [loadTracks, notify]
  );

  const setActiveTake = useCallback(
    async (trackId, takeId, sessionId) => {
      try {
        const r = await api.patchTrack(trackId, { active_take_id: takeId });
        if (r.error) notify(r.error, 'warn');
        else await loadTracks(sessionId);
      } catch (e) {
        notify(e.message, 'warn');
      }
    },
    [loadTracks, notify]
  );

  const uploadTakeWithRetry = useCallback(
    async (trackId, blob, metadata, sessionId, filename, opts = {}) => {
      try {
        const r = await api.uploadTake(trackId, blob, metadata, filename);
        if (r.error) throw new Error(r.error);
        savePending(null);
        pendingRef.current = null;
        failedBlobRef.current = null;
        await clearPendingTakeRecord().catch(() => {});
        await loadTracks(sessionId);
        snapshot(sessionId, 'post-take').catch(() => {});
        const layer = opts.layerLabel;
        notify(
          layer
            ? {
                title: `${layer} take saved`,
                text: 'Smart Engine updated this layer. Auto-save will keep the session current.',
              }
            : { title: 'Take saved', text: 'Smart Engine updated the chain for this session.' },
          'success'
        );
        try {
          const p = await api.getVoiceProfile();
          if (!p.error) dispatch({ type: 'SET_VOICE_PROFILE', profile: p });
        } catch {
          /* ignore */
        }
        return r;
      } catch (e) {
        failedBlobRef.current = blob;
        pendingRef.current = {
          trackId,
          sessionId,
          metadata,
          filename,
          at: Date.now(),
          size: blob.size,
        };
        savePending(pendingRef.current);
        putPendingTakeRecord({
          blob,
          trackId,
          sessionId,
          metadata,
          filename: filename || 'take.webm',
          at: pendingRef.current.at,
        }).catch(() => {});
        notify(
          {
            title: 'Take saved locally',
            text: "We'll retry when you're back online — tap Retry upload or wait for connection.",
          },
          'warn'
        );
        throw e;
      }
    },
    [loadTracks, notify, snapshot]
  );

  const retryPendingUpload = useCallback(async () => {
    const p = pendingRef.current || loadPending();
    const blob = failedBlobRef.current;
    if (!p || !blob) {
      notify('Nothing to retry (recording was not kept — stay on this page after a failed upload).', 'info');
      return;
    }
    try {
      notify({ title: 'Retrying upload', text: 'Sending your saved take…' }, 'info');
      const r = await api.uploadTake(p.trackId, blob, p.metadata, p.filename || 'take.webm');
      if (r.error) throw new Error(r.error);
      savePending(null);
      pendingRef.current = null;
      failedBlobRef.current = null;
      await clearPendingTakeRecord().catch(() => {});
      await loadTracks(p.sessionId);
      snapshot(p.sessionId, 'post-take').catch(() => {});
      notify('Queued take uploaded.', 'success');
    } catch (e) {
      notify(e.message, 'warn');
    }
  }, [loadTracks, notify, snapshot]);

  useEffect(() => {
    const onOnline = () => {
      if (pendingRef.current && failedBlobRef.current) {
        retryPendingUpload();
      }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [retryPendingUpload]);

  const runSmartComp = useCallback(
    async (trackId, sessionId) => {
      try {
        const r = await api.smartComp(trackId);
        if (r.bestId) {
          await api.patchTrack(trackId, { active_take_id: r.bestId });
          await loadTracks(sessionId);
          notify('Smart Comp picked the strongest take.', 'success');
        } else notify('Need more than one take to comp.', 'info');
      } catch (e) {
        notify(e.message, 'warn');
      }
    },
    [loadTracks, notify]
  );

  const exportMix = useCallback(
    async (sessionId, mode) => {
      try {
        const r = await api.exportSession(sessionId, mode);
        if (r.downloadUrl) {
          const name = r.suggestedFilename || r.downloadUrl.split('/').pop() || 'rap-factory-export.wav';
          api.triggerBrowserDownload(r.downloadUrl, name);
          notify({ title: 'Export ready', text: 'Your bounce is in your downloads folder.' }, 'success');
          return r;
        }
        if (r.stems?.length) {
          notify(r.message || 'Download stems from each track.', 'info');
        } else if (r.error) notify(r.error, 'warn');
        return r;
      } catch (e) {
        notify(e.message, 'warn');
        return null;
      }
    },
    [notify]
  );

  const loadVoiceProfile = useCallback(async () => {
    try {
      const p = await api.getVoiceProfile();
      if (!p.error) dispatch({ type: 'SET_VOICE_PROFILE', profile: p });
    } catch (_) {}
  }, []);

  const resetProfile = useCallback(async () => {
    try {
      const p = await api.resetVoiceProfile();
      if (!p.error) {
        dispatch({ type: 'SET_VOICE_PROFILE', profile: p });
        notify('Sound profile reset.', 'success');
      }
    } catch (e) {
      notify(e.message, 'warn');
    }
  }, [notify]);

  const setVibe = useCallback((v) => {
    dispatch({ type: 'SET_VIBE', vibe: v });
  }, []);

  const setStudioTab = useCallback((tab) => {
    dispatch({ type: 'SET_STUDIO_TAB', tab });
  }, []);

  const setVocalMode = useCallback((mode) => {
    dispatch({ type: 'SET_VOCAL_MODE', mode });
  }, []);

  const setEngineToggle = useCallback((key, value) => {
    dispatch({ type: 'SET_ENGINE_TOGGLE', key, value });
  }, []);

  const loadRecentDecisionsGlobal = useCallback(async () => {
    try {
      const data = await api.getRecentDecisions(12);
      if (Array.isArray(data)) dispatch({ type: 'SET_RECENT_GLOBAL', rows: data });
    } catch (_) {}
  }, []);

  const deleteSessionApi = useCallback(
    async (sessionId) => {
      try {
        const r = await api.deleteSession(sessionId);
        if (r.error) {
          notify(r.error, 'warn');
          return false;
        }
        await loadSessions();
        notify({ title: 'Removed', text: 'Session deleted.' }, 'success');
        return true;
      } catch (e) {
        notify(e.message, 'warn');
        return false;
      }
    },
    [loadSessions, notify]
  );

  const value = useMemo(
    () => ({
      ...state,
      dispatch,
      notify,
      dismiss,
      checkBackend,
      loadSessions,
      loadSession,
      loadTracks,
      loadDecisions,
      createSession,
      uploadBeatApi,
      patchSession,
      snapshot,
      restoreVersion,
      createTrack,
      removeTrack,
      patchTrackFields,
      setActiveTake,
      uploadTakeWithRetry,
      retryPendingUpload,
      pendingUploadMeta: pendingRef.current,
      hasFailedBlob: () => !!failedBlobRef.current,
      runSmartComp,
      exportMix,
      loadVoiceProfile,
      resetProfile,
      setVibe,
      setStudioTab,
      setVocalMode,
      setEngineToggle,
      loadRecentDecisionsGlobal,
      deleteSessionApi,
    }),
    [
      state,
      notify,
      dismiss,
      checkBackend,
      loadSessions,
      loadSession,
      loadTracks,
      loadDecisions,
      createSession,
      uploadBeatApi,
      patchSession,
      snapshot,
      restoreVersion,
      createTrack,
      removeTrack,
      patchTrackFields,
      setActiveTake,
      uploadTakeWithRetry,
      runSmartComp,
      exportMix,
      loadVoiceProfile,
      resetProfile,
      setVibe,
      setStudioTab,
      setVocalMode,
      setEngineToggle,
      loadRecentDecisionsGlobal,
      deleteSessionApi,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside provider');
  return ctx;
}
