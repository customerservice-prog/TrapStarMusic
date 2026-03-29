import { useState } from 'react';

const ALT =
  'RAP FACTORY — automatic rap recording studio. Full artwork shows branding; fallback is the vector wordmark.';

const SRC_PNG = '/rap-factory-logo.png';
const SRC_SVG = '/rap-factory-logo.svg';

/** @param {{ variant?: 'hero' | 'nav' | 'inline'; className?: string }} props */
export default function BrandLogo({ variant = 'hero', className = '' }) {
  const [src, setSrc] = useState(SRC_PNG);

  if (variant === 'nav') {
    return null;
  }

  return (
    <img
      src={src}
      alt={ALT}
      className={`brand-logo brand-logo--${variant} ${className}`.trim()}
      decoding="async"
      onError={() => {
        if (src !== SRC_SVG) setSrc(SRC_SVG);
      }}
    />
  );
}
