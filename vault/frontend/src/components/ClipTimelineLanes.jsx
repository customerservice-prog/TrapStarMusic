import { useCallback, useRef, useState } from 'react';
import WaveformDisplay from './WaveformDisplay.jsx';
import ArrangementRuler from './ArrangementRuler.jsx';
import { parseClips, clipsToJson, defaultMidiClip } from '../lib/trackClips.js';
import { LAYER_HEX } from '../lib/layerPalette.js';

const TYPE_COLOR = {
  main: '#c9a84c',
  double: '#4488ff',
  adlib: '#3ddd88',
  harmony: '#aa77ff',
  midi: '#e070c0',
};

function updateClipInList(clips, clipId, patch) {
  return clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c));
}

export default function ClipTimelineLanes({
  duration,
  bpm,
  currentTime,
  liveClock,
  getPlaybackTime,
  onSeek,
  audioBuffer,
  barHeight,
  punchMode,
  punchRange,
  onWaveClick,
  tracks,
  selectedTrackId,
  onSelectTrack,
  onPatchTrack,
  playPct,
  onEditMidiClip,
  variant = 'daw',
}) {
  const pxPerSec = 44;
  const dur = Math.max(0.01, duration || 1);
  const timelineWidth = Math.max(480, dur * pxPerSec);
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const [liveClipsByTrack, setLiveClipsByTrack] = useState({});

  const saveClips = useCallback(
    (trackId, nextClips) => {
      onPatchTrack(trackId, { clips_json: clipsToJson(nextClips) });
    },
    [onPatchTrack]
  );

  const onPointerMove = useCallback(
    (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dt = dx / pxPerSec;
      const clips = d.clips;
      const c = clips.find((x) => x.id === d.clipId);
      if (!c) return;
      let next = clips;
      if (d.mode === 'move') {
        const ns = Math.max(0, d.startClipStart + dt);
        next = updateClipInList(clips, d.clipId, { start: ns });
      } else if (d.mode === 'resize-r') {
        const nd = Math.max(0.15, d.startDuration + dt);
        next = updateClipInList(clips, d.clipId, { duration: nd });
      } else if (d.mode === 'resize-l') {
        const dStart = Math.max(0, d.startClipStart + dt);
        const dDur = Math.max(0.15, d.startDuration - (dStart - d.startClipStart));
        next = updateClipInList(clips, d.clipId, { start: dStart, duration: dDur });
      }
      d.liveClips = next;
      setLiveClipsByTrack((m) => ({ ...m, [d.trackId]: next }));
    },
    [pxPerSec]
  );

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    if (d.liveClips) saveClips(d.trackId, d.liveClips);
    setLiveClipsByTrack((m) => {
      const n = { ...m };
      delete n[d.trackId];
      return n;
    });
  }, [onPointerMove, saveClips]);

  const startDrag = useCallback(
    (e, trackId, clips, clip, mode) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        trackId,
        clipId: clip.id,
        startX: e.clientX,
        clips,
        startClipStart: clip.start,
        startDuration: clip.duration,
        mode,
        liveClips: null,
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', endDrag);
    },
    [endDrag, onPointerMove]
  );

  const addMidiClip = useCallback(
    (trackId) => {
      const t = tracks.find((x) => x.id === trackId);
      const clips = parseClips(t);
      saveClips(trackId, [...clips, defaultMidiClip(dur * 0.1, 4)]);
    },
    [tracks, saveClips, dur]
  );

  const vault = variant === 'vault';
  const laneColors = vault ? LAYER_HEX : TYPE_COLOR;

  return (
    <div className={`clip-timeline-outer${vault ? ' clip-timeline-outer--vault' : ''}`}>
      <div className="clip-timeline-scroll" ref={scrollRef}>
        <div className="clip-timeline-inner" style={{ width: timelineWidth, minWidth: '100%' }}>
          <div style={{ width: timelineWidth }}>
            <ArrangementRuler
              variant={vault ? 'vault' : 'default'}
              duration={dur}
              bpm={bpm}
              currentTime={currentTime}
              liveClock={liveClock}
              getPlaybackTime={getPlaybackTime}
              onSeek={onSeek}
            />
          </div>

          <div className={`clip-timeline-beat-lane${vault ? ' clip-timeline-beat-lane--vault' : ''}`} style={{ width: timelineWidth }}>
            <WaveformDisplay
              className={`waveform-timeline-embed${vault ? ' waveform-vault-beat' : ' waveform-daw-beat'}`}
              variant={vault ? 'vault' : 'default'}
              accent={vault ? '#c9a84c' : '#4ecdc4'}
              audioBuffer={audioBuffer}
              currentTime={currentTime}
              duration={dur}
              bpm={bpm}
              liveClock={liveClock}
              getPlaybackTime={getPlaybackTime}
              onSeek={onSeek}
              punchMode={punchMode}
              punchRange={punchRange}
              onWaveClick={onWaveClick}
              barHeight={barHeight}
            />
          </div>

          {tracks.map((track) => {
            const clips = liveClipsByTrack[track.id] || parseClips(track);
            const color = laneColors[track.track_type] || laneColors.main;
            const isMidi = track.track_type === 'midi';
            return (
              <div
                key={track.id}
                className={`clip-timeline-lane ${selectedTrackId === track.id ? 'is-selected' : ''}${vault ? ' clip-timeline-lane--vault' : ''}`}
                style={{ width: timelineWidth, '--lane-c': color }}
              >
                {!vault && <div className="clip-timeline-lane__grid" />}
                {clips.map((clip) => {
                  const left = (clip.start / dur) * 100;
                  const w = (clip.duration / dur) * 100;
                  return (
                    <div
                      key={clip.id}
                      className={`clip-block ${clip.kind === 'midi' ? 'clip-block--midi' : ''}${vault ? ' clip-block--vault' : ''}`}
                      style={{ left: `${left}%`, width: `${w}%` }}
                      onPointerDown={(e) => {
                        if (e.target.closest('.clip-block__handle')) return;
                        onSelectTrack(track.id);
                        startDrag(e, track.id, clips, clip, 'move');
                      }}
                    >
                      <button
                        type="button"
                        className="clip-block__handle clip-block__handle--l"
                        aria-label="Trim start"
                        onPointerDown={(e) => startDrag(e, track.id, clips, clip, 'resize-l')}
                      />
                      <span className="clip-block__label">
                        {clip.kind === 'midi' ? 'MIDI' : 'Audio'}
                      </span>
                      {clip.kind === 'midi' && onEditMidiClip && (
                        <button
                          type="button"
                          className="clip-block__edit"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => onEditMidiClip(track.id, clip.id)}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        className="clip-block__handle clip-block__handle--r"
                        aria-label="Resize end"
                        onPointerDown={(e) => startDrag(e, track.id, clips, clip, 'resize-r')}
                      />
                    </div>
                  );
                })}
                {isMidi && (
                  <button type="button" className="clip-timeline-add-midi" onClick={() => addMidiClip(track.id)}>
                    + MIDI clip
                  </button>
                )}
                <span className={`clip-timeline-playhead${vault ? ' clip-timeline-playhead--vault' : ''}`} style={{ left: `${playPct}%` }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
