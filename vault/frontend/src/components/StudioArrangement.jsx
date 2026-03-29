import ClipTimelineLanes from './ClipTimelineLanes.jsx';
import { LAYER_HEX, trackTypeLabel } from '../lib/layerPalette.js';

export default function StudioArrangement({
  bpm,
  duration,
  currentTime,
  liveClock,
  getPlaybackTime,
  onSeek,
  audioBuffer,
  punchMode,
  punchRange,
  onWaveClick,
  barHeight,
  tracks,
  selectedTrackId,
  soloTrackId,
  playingMap,
  onSelectTrack,
  onPatchTrack,
  onSolo,
  onEditMidiClip,
  engineIsRecording,
}) {
  const dur = duration || 1;
  const t = currentTime;
  const playPct = dur > 0 ? Math.min(100, Math.max(0, (t / dur) * 100)) : 0;

  return (
    <div className="rf-arrangement glass-panel" aria-label="Song timeline and vocal lanes">
      <div className="rf-arrangement__inner">
        <div className="rf-arrangement__lanes">
          <div className="rf-lane-spacer" aria-hidden />
          <div className="rf-lane rf-lane--beat">
            <span className="rf-lane__dot rf-lane__dot--beat" />
            <span className="rf-lane__name">Beat</span>
          </div>
          {tracks.map((track) => {
            const muted = !!track.muted;
            const solo = soloTrackId === track.id;
            const armed = selectedTrackId === track.id && !engineIsRecording;
            const color = LAYER_HEX[track.track_type] || LAYER_HEX.main;
            const typeLbl = trackTypeLabel(track.track_type);
            return (
              <div
                key={track.id}
                className={`rf-lane ${selectedTrackId === track.id ? 'rf-lane--selected' : ''}`}
                style={{ '--lane-accent': color }}
              >
                <button type="button" className="rf-lane__main" onClick={() => onSelectTrack(track.id)}>
                  <span className="rf-lane__dot" />
                  <span className="rf-lane__title">{(track.label || typeLbl).slice(0, 22)}</span>
                  <span className="rf-lane__type">{typeLbl}</span>
                </button>
                <div className="rf-lane__ms">
                  <button
                    type="button"
                    className={`rf-ms ${muted ? 'rf-ms--on' : ''}`}
                    title="Mute"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPatchTrack(track.id, { muted: !muted });
                    }}
                  >
                    Mute
                  </button>
                  <button
                    type="button"
                    className={`rf-ms ${solo ? 'rf-ms--solo' : ''}`}
                    title="Solo"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSolo(solo ? null : track.id);
                    }}
                  >
                    Solo
                  </button>
                  <span className={`rf-arm ${armed ? 'rf-arm--on' : ''}`} title="Recording to this layer">
                    {armed ? 'Armed' : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rf-arrangement__timeline">
          <ClipTimelineLanes
            variant="rf"
            duration={dur}
            bpm={bpm}
            currentTime={currentTime}
            liveClock={liveClock}
            getPlaybackTime={getPlaybackTime}
            onSeek={onSeek}
            audioBuffer={audioBuffer}
            barHeight={barHeight}
            punchMode={punchMode}
            punchRange={punchRange}
            onWaveClick={onWaveClick}
            tracks={tracks}
            selectedTrackId={selectedTrackId}
            onSelectTrack={onSelectTrack}
            onPatchTrack={onPatchTrack}
            playPct={playPct}
            onEditMidiClip={onEditMidiClip}
          />
        </div>
      </div>
    </div>
  );
}
