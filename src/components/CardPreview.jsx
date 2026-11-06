import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import CardArt from './CardArt.jsx';
import { SOUL } from '../game/lexicon.js';
import { classifyCard, getCardCost } from '../game/CardTiers.js';
import registry from '../data/cards.json';
const characters = registry.filter(c => c.type === 'CHARACTER');

/** Full-screen card viewer rendered in a portal (so no parent overflow / z-index can trap it).
 *  Close with the ✕ button, the backdrop, Esc, or the Close button. */
export default function CardPreview({ card, power, rank, onClose }) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(v => !v); } };
    window.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey, true); document.body.style.overflow = prev; };
  }, [onClose]);
  if (!card) return null;
  const tier = classifyCard(card, characters), cost = getCardCost(card, characters);
  const shownPower = power ?? card.power, shownRank = rank ?? card.rank;
  return createPortal(
    <div className="cpv-layer" role="dialog" aria-modal="true" aria-label={`${card.character} card preview`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cpv-panel">
        <button type="button" className="cpv-close" onClick={onClose} aria-label="Close card preview" title="Close (Esc)">✕</button>
        <div className={`cpv-card ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped(v => !v)} role="button" tabIndex={0} aria-label="Flip card">
          <div className="cpv-face cpv-front"><CardArt card={card} /></div>
          <div className="cpv-face cpv-back">
            <strong>{card.character}</strong><span>{card.form ?? 'Base'}</span>
            <div className="cpv-stats"><div><b>POWER</b><em className={shownPower !== card.power ? 'boosted-stat' : ''}>{shownPower}</em></div><div><b>RANK</b><em className={shownRank !== card.rank ? 'boosted-stat' : ''}>{shownRank}</em></div></div>
            <p>{card.description ?? 'No description available.'}</p>
          </div>
        </div>
        <div className="cpv-meta">
          <strong>{card.character}</strong><span>{card.form ?? 'Base'}</span>
          <div className="cpv-chips"><i className={`tier-${tier.toLowerCase()}`}>{tier}</i><i>⚡ {card.lastStand ? 0 : cost} {SOUL()}</i><i>P {shownPower}</i><i>R {shownRank}</i>{card.lastStand && <i className="ls">LAST STAND</i>}{card.trained ? <i className="tr">TRAINED ★</i> : null}</div>
        </div>
        <div className="cpv-actions"><button type="button" onClick={() => setFlipped(v => !v)}>{flipped ? 'Show artwork' : 'Show details'}</button><button type="button" className="primary" onClick={onClose}>Close</button></div>
      </div>
    </div>, document.body);
}
