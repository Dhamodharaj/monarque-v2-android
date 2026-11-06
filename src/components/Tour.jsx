import { useState } from 'react';
import { L } from '../game/lexicon.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

const STEPS = [
  { t: 'Goal', b: 'Everyone starts with 100 HP and 14 Soul. Lose all HP and you are out — the last vessel standing wins.' },
  { t: 'Each round', b: 'The leader picks a card and CALLS POWER (highest number wins) or RANK (lowest number wins). Everyone else then plays a card. Cards stay hidden until all have played.' },
  { t: 'Soul is your fuel', b: 'Every card shows ⚡ — its Soul cost. Strong cards cost more. Soul does not refill by itself: you gain it by placing 2nd–4th, so winning streaks drain you. You can also GATHER SOUL (−' + GAME_CONFIG.charge.hp + ' HP, +' + GAME_CONFIG.charge.ki + ' Soul) instead of playing. Extra Soul can boost a card.' },
  { t: 'Placement matters', b: 'Best placement gains HP/Soul/coins, worst loses HP. Stuck with no playable card? You must pass (−3 HP).' },
  { t: 'Last Stand cards', b: 'You hold 2 tagged LAST STAND cards. They are free but only playable at 0 Soul. Playing one shields you from HP loss that round and gives +3 Soul — a true last stand.' },
  { t: 'Surprises', b: 'The MONARQUE’S whims and omens bend the rules. Edicts (left panel) give one-shot tricks. Tap LOG to see what happened, and 💡 tips will guide you.' }
];

export const tourSeen = () => { try { return localStorage.getItem('kc_tour_done') === '1'; } catch { return true; } };

export default function Tour({ onClose }) {
  const [i, setI] = useState(0);
  const done = () => { try { localStorage.setItem('kc_tour_done', '1'); } catch { /* ignore */ } onClose(); };
  const s = STEPS[i];
  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="How to play">
      <div className="tour-card">
        <div className="tour-step">HOW TO PLAY · {i + 1}/{STEPS.length}</div>
        <h3>{L(s.t)}</h3>
        <p>{L(s.b)}</p>
        <div className="tour-dots">{STEPS.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={done}>Skip</button>
          {i > 0 && <button type="button" onClick={() => setI(i - 1)}>Back</button>}
          {i < STEPS.length - 1 ? <button type="button" className="primary" onClick={() => setI(i + 1)}>Next</button> : <button type="button" className="primary" onClick={done}>Begin</button>}
        </div>
      </div>
    </div>
  );
}
