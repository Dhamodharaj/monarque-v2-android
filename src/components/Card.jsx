import CardArt from './CardArt.jsx';
import { getCardCost, classifyCard } from '../game/CardTiers.js';
import { SOUL } from '../game/lexicon.js';
import registry from '../data/cards.json';
const cards = registry.filter(card => card.type === 'CHARACTER');
export default function Card({ card, selected = false, disabled = false, locked = false, hidden = false, showStats = true, costOverride, lastStandLocked = false, onClick, onMouseEnter, onMouseLeave, onFocus, onBlur, style, owned = false, noTitle = false }) {
  if (hidden) {
    return <div className="card card-back" aria-label="Hidden card"><div className="card-back-mark">M</div></div>;
  }

  return (
    <button
      type="button"
      className={`card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${locked ? 'locked' : ''} ${owned ? 'owned' : ''} ${lastStandLocked ? 'ls-locked' : ''}`}
      style={style}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      title={noTitle ? undefined : lastStandLocked ? `Last-Stand card — playable only when your ${SOUL()} is 0` : locked ? 'Drawn card — playable from your next turn' : `${card.character} — ${card.form}`}
      disabled={disabled}
    >
      {showStats && card.type !== 'WILDCARD' && <span className={`card-cost ${(costOverride ?? getCardCost(card, cards)) === 0 ? 'free' : ''}`} title={`Costs ${costOverride ?? getCardCost(card, cards)} ${SOUL()} to play`}>⚡{costOverride ?? getCardCost(card, cards)}</span>}
      {card.lastStand && <span className="card-laststand" title="Last-Stand card: free, playable only at 0 Soul. When they are spent and your Soul is gone, you are eliminated.">LAST STAND</span>}
      {lastStandLocked && <span className="card-ls-lock">NEEDS 0 {SOUL().toUpperCase()}</span>}
      {owned && <span className="card-owned-badge" title="In your collection">★</span>}
      <div className="card-image-wrap">
        <CardArt card={card} />
      </div>
      <div className="card-info">
        <strong>{card.character}</strong>
        <span>{card.form}</span>
        {showStats ? <>
          <div className="card-stats"><b className="stat-p"><i>P</i>{card.power}</b><b className="stat-r"><i>R</i>{card.rank}</b></div>
          <span className={`card-tier tier-${classifyCard(card,cards).toLowerCase()}`}>{classifyCard(card,cards)} · {costOverride ?? getCardCost(card,cards)} {SOUL().toUpperCase()}</span>
        </> : <span className="card-tier">STATS HIDDEN</span>}
      </div>
    </button>
  );
}
