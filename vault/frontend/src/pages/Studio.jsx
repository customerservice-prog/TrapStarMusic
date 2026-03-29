import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../hooks/useStore.jsx';
import { useAudioEngine } from '../hooks/useAudioEngine.js';
import * as api from '../lib/api.js';
import {
  vocalModeToTrackType,
  VOCAL_LANE_PRESETS,
  nextLaneLabel,
  suggestedVocalModeForTrackType,
} from '../lib/vibeMap.js';
import { trackTypeLabel } from '../lib/layerPalette.js';
import TrackRow from '../components/TrackRow.jsx';
import AlertStrip from '../components/AlertStrip.jsx';
import StudioArrangement from '../components/StudioArrangement.jsx';
import StudioPerformance from '../components/StudioPerformance.jsx';
import StudioSmartEngine from '../components/StudioSmartEngine.jsx';
import StudioMixerStrip from '../components/StudioMixerStrip.jsx';
import MidiPianoRollModal from '../components/MidiPianoRollModal.jsx';
import MicSourcePicker from '../components/MicSourcePicker.jsx';
import StockBeatsPicker from '../components/StockBeatsPicker.jsx';
import { parseClips, defaultAudioClip, defaultMidiClip, clipsToJson } from '../lib/trackClips.js';

function useNarrowWaveform() {
  const [n, setN] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 480px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 480px)');
    const fn = () => setN(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return n;
}

function barDurationSec(bpm) {
  const b = Math.max(72, Number(bpm) || 140);
  return (60 / b) * 4;
}

function fmtTime(sec) {
  if (sec == null || Number.isNaN(sec)) return '0:00.0';
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  const whole = Math.floor(r);
  const dec = Math.floor((r - whole) * 10);
  return `${m}:${whole.toString().padStart(2, '0')}.${dec}`;
}

export default function Studio() {
  const { id } = useParams();
  const {
    session,
    tracks,
    vibe,
    setVibe,
    vocalMode,
    setVocalMode,
    loadSession,
    loadTracks,
    loadDecisions,
    createTrack,
    uploadBeatApi,
    patchSession,
    uploadTakeWithRetry,
    removeTrack,
    snapshot,
    notify,
    restoreVersion,
    setActiveTake,
    runSmartComp,
    patchTrackFields,
    studioTab,
    setStudioTab,
    retryPendingUpload,
    hasFailedBlob,
    engineToggles,
  } = useStore();

  const engine = useAudioEngine();
  const { initMic, loadBeatFromUrl, playBeat } = engine;
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const [monitorVol, setMonitorVol] = useState(0.85);
  const [beatVocalBalance, setBeatVocalBalance] = useState(48);
  const [punchMode, setPunchMode] = useState(false);
  const [punchPoints, setPunchPoints] = useState([]);
  const [punchRange, setPunchRange] = useState(null);
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [lastFeedback, setLastFeedback] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionOpen, setVersionOpen] = useState(false);
  const [playingMap, setPlayingMap] = useState({});
  const [processing, setProcessing] = useState(false);
  const [alert, setAlert] = useState(null);
  const [recSec, setRecSec] = useState(0);
  const [countInBars, setCountInBars] = useState(0);
  const [soloTrackId, setSoloTrackId] = useState(null);
  const [midiModal, setMidiModal] = useState(null);
  const meterAccumRef = useRef([]);
  const seededClipsRef = useRef(new Set());
  const micDeniedToastRef = useRef(false);
  const micLostToastRef = useRef(false);
  const recordStartRef = useRef(0);
  const recTimerRef = useRef(null);
  const beatTimeFnRef = useRef(() => 0);
  /** After stock-beat upload, play once `loadBeatFromUrl` in the effect below finishes. */
  const stockBeatAutoplayRef = useRef(false);
  const smoothMeterRef = useRef(0);
  const [meterSmooth, setMeterSmooth] = useState(0);
  beatTimeFnRef.current = () => engine.getBeatTime();

  const selectedTrack = useMemo(
    () => tracks.find((t) => t.id === selectedTrackId) || tracks[0],
    [tracks, selectedTrackId]
  );

  const narrowWave = useNarrowWaveform();

  const setStockBeatAutoplayArm = useCallback((v) => {
    stockBeatAutoplayRef.current = !!v;
  }, []);

  useEffect(() => {
    const t = beatVocalBalance / 100;
    const beatVol = 0.26 + (1 - t) * 0.74;
    engine.setBeatVolume(beatVol);
  }, [beatVocalBalance, engine]);

  useEffect(() => {
    let raf;
    const tick = () => {
      const target = engine.meter;
      smoothMeterRef.current += (target - smoothMeterRef.current) * 0.18;
      setMeterSmooth(smoothMeterRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  useEffect(() => {
    if (tracks.length && !selectedTrackId) {
      setSelectedTrackId(tracks[0].id);
    }
  }, [tracks, selectedTrackId]);

  useEffect(() => {
    engineRef.current.setMonitorGain(monitorVol);
  }, [monitorVol]);

  useEffect(() => {
    try {
      localStorage.setItem('rapfactory_last_session_id', id);
    } catch {
      /* */
    }
  }, [id]);

  useEffect(() => {
    const iv = setInterval(() => {
      try {
        sessionStorage.setItem('rapfactory_mic_peak', String(engine.meter));
        const ms = engine.estimateMonitorLatencyMs();
        if (ms != null) sessionStorage.setItem('rapfactory_latency_ms', String(ms));
      } catch {
        /* */
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [engine]);

  useEffect(() => {
    setStudioTab('record');
  }, [id, setStudioTab]);

  useEffect(() => {
    seededClipsRef.current = new Set();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    tracks.forEach((t) => {
      const key = `${id}:${t.id}`;
      if (seededClipsRef.current.has(key)) return;
      const raw = t.clips_json;
      if (raw != null && String(raw).trim() !== '' && String(raw).trim() !== '[]') {
        seededClipsRef.current.add(key);
        return;
      }
      seededClipsRef.current.add(key);
      if (t.track_type === 'midi') {
        patchTrackFields(
          t.id,
          { clips_json: clipsToJson([defaultMidiClip(0, Math.min(8, engine.beatDuration || 4))]) },
          id
        );
        return;
      }
      if (!t.active_take_id) return;
      const take = (t.takes || []).find((x) => x.id === t.active_take_id);
      const d = take?.duration_ms ? take.duration_ms / 1000 : Math.min(12, engine.beatDuration || 8);
      patchTrackFields(t.id, { clips_json: clipsToJson([defaultAudioClip(t.active_take_id, d)]) }, id);
    });
  }, [id, tracks, engine.beatDuration, patchTrackFields]);

  useEffect(() => {
    micDeniedToastRef.current = false;
    micLostToastRef.current = false;
  }, [id]);

  useEffect(() => {
    if (!engine.micHardwareLost) {
      micLostToastRef.current = false;
      return;
    }
    if (micLostToastRef.current) return;
    micLostToastRef.current = true;
    notify(
      {
        title: 'Microphone stopped',
        text: 'Your mic disconnected or browser access ended. Reconnect, reload the page, then allow the mic again before you record.',
      },
      'warn'
    );
  }, [engine.micHardwareLost, notify]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadSession(id);
      await loadTracks(id);
      await loadDecisions(id);
      if (cancelled) return;
      const mic = await initMic();
      if (cancelled) return;
      if (mic.ok || !mic.denied) return;
      if (micDeniedToastRef.current) return;
      micDeniedToastRef.current = true;
      notify(
        {
          title: 'Microphone blocked',
          text: 'Mic blocked — allow access in the address bar, then reload RAP FACTORY.',
        },
        'warn'
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [id, loadSession, loadTracks, loadDecisions, initMic, notify]);

  useEffect(() => {
    if (!id) return undefined;
    const t = setInterval(() => snapshot(id, 'autosave'), 30000);
    return () => clearInterval(t);
  }, [id, snapshot]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session?.beat_filename) return;
      try {
        await loadBeatFromUrl(api.beatFileUrl(session.id));
        if (cancelled) return;
        if (stockBeatAutoplayRef.current) {
          stockBeatAutoplayRef.current = false;
          await playBeat(0);
        }
      } catch (e) {
        stockBeatAutoplayRef.current = false;
        notify(e?.message || 'Could not load your beat — try another file or re-upload.', 'warn');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.beat_filename, session?.beat_uploaded_at, session?.id, loadBeatFromUrl, playBeat, notify]);

  useEffect(() => {
    if (session?.punch_in_start != null && session?.punch_in_end != null) {
      setPunchRange({ start: session.punch_in_start, end: session.punch_in_end });
    }
  }, [session?.punch_in_start, session?.punch_in_end]);

  useEffect(() => {
    if (engine.meter > 0.95) {
      setAlert({ severity: 'warning', message: 'Ease off the mic a touch — you are close to clipping.' });
    }
  }, [engine.meter]);

  useEffect(() => {
    if (engine.monitorNote) {
      setAlert({ severity: 'warning', message: engine.monitorNote });
    }
  }, [engine.monitorNote]);

  useEffect(() => {
    if (engine.isRecording) {
      recordStartRef.current = Date.now();
      recTimerRef.current = setInterval(() => {
        setRecSec((Date.now() - recordStartRef.current) / 1000);
      }, 100);
    } else {
      clearInterval(recTimerRef.current);
      setRecSec(0);
    }
    return () => clearInterval(recTimerRef.current);
  }, [engine.isRecording]);

  const openVersions = async () => {
    const v = await api.listVersions(id);
    if (Array.isArray(v)) setVersions(v.slice(0, 5));
    setVersionOpen(true);
  };

  const onBeatFile = async (file) => {
    try {
      await engine.decodeFile(file);
      await uploadBeatApi(id, file);
    } catch (e) {
      notify(e?.message || 'That file could not be loaded as audio.', 'warn');
    }
  };

  const punchClick = async (t) => {
    if (!punchMode) {
      engine.seekBeat(t);
      return;
    }
    const next = [...punchPoints, t].slice(-2);
    setPunchPoints(next);
    if (next.length === 2) {
      const a = Math.min(next[0], next[1]);
      const b = Math.max(next[0], next[1]);
      setPunchRange({ start: a, end: b });
      await patchSession(id, { punch_in_start: a, punch_in_end: b });
    }
  };

  const startRecordFlow = async () => {
    if (selectedTrack && selectedTrack.track_type !== 'midi') {
      const modeLayer = vocalModeToTrackType(vocalMode);
      if (vocalMode === 'auto' || modeLayer !== selectedTrack.track_type) {
        setVocalMode(suggestedVocalModeForTrackType(selectedTrack.track_type));
      }
    }
    engine.stopAllVocalTracks();
    setPlayingMap({});
    meterAccumRef.current = [];
    const usePunch = punchRange && punchRange.end > punchRange.start;
    if (usePunch) {
      await engine.startRecording({
        punch: true,
        punchStart: punchRange.start,
        punchEnd: punchRange.end,
      });
    } else {
      if (!engine.isPlaying) await engine.playBeat();
      if (countInBars > 0) {
        const waitMs = barDurationSec(session?.bpm) * countInBars * 1000;
        await new Promise((r) => setTimeout(r, waitMs));
      }
      await engine.startRecording({});
    }
  };

  const stopRecordFlow = async () => {
    const usePunch = punchRange && punchRange.end > punchRange.start;
    setProcessing(true);
    const blob = await engine.stopRecording({ punch: usePunch, applyFades: usePunch });
    const durationMs = Date.now() - recordStartRef.current;
    const avgMeter =
      meterAccumRef.current.length > 0
        ? meterAccumRef.current.reduce((a, b) => a + b, 0) / meterAccumRef.current.length
        : engine.meter;
    if (durationMs > 900 && avgMeter < 0.02) {
      notify(
        {
          title: 'Very low input level',
          text: 'The meter barely moved — check the mic or input. The take was still saved.',
        },
        'warn'
      );
    }
    const meta = {
      durationMs,
      energyRms: avgMeter,
      peakDb: -10 - (1 - avgMeter) * 20,
      timingScore: 0.55 + avgMeter * 0.35,
    };

    if (selectedTrack?.track_type === 'midi') {
      notify(
        {
          title: 'Pick a vocal lane',
          text: 'MIDI lanes are for patterns — select lead, double, adlib, or harmony to print a vocal take.',
        },
        'warn'
      );
      setProcessing(false);
      return;
    }

    let tr;
    if (selectedTrack && selectedTrack.track_type !== 'midi') {
      tr = selectedTrack;
    } else {
      const tt = vocalModeToTrackType(vocalMode);
      const defaults = { main: 'Lead', double: 'Double', adlib: 'Adlib', harmony: 'Harmony' };
      const label = nextLaneLabel(tracks, tt, defaults[tt] || 'Vocal');
      tr = await createTrack(id, label, tt);
      if (!tr?.id) {
        setProcessing(false);
        return;
      }
      setSelectedTrackId(tr.id);
    }

    const fname = blob.type?.includes('wav') ? 'take.wav' : 'take.webm';
    try {
      const r = await uploadTakeWithRetry(tr.id, blob, meta, id, fname, {
        layerLabel: trackTypeLabel(tr.track_type),
      });
      if (r?.feedback) setLastFeedback(r.feedback);
      setSelectedTrackId(tr.id);
    } catch {
      /* notified */
    }
    setProcessing(false);
  };

  useEffect(() => {
    if (!engine.isRecording) return;
    const idt = setInterval(() => meterAccumRef.current.push(engine.meter), 80);
    return () => clearInterval(idt);
  }, [engine.isRecording, engine.meter]);

  const toggleTrackPlay = async (track) => {
    if (playingMap[track.id]) {
      engine.stopVocalTrack(track.id);
      setPlayingMap((m) => ({ ...m, [track.id]: false }));
      return;
    }
    const clips = parseClips(track);
    const midiClip = clips.find((c) => c.kind === 'midi');
    const audioClip =
      clips.find((c) => c.kind === 'audio' && (!c.takeId || c.takeId === track.active_take_id)) ||
      clips.find((c) => c.kind === 'audio');
    const soloedOut = soloTrackId != null && soloTrackId !== track.id;

    try {
      if (track.track_type === 'midi' && midiClip) {
        await engine.playMidiClip({
          trackId: track.id,
          clip: midiClip,
          volume: track.volume != null ? Number(track.volume) : 1,
          muted: !!track.muted || soloedOut,
          onEnded: () => setPlayingMap((m) => ({ ...m, [track.id]: false })),
        });
        setPlayingMap((m) => ({ ...m, [track.id]: true }));
        return;
      }
      const takeId = audioClip?.takeId || track.active_take_id;
      if (!takeId) {
        notify({ title: 'Nothing to play', text: 'Record a take on this layer first.' }, 'info');
        return;
      }
      await engine.playVocalTrack({
        trackId: track.id,
        takeId,
        url: api.takeAudioUrl(track.id, takeId),
        volume: track.volume != null ? Number(track.volume) : 1,
        muted: !!track.muted || soloedOut,
        trimStart: audioClip?.trimStart ?? 0,
        trimEnd: audioClip?.trimEnd ?? 0,
        pan: track.pan != null ? Number(track.pan) : 0,
        eqLow: track.eq_low != null ? Number(track.eq_low) : 0.5,
        eqMid: track.eq_mid != null ? Number(track.eq_mid) : 0.5,
        eqHigh: track.eq_high != null ? Number(track.eq_high) : 0.5,
        flexDetuneCents: track.flex_detune_cents != null ? Number(track.flex_detune_cents) : 0,
        chainSnapshot: track.chain_snapshot ?? null,
        smartPlaybackEnabled: engineToggles?.smartChainPlayback !== false,
        onEnded: () => setPlayingMap((m) => ({ ...m, [track.id]: false })),
      });
      setPlayingMap((m) => ({ ...m, [track.id]: true }));
    } catch (e) {
      notify(e?.message || 'Could not play this layer.', 'warn');
    }
  };

  const addLayer = async () => {
    const tt = vocalModeToTrackType(vocalMode);
    const defaults = { main: 'Lead', double: 'Double', adlib: 'Adlib', harmony: 'Harmony', midi: 'MIDI' };
    const label = nextLaneLabel(tracks, tt, defaults[tt] || 'Vocal');
    const tr = await createTrack(id, label, tt);
    if (tr?.id) setSelectedTrackId(tr.id);
  };

  const addTypedLayer = async (preset) => {
    if (preset.trackType !== 'midi') setVocalMode(preset.mode);
    const label = nextLaneLabel(tracks, preset.trackType, preset.defaultLabel);
    const tr = await createTrack(id, label, preset.trackType);
    if (tr?.id) {
      setSelectedTrackId(tr.id);
      notify(
        {
          title: `${preset.defaultLabel} ready`,
          text: 'Lane armed — hit record when you are set.',
        },
        'success'
      );
    }
  };

  const showBeatDrop = !session?.beat_filename;
  const latencyMs = engine.estimateMonitorLatencyMs();
  const meterWidthPct = Math.min(100, meterSmooth * 100);

  const tabIs = (name) => (studioTab === name ? 'is-active' : '');

  const arrangementProps = {
    bpm: session?.bpm || 140,
    duration: engine.beatDuration || 1,
    currentTime: engine.beatTime,
    liveClock: engine.isPlaying,
    getPlaybackTime: () => beatTimeFnRef.current(),
    onSeek: (t) => engine.seekBeat(t),
    audioBuffer: engine.beatBuffer,
    punchMode,
    punchRange,
    onWaveClick: punchClick,
    barHeight: narrowWave ? 44 : 72,
    tracks,
    selectedTrackId,
    soloTrackId,
    playingMap,
    onSelectTrack: setSelectedTrackId,
    onPatchTrack: (trackId, body) => patchTrackFields(trackId, body, id),
    onSolo: (tid) => setSoloTrackId(tid),
    onEditMidiClip: (tid, clipId) => setMidiModal({ trackId: tid, clipId }),
    engineIsRecording: engine.isRecording,
  };

  const recordToggle = async () => {
    if (processing) return;
    if (engine.isRecording) await stopRecordFlow();
    else await startRecordFlow();
  };

  if (!id) {
    return (
      <div className="studio-workspace" style={{ padding: 24 }}>
        <p style={{ color: 'var(--text2)' }}>Missing session.</p>
      </div>
    );
  }

  return (
    <div className="studio-workspace">
      {alert && (
        <div className="studio-alert-host">
          <AlertStrip alert={alert} onDismiss={() => setAlert(null)} />
        </div>
      )}

      <div className="studio-workspace-layout">
        <div className="studio-workspace-main">
          <div className={`studio-workspace-section studio-workspace-section--song ${tabIs('beat')}`}>
            <header className="rf-session-head glass-panel">
              <div className="rf-session-head__text">
                <h1 className="rf-session-head__title">{session?.beat_label || session?.name || 'Session'}</h1>
                <p className="rf-session-head__meta">
                  {[
                    session?.bpm && `${session.bpm} BPM`,
                    session?.musical_key,
                    session?.genre,
                    engine.beatDuration > 0 && `${fmtTime(engine.beatDuration)} length`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'RAP FACTORY session · any mic'}
                </p>
              </div>
              {showBeatDrop && (
                <div
                  className="rf-beat-drop"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={async (e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) await onBeatFile(f);
                  }}
                >
                  <span>Drop your beat here to start building the record.</span>
                  <label className="rf-beat-drop__browse">
                    or browse
                    <input type="file" accept=".mp3,.wav,.ogg,.m4a,audio/*" hidden onChange={(e) => e.target.files?.[0] && onBeatFile(e.target.files[0])} />
                  </label>
                </div>
              )}
            </header>

            <StockBeatsPicker
              sessionId={id}
              uploadBeatApi={uploadBeatApi}
              patchSession={patchSession}
              setStockBeatAutoplayArm={setStockBeatAutoplayArm}
              notify={notify}
              disabled={!session || processing}
            />

            <div className="rf-song-structure glass-panel" aria-label="Song structure reference">
              <span className="rf-song-structure__label">Song map</span>
              {['Intro', 'Hook', 'Verse', 'Hook', 'Verse', 'Outro'].map((x, i) => (
                <span key={`${x}-${i}`} className="rf-song-structure__pill">
                  {x}
                </span>
              ))}
            </div>

            <MicSourcePicker
              value={session?.input_source}
              disabled={!session}
              onChange={async (src) => {
                const r = await patchSession(id, { input_source: src });
                if (r) {
                  notify(
                    {
                      title: 'Studio setup updated',
                      text: 'New takes use this mic profile. Re-record a layer if you want the chain to fully match.',
                    },
                    'success'
                  );
                }
              }}
            />

            <StudioArrangement {...arrangementProps} />
          </div>

          <div className={`studio-workspace-section studio-workspace-section--record ${tabIs('record')}`}>
            <div className="rf-quick-layers glass-panel">
              <span className="rf-quick-layers__label">Add layer</span>
              <div className="rf-quick-layers__row">
                {VOCAL_LANE_PRESETS.map((p) => (
                  <button key={p.mode} type="button" className="btn btn-ghost rf-quick-layers__btn" title={p.hint} onClick={() => addTypedLayer(p)}>
                    {p.strip}
                  </button>
                ))}
              </div>
              <p className="rf-quick-layers__hint">
                Lead · doubles · adlibs · harmony · punch-in lane — stack the full song without leaving this screen.
              </p>
            </div>
            <StudioPerformance
              engine={engine}
              processing={processing}
              recSec={recSec}
              fmtTime={fmtTime}
              selectedTrack={selectedTrack}
              onRecordToggle={recordToggle}
              monitorVol={monitorVol}
              onMonitorVol={setMonitorVol}
              balance={beatVocalBalance}
              onBalance={setBeatVocalBalance}
              punchMode={punchMode}
              onPunchToggle={() => {
                setPunchMode((p) => !p);
                setPunchPoints([]);
                notify(punchMode ? 'Punch selection off' : 'Tap the waveform twice to set punch in and out', 'info');
              }}
              countInBars={countInBars}
              onCountInChange={setCountInBars}
              meterWidthPct={meterWidthPct}
              latencyMs={latencyMs}
              beatTimeSec={engine.beatTime}
              beatDurationSec={engine.beatDuration || 0}
            />
          </div>

          <div className={`studio-workspace-section studio-workspace-layers ${tabIs('tracks')}`}>
            <StudioMixerStrip
              tracks={tracks}
              session={session}
              soloTrackId={soloTrackId}
              onSolo={setSoloTrackId}
              onPatchTrack={(trackId, body) => patchTrackFields(trackId, body, id)}
              playingMap={playingMap}
            />
            <div className="section-label rf-layers-label">Layers & takes</div>
            {!tracks.length && (
              <div className="rf-layers-empty">
                <p>No layers yet</p>
                <p className="rf-layers-empty__sub">Hit record — your first take becomes the lead.</p>
              </div>
            )}
            {tracks.map((t) => (
              <TrackRow
                key={t.id}
                track={t}
                selected={selectedTrackId === t.id}
                recordArmed={selectedTrackId === t.id && !engine.isRecording}
                onSelect={() => setSelectedTrackId(t.id)}
                onDelete={(tid) => {
                  if (!window.confirm('Delete this layer and its takes?')) return;
                  removeTrack(tid, id);
                }}
                onComp={async (trackId, takeOrSmart) => {
                  if (takeOrSmart === 'smart') await runSmartComp(trackId, id);
                  else await setActiveTake(trackId, takeOrSmart, id);
                }}
                isPlaying={!!playingMap[t.id]}
                onPlayToggle={toggleTrackPlay}
                onPatch={(body) => patchTrackFields(t.id, body, id)}
                soloTrackId={soloTrackId}
                onSolo={(tid) => setSoloTrackId(tid)}
                className="track-row-rf"
              />
            ))}
            <button type="button" className="btn btn-ghost rf-add-layer" onClick={addLayer}>
              + Add layer (current vocal mode)
            </button>
            <div className="rf-layers-actions">
              <button type="button" className="btn btn-ghost" onClick={openVersions}>
                Version history
              </button>
              {hasFailedBlob() && (
                <button type="button" className="btn btn-primary" onClick={() => retryPendingUpload()}>
                  Retry upload
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={`studio-workspace-side ${tabIs('chain')}`}>
          <StudioSmartEngine
            sessionId={id}
            sessionName={session?.name}
            vocalMode={vocalMode}
            setVocalMode={setVocalMode}
            vibe={vibe}
            setVibe={setVibe}
            lastFeedback={lastFeedback}
            setLastFeedback={setLastFeedback}
            selectedTrack={selectedTrack}
            tracks={tracks}
            engineeredPlaybackOn={engineToggles?.smartChainPlayback !== false}
          />
        </div>
      </div>

      <MidiPianoRollModal
        open={!!midiModal}
        track={tracks.find((t) => t.id === midiModal?.trackId)}
        clipId={midiModal?.clipId}
        onClose={() => setMidiModal(null)}
        onSave={(trackId, clipsJson) => {
          patchTrackFields(trackId, { clips_json: clipsJson }, id);
          setMidiModal(null);
        }}
      />

      <nav className="studio-tabs-mobile studio-tabs-mobile--rf" aria-label="Studio sections">
        {[
          ['beat', 'Song'],
          ['record', 'Record'],
          ['tracks', 'Layers'],
          ['chain', 'Engine'],
        ].map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            className={`studio-tab-m ${studioTab === tab ? 'active' : ''}`}
            onClick={() => setStudioTab(tab)}
          >
            {label}
          </button>
        ))}
      </nav>

      {versionOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="card-spec modal-spec">
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, marginTop: 0 }}>Versions</h2>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {versions.map((v) => (
                <li key={v.id} style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'flex-start' }}
                    onClick={() => restoreVersion(id, v.id).then(() => setVersionOpen(false))}
                  >
                    {v.label} — <span className="mono">{v.created_at}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-primary" onClick={() => setVersionOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
