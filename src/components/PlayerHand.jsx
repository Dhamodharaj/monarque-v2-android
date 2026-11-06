import { useMemo, useRef } from 'react';
import Card from './Card';
import { gameSounds } from '../utils/sound.js';
import { getCardCost } from '../game/CardTiers.js';
import CardBack from './CardBack';
import registry from '../data/cards.json';
const characterRegistry = registry.filter(card => card.type === 'CHARACTER');

export default function PlayerHand({ cards, enabled, selectedId, lockedCardIds = [], blockedCardIds = [], sealedCardIds = [], ki = 20, blindMode = false, freeCharacterCost = false, costDiscount = 0, sortMode = 'POWER', ownedCardIds = [], onSelect }) {
  const sortedCards = useMemo(() => [...cards].sort((a, b) => sortMode === 'RANK' ? (b.rank ?? 0) - (a.rank ?? 0) : sortMode === 'KI' ? (getCardCost(a, characterRegistry) - getCardCost(b, characterRegistry)) || (b.power ?? 0) - (a.power ?? 0) : (b.power ?? 0) - (a.power ?? 0)), [cards, sortMode]);
  const handScrollRef = useRef(null);
  const scrollHand = (direction) => handScrollRef.current?.scrollBy({ left: direction * Math.max(320, handScrollRef.current.clientWidth * 0.72), behavior: 'smooth' });

  return (
    <div className="player-hand-wrap">
      <button type="button" className="player-hand-nav player-hand-nav-prev" aria-label="Previous cards" onClick={() => scrollHand(-1)}>‹</button>
      <div className="player-hand-scroll" ref={handScrollRef}>
        <section className="player-hand">
          {sortedCards.map((card, cardIndex) => {
            const sealed = sealedCardIds.includes(card.id);
            const blocked = blockedCardIds.includes(card.id);
            const locked = lockedCardIds.includes(card.id) || sealed || blocked;
            const effectiveCost = freeCharacterCost ? 0 : Math.max(0,getCardCost(card, characterRegistry)-costDiscount);
            const lastStandLocked = Boolean(card.lastStand) && ki > 0;
            const unaffordable = effectiveCost > ki || lastStandLocked;
            if (blindMode) return <button key={card.id} type="button" className="blind-card-slot" disabled={!enabled || locked || unaffordable} aria-label="Blind card slot" onClick={() => onSelect(card.id)}><CardBack small /><span>?</span></button>;
            return <Card key={card.id} onMouseEnter={() => enabled && !locked && !unaffordable && gameSounds.cue('cardHover', 0.5, { minGap: 140 })} owned={ownedCardIds.includes(card.id)} style={{ '--i': Math.min(cardIndex, 14) }} card={card} selected={selectedId === card.id} disabled={!enabled || locked || unaffordable} locked={locked} lastStandLocked={lastStandLocked} costOverride={effectiveCost} onClick={() => onSelect(card.id)} />;
          })}
        </section>
      </div>
      <button type="button" className="player-hand-nav player-hand-nav-next" aria-label="Next cards" onClick={() => scrollHand(1)}>›</button>
    </div>
  );
}
