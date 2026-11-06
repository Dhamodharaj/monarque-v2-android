import { useEffect, useState } from 'react';
import EmoteTray from './EmoteTray';
import { portraitFor } from '../utils/portrait.js';
import CoinDisplay from './CoinDisplay';
import { SOUL } from '../game/lexicon.js';

const initials = (name = '') => name.replace(/[^\p{L}\s-]/gu, '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const hueOf = (s = '') => { let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 40; return 165 + h; };

export default function OpponentArea({ player, position, active, state = null, floaters = [], ko = false, speech = null, onReact = null }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState(null);
  useEffect(() => { setOpen(false); }, [speech?.id]);
  const myEmote = mine && mine.id === speech?.id ? mine.e : null;
  const dead = player.hp <= 0;
  const hp = Math.max(0, player.hp ?? 100); const maxHp = Math.max(1, player.maxHp ?? 100);
  const badges = [];
  if (state?.curse?.ownerId === player.id) badges.push(['curse', `☠ UNRAVELING ${state.curse.severity + 1}/3${state.curse.attemptedThisRound ? ' · INVOKED' : ''}`, `Holds the Unraveling: loses HP and ${SOUL()} every round until it is broken or passed on.`]);
  if (state?.activeEffects?.immortality?.playerId === player.id) badges.push(['immortal', '✦ UNBROKEN', 'Takes no HP damage.']);
  if (state?.activeEffects?.bounty?.targetId === player.id) badges.push(['bounty', '✦ IN DEBT', 'Named by Monarque: whoever places above them gains HP and Soul.']);
  const sealed = Object.values(state?.sealedCards ?? {}).filter(sl => sl.ownerId === player.id).length;
  if (sealed) badges.push(['sealed', `⛓ ${sealed} SEALED`, 'Cards sealed by the Binding Seal.']);
  const cooling = player.lockedCardIds?.length ?? 0;
  if (cooling) badges.push(['cooldown', `⏳ ${cooling}`, `${cooling} card(s) cooling down — they cannot be played yet.`]);
  if (state?.solarFlareLeader && state.solarFlareLeader !== player.id && !dead) badges.push(['blind', '◐ BLIND', 'Blinded by the Eclipse: must play a random card.']);
  const left = player.lastStandLeft;
  if (!dead && typeof left === 'number') badges.push([`laststand n${left}`, `LAST STAND ×${left}`, `Last-Stand cards left: free, only playable at 0 ${SOUL()}. Playing one shields that round’s HP loss and gives +3 ${SOUL()}.`]);
  const backs = Math.min(player.hand.length, 5);

  return (
    <article data-pid={player.id} className={`opp2 opponent-${position} ${active ? 'active' : ''} ${dead ? 'eliminated' : ''} ${ko ? 'ko-flash' : ''}`}>
      {speech && !dead && (
        <div key={speech.id} className={`opp2-speech mood-${speech.mood}${speech.text ? '' : ' emo-only'}${open ? ' open' : ''}`} role="status">
          <button type="button" className="opp2-speech-hit" disabled={!onReact} aria-expanded={open} title="Tap to react with an emoji" aria-label={`${player.name}${speech.text ? `: ${speech.text}` : ''}. Tap to react with an emoji`} onClick={() => setOpen((o) => !o)}>
            {speech.emoji && <span className="opp2-emo" aria-hidden="true">{speech.emoji}</span>}
            {speech.text && <span className="opp2-text">{speech.text}</span>}
          </button>
          {myEmote && <span className="opp2-yours" title="Your reaction">{myEmote}</span>}
          {open && onReact && <EmoteTray onPick={(e) => { setMine({ id: speech.id, e }); setOpen(false); onReact(player.id, e); }} />}
        </div>
      )}
      {floaters.map(f => <span key={f.id} className={`floater ${f.kind}`}>{f.text}</span>)}
      <div className="opp2-avatar" style={{ '--h': hueOf(player.name) }} aria-hidden="true"><b>{initials(player.name)}</b>{portraitFor(player.name) && <img className="avatar-img" src={portraitFor(player.name)} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}</div>
      <div className="opp2-main">
        <div className="opp2-top"><strong>{player.name}</strong><span className="opp2-hand-count" title="Cards in hand">🂠 {player.hand.length}</span><CoinDisplay coins={player.coins} /></div>
        <div className="opp2-hp" title={`${hp} / ${maxHp} HP`}><span className="opp2-hp-label">HP</span><div className="opp2-hp-bar"><i style={{ width: `${Math.min(100, (hp / maxHp) * 100)}%` }} className={hp / maxHp <= 0.25 ? 'low' : hp / maxHp <= 0.55 ? 'mid' : ''} /></div><b>{hp}</b></div>
        {badges.length > 0 && <div className="opp2-badges">{badges.map(([k, t, tip]) => <span key={k} title={tip} className={`opp-badge ${k}`}>{t}</span>)}</div>}
        <div className="opp2-backs" aria-hidden="true">{Array.from({ length: backs }, (_, i) => <i key={i} />)}{player.hand.length > backs && <em>+{player.hand.length - backs}</em>}</div>
        <div className={`opp2-status ${active ? 'is-active' : ''}`}><span className="status-dot" />{dead ? (player.koReason === 'LAST_STAND' ? `Eliminated — out of ${SOUL()}` : player.koReason === 'STUCK' ? `Declared lost — no ${SOUL()}, no way back` : 'Eliminated') : active ? (state?.phase === 'GM_DECREE' ? 'Answering the whim…' : 'Playing…') : 'Waiting'}</div>
      </div>
    </article>
  );
}
