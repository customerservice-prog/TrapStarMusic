export default function Toggle({ on, onChange, ariaLabel }) {
  return (
    <button
      type="button"
      className={`toggle-spec ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
      aria-label={ariaLabel}
      aria-pressed={on}
    />
  );
}
