import ClipTimelineLanes from './ClipTimelineLanes.jsx';
import { LAYER_HEX, trackTypeLabel } from '../lib/layerPalette.js';

export default function VaultArrangement({
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
    <div className="vault-arrangement glass-panel" aria-label="Song timeline">
      <div className="vault-arrangement__inner">
        <div className="vault-arrangement__lanes">
          <div className="vault-lane-spacer" aria-hidden />
          <div className="vault-lane vault-lane--beat">
            <span className="vault-lane__dot vault-lane__dot--beat" />
            <span className="vault-lane__name">Beat</span>
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
                className={`vault-lane ${selectedTrackId === track.id ? 'vault-lane--selected' : ''}`}
                style={{ '--lane-accent': color }}
              >
                <button type="button" className="vault-lane__main" onClick={() => onSelectTrack(track.id)}>
                  <span className="vault-lane__dot" />
                  <span className="vault-lane__title">{(track.label || typeLbl).slice(0, 22)}</span>
                  <span className="vault-lane__type">{typeLbl}</span>
                </button>
                <div className="vault-lane__ms">
                  <button
                    type="button"
                    className={`vault-ms ${muted ? 'vault-ms--on' : ''}`}
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
                    className={`vault-ms ${solo ? 'vault-ms--solo' : ''}`}
                    title="Solo"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSolo(solo ? null : track.id);
                    }}
                  >
                    Solo
                  </button>
                  <span className={`vault-arm ${armed ? 'vault-arm--on' : ''}`} title="Recording to this layer">
                    {armed ? 'Live' : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="vault-arrangement__timeline">
          <ClipTimelineLanes
            variant="vault"
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
