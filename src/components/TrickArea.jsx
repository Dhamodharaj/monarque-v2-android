import { useState } from 'react';
import { createPortal } from 'react-dom';
import Card from './Card';
import { SOUL, isStory } from '../game/lexicon.js';
import { classifyCard, getCardCost } from '../game/CardTiers.js';
import registry from '../data/cards.json';
const characters = registry.filter((c) => c.type === 'CHARACTER');

/** Hover tooltip for a played card: name, form, what it is, and its stats. Fixed-positioned in a portal so no ancestor can clip it. */
function CardTip({ card, rect, reveal }) {
  if (!card || !rect) return null;
  const W = 260, pad = 10;
  const left = Math.max(pad, Math.min(window.innerWidth - W - pad, rect.left + rect.width / 2 - W / 2));
  const below = rect.top < 170;
  const pos = below ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 };
  const tier = classifyCard(card, characters), cost = card.lastStand ? 0 : getCardCost(card, characters);
  return createPortal(
    <div className="card-hover-tip" role="tooltip" style={{ left, width: W, ...pos }}>
      <strong>{card.character}{card.form ? ` · ${card.form}` : ''}</strong>
      {reveal && <span className="card-hover-tip-stats">P {card.power} · R {card.rank} · {tier} · ⚡{cost} {SOUL()}{card.lastStand ? ' · LAST STAND' : ''}</span>}
      {card.description && <span>{card.description}</span>}
    </div>, document.body);
}

// Slots = vessels still standing (so an eliminated player's placeholder disappears
// and the remaining ones re-centre). A forced pass renders as a clear "PASSED" tile.
export default function TrickArea({ trick, players, reveal = false }) {
  const alive = players.filter((p) => p.hp > 0).length;
  const slotCount = Math.max(2, Math.min(4, alive || players.length));
  const plays = trick?.plays ?? [];
  const total = Math.max(slotCount, plays.length);
  const [tip, setTip] = useState(null); // { card, rect }
  const showTip = (card) => (e) => setTip({ card, rect: e.currentTarget.getBoundingClientRect() });
  const hideTip = () => setTip(null);

  return (
    <section className="trick-area">
      <div className={`trick-cards trick-slot-grid dyn-slots slots-${total}`}>
        {Array.from({ length: total }, (_, index) => {
          const play = plays[index];
          if (!play) {
            return (
              <div className="trick-slot" key={`trick-slot-${index}`}>
                <div className="trick-placeholder" aria-label={`Empty trick slot ${index + 1}`}><span>✦</span></div>
              </div>
            );
          }
          const player = players.find((p) => p.id === play.playerId);
          if (play.card?.isPass) {
            return (
              <div className="trick-slot" key={`trick-slot-${index}`}>
                <div className="trick-play">
                  {play.card.charge ? <div className="trick-pass-tile charge"><b>{isStory() ? 'GATHERING' : 'CHARGING'}</b><small>Skipped the round</small><small>−{play.card.hpLoss} HP · +{play.card.kiGain} {SOUL()}</small></div> : <div className="trick-pass-tile"><b>PASSED</b><small>No playable card</small><small>−3 HP · +1 {SOUL()}</small></div>}
                  <span>{player?.name ?? 'Player'}</span>
                </div>
              </div>
            );
          }
          return (
            <div className="trick-slot" key={`trick-slot-${index}`}>
              <div className="trick-play" key={`${play.playerId}-${play.card.id}`}>
                <Card card={play.card} showStats={reveal} noTitle onMouseEnter={showTip(play.card)} onMouseLeave={hideTip} onFocus={showTip(play.card)} onBlur={hideTip} />
                <span>{player?.name ?? 'Player'}</span>
              </div>
            </div>
          );
        })}
      </div>
      {tip && <CardTip card={tip.card} rect={tip.rect} reveal={reveal} />}
    </section>
  );
}
