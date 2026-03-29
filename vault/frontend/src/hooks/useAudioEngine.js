import { useCallback, useEffect, useRef, useState } from 'react';
import { applyEdgeFadesToBlob } from '../lib/wav.js';
import { fetchArrayBuffer } from '../lib/api.js';
import {
  parseChainSnapshot,
  chainHasSmartPlayback,
  connectSmartVocalPlayback,
  tuneAssistDetuneCents,
} from '../lib/vocalChainAudio.js';
import { registerVocalDecodeCache } from '../lib/vocalDecodeCacheRegistry.js';

const PUNCH_EDGE_FADE_SEC = 0.12;
const MAX_VOCAL_BUFFERS = 8;

function pickMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function useAudioEngine() {
  const ctxRef = useRef(null);
  const micStreamRef = useRef(null);
  const micSourceRef = useRef(null);
  const monitorGainRef = useRef(null);
  const lastMonitorGainRef = useRef(0.85);
  const monitoringEnabledRef = useRef(true); // kept in sync with monitoringOn
  const analyserRef = useRef(null);
  /** Gentle limiter on the monitor path only (recording stays unprocessed). */
  const monitorCompressorRef = useRef(null);
  const beatBufferRef = useRef(null);
  /** Master gain for beat playback (mixer fader). */
  const beatBusGainRef = useRef(null);
  const beatVolumeRef = useRef(1);
  const beatSourceRef = useRef(null);
  const beatStartedAtRef = useRef(0);
  const beatOffsetRef = useRef(0);
  const rafRef = useRef(0);
  const meterRafRef = useRef(0);
  const lastMeterUiRef = useRef(0);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const punchLoopRef = useRef(0);
  const recordMimeRef = useRef('');
  /** @type {React.MutableRefObject<Record<string, { takeId: string; url: string; buffer: AudioBuffer }>>} */
  const vocalBufferCacheRef = useRef({});
  /** @type {React.MutableRefObject<Record<string, { stop: () => void }>>} */
  const vocalPlaybackRef = useRef({});
  const masterOutGainRef = useRef(null);
  const masterAnalyserRef = useRef(null);
  const lastMasterUiRef = useRef(0);

  const [meter, setMeter] = useState(0);
  const [masterMeterL, setMasterMeterL] = useState(0);
  const [masterMeterR, setMasterMeterR] = useState(0);
  const [beatTime, setBeatTime] = useState(0);
  const [beatDuration, setBeatDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [monitorNote, setMonitorNote] = useState(null);
  const [micDenied, setMicDenied] = useState(false);
  const [beatBufferState, setBeatBufferState] = useState(null);
  const [beatDecodeError, setBeatDecodeError] = useState(null);
  const [monitoringOn, setMonitoringOn] = useState(true);
  const [micHardwareLost, setMicHardwareLost] = useState(false);
  const [beatVolume, setBeatVolumeState] = useState(1);

  useEffect(() => {
    registerVocalDecodeCache(vocalBufferCacheRef);
    return () => registerVocalDecodeCache(null);
  }, []);

  const clearVocalDecodeCache = useCallback(() => {
    vocalBufferCacheRef.current = {};
  }, []);

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      const ctx = new Ctx({ latencyHint: 'interactive' });
      ctxRef.current = ctx;
      monitorCompressorRef.current = null;
      const mg = ctx.createGain();
      mg.gain.value = 1;
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      mg.connect(an);
      an.connect(ctx.destination);
      masterOutGainRef.current = mg;
      masterAnalyserRef.current = an;
      const base = ctx.baseLatency ?? 0;
      const out = ctx.outputLatency ?? 0;
      const ms = (base + out) * 1000;
      if (ms > 15) {
        setMonitorNote(
          `Headphone monitoring has higher latency on this device (~${Math.round(ms)}ms). For tight punch-ins, use wired headphones.`
        );
      }
    } else {
      const ctx = ctxRef.current;
      if (!masterOutGainRef.current || masterOutGainRef.current.context !== ctx) {
        const mg = ctx.createGain();
        mg.gain.value = 1;
        const an = ctx.createAnalyser();
        an.fftSize = 2048;
        mg.connect(an);
        an.connect(ctx.destination);
        masterOutGainRef.current = mg;
        masterAnalyserRef.current = an;
      }
    }
    return ctxRef.current;
  }, []);

  const stopBeatInternal = useCallback(() => {
    if (beatSourceRef.current) {
      try {
        beatSourceRef.current.stop();
      } catch (_) {}
      beatSourceRef.current.disconnect();
      beatSourceRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    setIsPlaying(false);
  }, []);

  const getBeatTime = useCallback(() => {
    const ctx = ctxRef.current;
    const buf = beatBufferRef.current;
    if (!ctx || !buf) return 0;
    if (!beatSourceRef.current) return beatOffsetRef.current;
    const elapsed = ctx.currentTime - beatStartedAtRef.current;
    return Math.min(buf.duration, Math.max(0, beatOffsetRef.current + elapsed));
  }, []);

  const tickBeat = useCallback(() => {
    setBeatTime(getBeatTime());
    if (beatSourceRef.current && beatBufferRef.current) {
      const t = getBeatTime();
      if (t >= beatBufferRef.current.duration - 0.01) {
        stopBeatInternal();
        setBeatTime(beatBufferRef.current.duration);
        return;
      }
    }
    rafRef.current = requestAnimationFrame(tickBeat);
  }, [getBeatTime, stopBeatInternal]);

  const playBeat = useCallback(
    async (fromSeconds = null) => {
      const ctx = ensureCtx();
      const buf = beatBufferRef.current;
      if (!ctx || !buf) return;
      await ctx.resume();
      stopBeatInternal();
      const offset = fromSeconds != null ? fromSeconds : beatOffsetRef.current;
      beatOffsetRef.current = Math.max(0, Math.min(buf.duration, offset));
      const masterIn = masterOutGainRef.current;
      if (!masterIn) return;
      let bus = beatBusGainRef.current;
      if (!bus || bus.context !== ctx) {
        bus = ctx.createGain();
        bus.gain.value = beatVolumeRef.current;
        bus.connect(masterIn);
        beatBusGainRef.current = bus;
      } else {
        bus.gain.value = beatVolumeRef.current;
        try {
          bus.disconnect();
        } catch (_) {}
        bus.connect(masterIn);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(bus);
      src.onended = () => {
        beatSourceRef.current = null;
        setIsPlaying(false);
      };
      beatSourceRef.current = src;
      beatStartedAtRef.current = ctx.currentTime;
      src.start(0, beatOffsetRef.current);
      setIsPlaying(true);
      tickBeat();
    },
    [ensureCtx, stopBeatInternal, tickBeat]
  );

  const pauseBeat = useCallback(() => {
    const t = getBeatTime();
    beatOffsetRef.current = t;
    stopBeatInternal();
    setBeatTime(t);
  }, [getBeatTime, stopBeatInternal]);

  const seekBeat = useCallback(
    (seconds) => {
      const buf = beatBufferRef.current;
      if (!buf) return;
      const wasPlaying = !!beatSourceRef.current;
      if (wasPlaying) stopBeatInternal();
      beatOffsetRef.current = Math.max(0, Math.min(buf.duration, seconds));
      setBeatTime(beatOffsetRef.current);
      if (wasPlaying) playBeat(beatOffsetRef.current);
    },
    [playBeat, stopBeatInternal]
  );

  const decodeFile = useCallback(
    async (file) => {
      setBeatDecodeError(null);
      const ctx = ensureCtx();
      if (!ctx) return null;
      await ctx.resume();
      try {
        const ab = await file.arrayBuffer();
        const buf = await ctx.decodeAudioData(ab.slice(0));
        beatBufferRef.current = buf;
        setBeatBufferState(buf);
        setBeatDuration(buf.duration);
        beatOffsetRef.current = 0;
        setBeatTime(0);
        stopBeatInternal();
        return buf;
      } catch (err) {
        const msg = err?.message || 'This file could not be decoded as audio.';
        setBeatDecodeError(msg);
        throw new Error(msg);
      }
    },
    [ensureCtx, stopBeatInternal]
  );

  const decodeFromArrayBuffer = useCallback(
    async (ab) => {
      setBeatDecodeError(null);
      const ctx = ensureCtx();
      if (!ctx) return null;
      await ctx.resume();
      try {
        const buf = await ctx.decodeAudioData(ab.slice(0));
        beatBufferRef.current = buf;
        setBeatBufferState(buf);
        setBeatDuration(buf.duration);
        beatOffsetRef.current = 0;
        setBeatTime(0);
        stopBeatInternal();
        return buf;
      } catch (err) {
        const msg = err?.message || 'This file could not be decoded as audio.';
        setBeatDecodeError(msg);
        throw new Error(msg);
      }
    },
    [ensureCtx, stopBeatInternal]
  );

  const loadBeatFromUrl = useCallback(
    async (url) => {
      try {
        const ab = await fetchArrayBuffer(url);
        return decodeFromArrayBuffer(ab);
      } catch (e) {
        const msg = e?.message || 'Could not download beat.';
        setBeatDecodeError(msg);
        throw new Error(msg);
      }
    },
    [decodeFromArrayBuffer]
  );

  const setBeatVolume = useCallback((v) => {
    const x = Math.max(0, Math.min(1, Number(v) || 0));
    beatVolumeRef.current = x;
    setBeatVolumeState(x);
    const bus = beatBusGainRef.current;
    if (bus) bus.gain.value = x;
  }, []);

  const setMonitorGain = useCallback((v) => {
    const g = Math.max(0, Math.min(1, v));
    lastMonitorGainRef.current = g;
    if (monitorGainRef.current) {
      monitorGainRef.current.gain.value = monitoringEnabledRef.current ? g : 0;
    }
  }, []);

  const setMonitoringEnabled = useCallback((on) => {
    const next = !!on;
    monitoringEnabledRef.current = next;
    setMonitoringOn(next);
    if (monitorGainRef.current) {
      monitorGainRef.current.gain.value = next ? lastMonitorGainRef.current : 0;
    }
  }, []);

  const initMic = useCallback(async () => {
    const ctx = ensureCtx();
    if (!ctx) return { ok: false, denied: false };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      micStreamRef.current = stream;
      if (micSourceRef.current) micSourceRef.current.disconnect();
      const src = ctx.createMediaStreamSource(stream);
      micSourceRef.current = src;
      if (!analyserRef.current) analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 512;
      if (!monitorGainRef.current) monitorGainRef.current = ctx.createGain();
      monitorGainRef.current.gain.value = monitoringEnabledRef.current ? lastMonitorGainRef.current : 0;
      let comp = monitorCompressorRef.current;
      if (!comp || comp.context !== ctx) {
        try {
          comp?.disconnect();
        } catch (_) {}
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 18;
        comp.ratio.value = 4;
        comp.attack.value = 0.002;
        comp.release.value = 0.22;
        monitorCompressorRef.current = comp;
      }
      src.connect(analyserRef.current);
      analyserRef.current.connect(comp);
      comp.connect(monitorGainRef.current);
      monitorGainRef.current.connect(ctx.destination);
      setMicDenied(false);
      setMicHardwareLost(false);
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener('ended', () => setMicHardwareLost(true));
      });
      return { ok: true };
    } catch {
      setMicDenied(true);
      return { ok: false, denied: true };
    }
  }, [ensureCtx]);

  const tickMeter = useCallback(() => {
    const now = performance.now();
    const an = analyserRef.current;
    if (an) {
      const data = new Uint8Array(an.frequencyBinCount);
      an.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const level = Math.min(1, rms * 4);
      if (now - lastMeterUiRef.current > 72) {
        lastMeterUiRef.current = now;
        setMeter(level);
      }
    }
    const man = masterAnalyserRef.current;
    if (man && now - lastMasterUiRef.current > 72) {
      lastMasterUiRef.current = now;
      const fd = new Float32Array(man.fftSize);
      man.getFloatTimeDomainData(fd);
      let peak = 0;
      for (let i = 0; i < fd.length; i++) peak = Math.max(peak, Math.abs(fd[i]));
      const p = Math.min(1, peak * 1.8);
      setMasterMeterL(p);
      setMasterMeterR(p);
    }
    meterRafRef.current = requestAnimationFrame(tickMeter);
  }, []);

  useEffect(() => {
    meterRafRef.current = requestAnimationFrame(tickMeter);
    return () => cancelAnimationFrame(meterRafRef.current);
  }, [tickMeter]);

  useEffect(() => {
    const nav = navigator.mediaDevices;
    if (!nav?.addEventListener) return undefined;
    const onDeviceChange = () => {
      const stream = micStreamRef.current;
      if (!stream) return;
      const tracks = stream.getAudioTracks();
      if (tracks.length && tracks.every((t) => t.readyState === 'ended')) {
        setMicHardwareLost(true);
      }
    };
    nav.addEventListener('devicechange', onDeviceChange);
    return () => nav.removeEventListener('devicechange', onDeviceChange);
  }, []);

  const startRecording = useCallback(
    async ({ punch, punchStart, punchEnd, preRoll = 2 } = {}) => {
      const stream = micStreamRef.current;
      if (!stream) return false;
      const ctx = ensureCtx();
      if (!ctx) return false;
      await ctx.resume();
      recordMimeRef.current = pickMimeType();
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, recordMimeRef.current ? { mimeType: recordMimeRef.current } : undefined);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };

      const runPunch = punch && punchStart != null && punchEnd != null && punchEnd > punchStart;

      if (runPunch) {
        const buf = beatBufferRef.current;
        if (!buf) return false;
        const startAt = Math.max(0, punchStart - preRoll);
        seekBeat(startAt);
        await playBeat(startAt);
        setIsRecording(true);

        const loop = () => {
          const nowT = getBeatTime();
          if (!recorderRef.current) return;
          if (!recorderRef.current.state || recorderRef.current.state === 'inactive') {
            if (nowT >= punchStart - 0.02) {
              try {
                recorderRef.current.start(100);
              } catch (_) {}
            }
          }
          if (recorderRef.current.state === 'recording' && nowT >= punchEnd) {
            try {
              recorderRef.current.stop();
            } catch (_) {}
            pauseBeat();
            setIsRecording(false);
            return;
          }
          punchLoopRef.current = requestAnimationFrame(loop);
        };
        punchLoopRef.current = requestAnimationFrame(loop);
        return true;
      }

      rec.start(100);
      setIsRecording(true);
      return true;
    },
    [ensureCtx, getBeatTime, pauseBeat, playBeat, seekBeat]
  );

  const stopRecording = useCallback(async ({ punch, applyFades } = {}) => {
    if (punchLoopRef.current) {
      cancelAnimationFrame(punchLoopRef.current);
      punchLoopRef.current = 0;
    }
    const rec = recorderRef.current;
    await new Promise((resolve) => {
      if (!rec) {
        resolve();
        return;
      }
      const done = () => {
        requestAnimationFrame(() => resolve());
      };
      rec.addEventListener('stop', done, { once: true });
      try {
        if (rec.state === 'recording' || rec.state === 'paused') {
          if (typeof rec.requestData === 'function') rec.requestData();
          rec.stop();
        } else done();
      } catch {
        done();
      }
    });
    recorderRef.current = null;
    setIsRecording(false);
    pauseBeat();

    const blob = new Blob(chunksRef.current, {
      type: recordMimeRef.current || 'audio/webm',
    });
    chunksRef.current = [];
    if (applyFades && punch) {
      return applyEdgeFadesToBlob(blob, PUNCH_EDGE_FADE_SEC);
    }
    return blob;
  }, [pauseBeat]);

  const stopVocalTrack = useCallback((trackId) => {
    const playing = vocalPlaybackRef.current[trackId];
    if (!playing) return;
    try {
      playing.stop?.();
    } catch (_) {}
    delete vocalPlaybackRef.current[trackId];
  }, []);

  const stopAllVocalTracks = useCallback(() => {
    Object.keys(vocalPlaybackRef.current).forEach((id) => stopVocalTrack(id));
  }, [stopVocalTrack]);

  /**
   * Play a take: trim, per-strip EQ, pan, flex detune, into master bus (same path as beat).
   */
  const playVocalTrack = useCallback(
    async ({
      trackId,
      takeId,
      url,
      volume = 1,
      muted = false,
      trimStart = 0,
      trimEnd = 0,
      pan = 0,
      eqLow = 0.5,
      eqMid = 0.5,
      eqHigh = 0.5,
      flexDetuneCents = 0,
      chainSnapshot = null,
      /** When false, hear raw take + strip EQ only (Settings / Smart sound). */
      smartPlaybackEnabled = true,
      onEnded,
    }) => {
      const ctx = ensureCtx();
      const masterIn = masterOutGainRef.current;
      if (!ctx || !masterIn || !trackId || !takeId || !url) return false;
      await ctx.resume();
      stopVocalTrack(trackId);

      let buffer;
      const cache = vocalBufferCacheRef.current[trackId];
      if (cache && cache.takeId === takeId && cache.url === url && cache.buffer) {
        buffer = cache.buffer;
      } else {
        const ab = await fetchArrayBuffer(url);
        try {
          buffer = await ctx.decodeAudioData(ab.slice(0));
        } catch (e) {
          const msg = e?.message || 'Could not decode this take.';
          throw new Error(msg);
        }
        vocalBufferCacheRef.current[trackId] = { takeId, url, buffer };
        const keys = Object.keys(vocalBufferCacheRef.current);
        if (keys.length > MAX_VOCAL_BUFFERS) {
          for (let i = 0; i < keys.length - MAX_VOCAL_BUFFERS; i++) {
            delete vocalBufferCacheRef.current[keys[i]];
          }
        }
      }

      const ts = Math.max(0, Number(trimStart) || 0);
      const te = Math.max(0, Number(trimEnd) || 0);
      const inner = buffer.duration - ts - te;
      const playDur = Math.max(0.05, Math.min(inner, buffer.duration - ts));

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const parsedChain = parseChainSnapshot(chainSnapshot);
      const useSmartChain =
        smartPlaybackEnabled !== false && chainHasSmartPlayback(parsedChain);
      const tuneAssist = useSmartChain ? tuneAssistDetuneCents(parsedChain.processors) : 0;
      try {
        const detune = Math.max(
          -1200,
          Math.min(1200, (Number(flexDetuneCents) || 0) + tuneAssist)
        );
        source.detune.value = detune;
      } catch (_) {}

      let nodes;
      if (useSmartChain) {
        nodes = [
          source,
          ...connectSmartVocalPlayback({
            ctx,
            source,
            masterIn,
            chainSnapshot: parsedChain,
            eqLow,
            eqMid,
            eqHigh,
            pan,
            volume,
            muted,
          }),
        ];
      } else {
        const low = ctx.createBiquadFilter();
        low.type = 'lowshelf';
        low.frequency.value = 130;
        low.gain.value = (Number(eqLow) - 0.5) * 20;

        const mid = ctx.createBiquadFilter();
        mid.type = 'peaking';
        mid.frequency.value = 1200;
        mid.Q.value = 0.9;
        mid.gain.value = (Number(eqMid) - 0.5) * 14;

        const high = ctx.createBiquadFilter();
        high.type = 'highshelf';
        high.frequency.value = 9000;
        high.gain.value = (Number(eqHigh) - 0.5) * 14;

        const panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, Number(pan) || 0));

        const gain = ctx.createGain();
        gain.gain.value = muted ? 0 : Math.max(0, Math.min(1, volume));

        source.connect(low);
        low.connect(mid);
        mid.connect(high);
        high.connect(panner);
        panner.connect(gain);
        gain.connect(masterIn);
        nodes = [source, low, mid, high, panner, gain];
      }
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        nodes.forEach((n) => {
          try {
            n.disconnect();
          } catch (_) {}
        });
        if (vocalPlaybackRef.current[trackId]) delete vocalPlaybackRef.current[trackId];
        onEnded?.();
      };

      source.onended = finish;
      vocalPlaybackRef.current[trackId] = {
        stop: () => {
          try {
            source.stop();
          } catch (_) {}
          finish();
        },
      };
      try {
        source.start(0, ts, playDur);
      } catch (e) {
        finish();
        throw e;
      }
      return true;
    },
    [ensureCtx, stopVocalTrack]
  );

  const playMidiClip = useCallback(
    async ({ trackId, clip, volume = 1, muted = false, onEnded }) => {
      const ctx = ensureCtx();
      const masterIn = masterOutGainRef.current;
      if (!ctx || !masterIn || !trackId || !clip) return false;
      await ctx.resume();
      stopVocalTrack(trackId);

      const now = ctx.currentTime;
      const gMain = ctx.createGain();
      gMain.gain.value = muted ? 0 : Math.max(0, Math.min(1, volume)) * 0.22;
      gMain.connect(masterIn);

      const nodes = [gMain];
      let maxEnd = Number(clip.duration) || 2;
      const notes = Array.isArray(clip.notes) ? clip.notes : [];
      for (const n of notes) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = 440 * 2 ** ((Number(n.midi) - 69) / 12);
        const g = ctx.createGain();
        const t0 = now + Math.max(0, Number(n.t) || 0);
        const dur = Math.max(0.04, Number(n.dur) || 0.2);
        const vel = Math.max(0.05, Math.min(1, Number(n.vel) ?? 0.75));
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vel * 0.5, t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g);
        g.connect(gMain);
        o.start(t0);
        o.stop(t0 + dur + 0.06);
        nodes.push(o, g);
        maxEnd = Math.max(maxEnd, (Number(n.t) || 0) + dur);
      }

      const stopAll = () => {
        nodes.forEach((x) => {
          try {
            if (typeof x.stop === 'function') x.stop();
          } catch (_) {}
          try {
            x.disconnect();
          } catch (_) {}
        });
        delete vocalPlaybackRef.current[trackId];
      };

      const ms = Math.min(120_000, Math.max(200, (maxEnd + 0.2) * 1000));
      const tid = window.setTimeout(() => {
        stopAll();
        onEnded?.();
      }, ms);

      vocalPlaybackRef.current[trackId] = {
        stop: () => {
          window.clearTimeout(tid);
          stopAll();
        },
        _tid: tid,
      };
      return true;
    },
    [ensureCtx, stopVocalTrack]
  );

  const estimateMonitorLatencyMs = useCallback(() => {
    const c = ctxRef.current;
    if (!c) return null;
    return Math.round(((c.baseLatency ?? 0) + (c.outputLatency ?? 0)) * 1000);
  }, []);

  useEffect(() => {
    return () => {
      stopBeatInternal();
      stopAllVocalTracks();
      if (micSourceRef.current) micSourceRef.current.disconnect();
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch (_) {}
      }
      if (monitorCompressorRef.current) {
        try {
          monitorCompressorRef.current.disconnect();
        } catch (_) {}
      }
      if (monitorGainRef.current) monitorGainRef.current.disconnect();
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (ctxRef.current) ctxRef.current.close();
    };
  }, [stopBeatInternal, stopAllVocalTracks]);

  return {
    ensureCtx,
    decodeFile,
    loadBeatFromUrl,
    beatDuration,
    beatTime,
    seekBeat,
    playBeat,
    pauseBeat,
    isPlaying,
    initMic,
    micDenied,
    micHardwareLost,
    meter,
    setMonitorGain,
    setMonitoringEnabled,
    monitoringOn,
    monitorNote,
    startRecording,
    stopRecording,
    getBeatTime,
    beatBuffer: beatBufferState,
    beatDecodeError,
    playVocalTrack,
    clearVocalDecodeCache,
    stopVocalTrack,
    stopAllVocalTracks,
    estimateMonitorLatencyMs,
    beatVolume,
    setBeatVolume,
    masterMeterL,
    masterMeterR,
    playMidiClip,
  };
}
