import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Portrait, StepBadge } from './ui.jsx';
import EmoteTray from '../components/EmoteTray.jsx';
import { POWER_OF } from './powers.js';
import { WILDCARD_CARDS } from '../game/SpecialCards.js';
import { GROUPS } from './roster.js';

/** The opponent's circle icon plus the line they are speaking, shown in the top bar next to the title. The text gets exactly the room
 *  between the icon and the crest in the middle of the screen; when that room is too small it drops just under the bar instead. */
function HeaderVoice({ hud, mood, shown, onReact }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState(null);
  useEffect(() => { setOpen(false); }, [shown?.id]);
  const myEmote = mine && mine.id === shown?.id ? mine.e : null;
  const ref = useRef(null);
  const fit = () => {
    const box = ref.current; if (!box) return;
    const crest = document.querySelector('.gm-emblem'); const left = box.getBoundingClientRect().left;
    const limit = (crest ? crest.getBoundingClientRect().left : window.innerWidth / 2 - 110) - left - 14;
    box.style.setProperty('--voice-room', `${Math.max(0, Math.floor(limit))}px`);
    box.classList.toggle('voice-tight', limit < 150);
  };
  useLayoutEffect(fit, [shown, hud]);
  useEffect(() => { window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, []);
  return (
    <div className={`sm-voice mood-${mood}${shown ? ' speaking' : ''}`} ref={ref} data-sfx="none">
      <span className="sm-voice-icon" title={hud.foeName}><Portrait id={hud.foeId} gm={hud.isGm} size={46} mood={mood} /></span>
      {shown && (
        <div key={shown.id} className={`sm-voice-wrap${open ? ' open' : ''}`}>
          <button type="button" className={`sm-voice-text mood-${shown.mood}${shown.text ? '' : ' emo-only'}`} role="status" disabled={!onReact} aria-expanded={open} title="Tap to react with an emoji" onClick={() => setOpen((o) => !o)}>
            {shown.emoji && <span className="sm-emo" aria-hidden="true">{shown.emoji}</span>}
            {shown.text && <span>“{shown.text}”</span>}
          </button>
          {myEmote && <span className="sm-yours" title="Your reaction">{myEmote}</span>}
          {open && onReact && <EmoteTray className="sm-tray" onPick={(e) => { setMine({ id: shown.id, e }); setOpen(false); onReact(e); }} />}
        </div>
      )}
    </div>
  );
}

/** Overlay on the Battle arena: who you are fighting, what is at stake, and how they feel. Additions only. */
export default function StoryHud({ hud, mood, bubble, callout, usedPowers = [], hp, soul = null, onToggle, onReact }) {
  const [shout, setShout] = useState(null);
  useEffect(() => { if (!callout) return undefined; setShout(callout); const t = window.setTimeout(() => setShout((s) => (s?.id === callout.id ? null : s)), 2300); return () => window.clearTimeout(t); }, [callout]);
  const [slot, setSlot] = useState(null);
  useLayoutEffect(() => { const el = document.getElementById('story-hud-slot'); if (el !== slot) setSlot(el); });
  const [headSlot, setHeadSlot] = useState(null);
  useLayoutEffect(() => { const el = document.getElementById('story-header-slot'); if (el !== headSlot) setHeadSlot(el); });
  const [open, setOpen] = useState(false);
  const shown = bubble; // stays until the round is decided or the foe speaks again
  if (!hud) return null;
  const foePowers = hud.foePowers ?? [];
  const monarquePower = hud.foeMonarquePower ? WILDCARD_CARDS.find((w) => w.effectId === hud.foeMonarquePower) : null;
  const powerTotal = foePowers.length + (monarquePower ? 1 : 0);
  const body = (
    <>
    {shout && <div className="sm-callout" key={shout.id} role="status"><small>{hud.foeName}</small><b>{shout.text}</b></div>}
    {headSlot && createPortal(<HeaderVoice hud={hud} mood={mood} shown={shown} onReact={onReact} />, headSlot)}
    <div className={`sm-hud ${slot ? 'in-rail' : ''} mood-${mood}`} data-sfx="none">
      <div className="sm-hud-banner">
        <span className="sm-hud-round" title={hud.roundLabel}>{hud.roundLabel}</span>
        {hud.retry != null && <span className={`sm-retry ${hud.retry ? '' : 'spent'}`} title="Second Chance">◆</span>}
      </div>
      <div className="sm-hud-tags">
        <StepBadge step={hud.step} />
        {hud.trial && <span className="sm-hud-trial" title={hud.trial.hint}><b>{hud.trial.short}</b> · {hud.trial.label}</span>}
      </div>
      {hud.berserker && <div className="sm-hud-berserk" role="status">BERSERK · +50% HP, Soul, power</div>}
      {soul != null && soul <= 3 && <div className="sm-low-soul" role="status">Soul runs low · {soul} left</div>}
      <div className="sm-hud-foe">
        {!headSlot && <Portrait id={hud.foeId} gm={hud.isGm} size={54} mood={mood} />}
        <div className="sm-hud-foe-meta">
          <b>{hud.foeName}</b>
          <small>{hud.foeType}{hud.temperament ? ` · ${GROUPS[hud.temperament]?.label}` : ''}</small>
          <div className="sm-fear" aria-label="Dread of being bound into a card"><i style={{ width: `${Math.max(0, Math.min(100, 100 - hp))}%` }} /></div>
        </div>
      </div>
      <div className="sm-hud-stake">{hud.stake}</div>
      {!headSlot && shown && <div className={`sm-bubble mood-${shown.mood}`} key={shown.id} role="status">{shown.emoji ? `${shown.emoji} ` : ''}{shown.text ? `“${shown.text}”` : ''}</div>}
      {powerTotal > 0 && (
        <button type="button" className="sm-hud-toggle" onClick={() => { setOpen(!open); onToggle?.(); }}>{open ? '▾' : '▸'} Their powers ({powerTotal - usedPowers.length}/{powerTotal})</button>
      )}
      {open && powerTotal > 0 && (
        <ul className="sm-hud-powers">
          {foePowers.map((f) => <li key={f} className={usedPowers.includes(f) ? 'used' : ''} title={POWER_OF[f]?.flavor}>{POWER_OF[f]?.name}</li>)}
          {monarquePower && <li key="monarque-power" className={usedPowers.includes('@edict') ? 'used' : ''} title={monarquePower.description}>{monarquePower.character} · Monarque</li>}
        </ul>
      )}
    </div>
    </>
  );
  return slot ? createPortal(body, slot) : body;
}
