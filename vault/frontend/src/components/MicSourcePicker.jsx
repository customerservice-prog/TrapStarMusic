import { MIC_SOURCE_OPTIONS } from '../lib/micSource.js';

export default function MicSourcePicker({ value, onChange, disabled }) {
  const v = value || 'phone';
  const active = MIC_SOURCE_OPTIONS.find((o) => o.id === v) || MIC_SOURCE_OPTIONS[0];
  return (
    <div className="rf-mic-source glass-panel">
      <div className="section-label">Your recording setup</div>
      <p className="rf-mic-source__hint">{active.hint}</p>
      <select
        className="input-spec rf-mic-source__select"
        value={v}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Recording device type for smart processing"
      >
        {MIC_SOURCE_OPTIONS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
