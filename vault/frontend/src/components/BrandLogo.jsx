const ALT =
  'Rap Factory logo featuring studio equipment, a cityscape, and flames with the tagline Record Produce Drop Hits.';

/** @param {{ variant?: 'hero' | 'nav' | 'inline'; className?: string }} props */
export default function BrandLogo({ variant = 'hero', className = '' }) {
  return (
    <img
      src="/rap-factory-logo.png"
      alt={ALT}
      className={`brand-logo brand-logo--${variant} ${className}`.trim()}
      decoding="async"
    />
  );
}
