import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { L, SOUL } from '../game/lexicon.js';
import { GAME_CONFIG } from '../config/gameConfig.js';

// Contextual "what do I do now / what just happened" line for new players.
export function coachText(state, human, ctx = {}) {
  if (!state || !human) return null;
  const e = state.activeEffects ?? {};
  const myTurn = state.currentPlayer === human.id;
  const leader = state.currentTrick?.leaderId === human.id;
  const lastStandOnly = human.hand.some(c => c.lastStand) && human.ki === 0;
  if (state.phase === 'MATCH_COMPLETE') return 'The rite is over.';
  if (!myTurn) {
    const cur = state.players.find(p => p.id === state.currentPlayer);
    return `${cur?.name ?? 'A vessel'} is ${state.phase === 'CALLING_STAT' ? 'choosing a stat' : 'playing a card'}. Cards stay hidden until everyone has played.`;
  }
  const tips = [];
  if (e.solarFlare || state.solarFlareLeader) tips.push('The Blinding Eclipse: you are playing blind, pick any slot.');
  if (state.domainInversionRounds > 0) tips.push('INVERTED: the LOWER stat wins this round — weak cards are strong!');
  if (e.totalMight) tips.push('THE WEIGHING: Power and Rank both count, no call needed.');
  if (e.bounty) tips.push('A debt is called on the champion — beat them for bonus HP and Soul.');
  if (state.phase === 'GM_DECREE') return 'Monarque has spoken — answer the whim.';
  if (state.phase === 'CALLING_STAT') {
    if (lastStandOnly) return 'Soul is 0 — LAST STAND time. Your LAST STAND cards are free: play one to shield your HP this round and refill +3 Soul. (Responders can also GATHER SOUL.)';
    if (human.ki <= 3) tips.push('Soul is low. Play cheap cards (⚡1). Soul comes back when you place 2nd–4th, or as a responder you can GATHER SOUL (−' + GAME_CONFIG.charge.hp + ' HP, +' + GAME_CONFIG.charge.ki + ' Soul).');
    return ['You lead this round: pick a card, then CALL POWER (highest wins) or CALL RANK (lowest number wins).', ...tips].join(' ');
  }
  if (state.phase === 'PLAYING_CARD') {
    const call = state.currentCall;
    const msg = call === 'TOTAL' ? 'The Weighing: the best combined Power + Rank wins.' : call ? `Call is ${call}: ${call === 'POWER' ? 'highest Power' : 'lowest Rank number'} wins.` : 'The call is hidden — guess well.';
    return [`${msg} Pick a card (⚡ = Soul cost), optionally boost, then PLAY.`, ...tips].join(' ');
  }
  return null;
}

/** Where the table's centre panel sits on screen, so the bar can float above every table layer (nothing can swallow its clicks). */
function useTableRect() {
  const [rect, setRect] = useState(null);
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector('.table-screen .table-center');
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect((o) => (o && Math.abs(o.left - r.left) < 1 && Math.abs(o.right - r.right) < 1 && Math.abs(o.bottom - r.bottom) < 1 ? o : { left: r.left, right: r.right, bottom: r.bottom, width: r.width }));
    };
    measure();
    const t = window.setInterval(measure, 400); // layout shifts (resizes, dealing, panels) settle without extra wiring
    window.addEventListener('resize', measure);
    return () => { window.clearInterval(t); window.removeEventListener('resize', measure); };
  }, []);
  return rect;
}

export default function CoachBar({ state, human, onOpenGuide }) {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('kc_coach_hidden') === '1'; } catch { return false; } });
  const rect = useTableRect();
  const text = L(coachText(state, human));
  const toggle = (v) => { setHidden(v); try { localStorage.setItem('kc_coach_hidden', v ? '1' : '0'); } catch { /* ignore */ } };
  const act = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn(); };
  if (!text || !rect) return null;
  const bottom = Math.max(8, window.innerHeight - rect.bottom + 34);
  const node = hidden ? (
    <button type="button" className="coach-fx coach-fx-min" style={{ bottom, right: Math.max(8, window.innerWidth - rect.right + 14) }} onClick={act(() => toggle(false))} title="Show tips">✦ Tips</button>
  ) : (
    <div className="coach-fx" role="note" style={{ bottom, left: rect.left + rect.width / 2, width: Math.min(rect.width * 0.94, 700) }}>
      <span className="coach-icon" aria-hidden="true">✦</span>
      <span className="coach-text">{text}</span>
      <button type="button" className="coach-link" onClick={act(() => onOpenGuide?.())}>Guide</button>
      <button type="button" className="coach-x" onClick={act(() => toggle(true))} aria-label="Hide tips">×</button>
    </div>
  );
  return createPortal(node, document.body);
}
