import { useState } from 'react';
const hueOf = (s = '') => { let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
const initials = (name = '') => name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

// Card artwork with a designed fallback tile (bound beings ship with art; a broken <img> must never show alt text).
export default function CardArt({ card, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (!card.image || failed) {
    const hue = hueOf(card.character);
    return (
      <div className={`card-art-fallback tier-${(card.tier ?? 'normal').toLowerCase()} ${className}`} style={{ '--h': hue }}>
        <i className="caf-aura" aria-hidden="true" /><b className="caf-initials" aria-hidden="true">{initials(card.character)}</b>
        <span>{card.character}</span><small>{card.form}</small>
      </div>
    );
  }
  return <img className={className} src={card.image} alt={`${card.character} ${card.form ?? ''}`} onError={() => setFailed(true)} draggable={false} loading="eager" decoding="async" />;
}
