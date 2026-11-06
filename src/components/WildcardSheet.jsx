import { useEffect, useState } from 'react';
import { classifyCard } from '../game/CardTiers.js';
import { powerFacts } from '../game/powerFacts.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { L, SOUL } from '../game/lexicon.js';
import { FIGHTER_BY_ID } from '../story/roster.js';
import registry from '../data/cards.json';
const characters = registry.filter(c => c.type === 'CHARACTER');

const SEAL = GAME_CONFIG.mafubaSealRounds;
const RULES = {
  SENZU: ['The Last Draught', 'Restore 25 HP and 5 Soul, and reduce every cooldown on your cards by 1 round (Binding Seals are not reduced).', 'Free'],
  FINAL_ATONEMENT: ['The Reckoning', 'You lose 15 HP and every other vessel loses 17 HP. The round ends immediately — no ranking, no rewards. Cards already played get a 1-round cooldown.', '15 HP'],
  OTHER_WORLD: ['The Inverted Realm', 'For 2 rounds the LOWER stat wins instead of the higher one (lowest Power wins a POWER call, highest Rank number wins a RANK call). Boosts still add Power / lower Rank.', 'Free'],
  MAFUBA: ['The Binding Seal', `Play this INSTEAD of a being. Seal one card already on the table: its owner and you sit this round out, the other two cards are ranked, and the sealed card is unavailable for ${SEAL} rounds. Needs at least three vessels.`, '1–3 Soul by card tier'],
  SCOUTER: ['The Oracle’s Gaze', 'Scan one opponent: you see their Soul, HP, hand size, their 3 highest-Power cards and best-Rank card, and which are ready or on cooldown. Only you see it, and the report lasts for this round.', 'Free'],
  SOLAR_FLARE: ['The Blinding Eclipse', 'Leader only, before anyone plays. Every opponent must choose their card blind this round and cannot use Edicts.', 'Free'],
  SHENRON_WISH: ['Monarque’s Boon', 'One boon, once per match for the whole table. Pick the boon below.', '4 Soul'],
  CURSE: ['The Unraveling', 'Attempt to rid yourself of the Unraveling with the card you play this round. 1st place by 15+ points destroys it (+10 HP, +3 Soul, +2 coins, −6 HP to all others). A big enough loss passes it on; a bad last place makes it worse. Allowed two rounds in a row, then one round of rest.', 'Free']
};
const WISHES = [
  ['IMMORTALITY', 'Unbreaking', 'No HP damage for 2 rounds.'],
  ['ABSOLUTE_POWER', 'Absolute Measure', 'Double Power or halve Rank on the card you play this round.'],
  ['DIVINE_DESTRUCTION', 'Culling', 'Every opponent permanently loses one random unsealed card.']
];

export default function WildcardSheet({ card, status, state, human, onClose, onConfirm }) {
  const [wish, setWish] = useState('IMMORTALITY');
  const [stat, setStat] = useState('POWER');
  const [targetId, setTargetId] = useState(null);
  const [targetCardId, setTargetCardId] = useState(null);
  useEffect(() => { const onKey = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  if (!card) return null;
  const story = card.story ?? null;
  const [subtitle, rules] = story ? [card.title, `${card.description}${story.flavor ? ` — ${story.flavor}` : ''}`] : (RULES[card.effectId] ?? [card.title, card.description]);
  const wishSel = story?.wish ?? wish;
  const facts = powerFacts(card, { wish: wishSel, stat: story?.stat ?? stat });
  const opponents = state.players.filter(p => p.id !== human.id && p.hp > 0);
  const plays = state.currentTrick?.plays ?? [];
  const mafubaCost = (c) => GAME_CONFIG.mafubaKi[classifyCard(c, characters)] ?? 3;
  let options = {}; let complete = true; let hint = '';
  if (card.effectId === 'SHENRON_WISH') { options = { wish: wishSel, ...(wishSel === 'ABSOLUTE_POWER' ? { stat: story?.stat ?? stat } : {}) }; if (wishSel === 'ABSOLUTE_POWER' && state.phase !== 'PLAYING_CARD' && !state.currentTrick) { complete = false; hint = 'Absolute Measure needs a call first — choose your card and POWER/RANK, then play it.'; } }
  if (card.effectId === 'SCOUTER') { options = { targetId }; complete = Boolean(targetId); if (!complete) hint = 'Choose a vessel to scan.'; }
  if (card.effectId === 'MAFUBA') { options = { targetCardId }; complete = Boolean(targetCardId); if (!complete) hint = plays.length ? 'Choose the card to seal.' : 'No card is on the table yet.'; }
  const ready = status?.usable && complete;
  return (
    <div className="wildcard-sheet-layer" role="dialog" aria-modal="true" aria-label={`${card.character} ${story ? 'Power' : 'Edict'}`} onClick={onClose}>
      <div className="wildcard-sheet" onClick={(e) => e.stopPropagation()}>
        <img className="wildcard-sheet-art" src={card.image} alt="" />
        <div className="wildcard-sheet-body">
          <small>{story ? `${(FIGHTER_BY_ID[story.fighter]?.name ?? story.fighter).toUpperCase()}’S POWER · ${['', 'RESISTANCE', 'ADAPTATION', 'STABILITY'][story.step]} · ONE PER ROUND` : 'EDICT · ONE PER ROUND'}</small>
          <h2>{L(card.character)}</h2>
          <h3>{subtitle}</h3>
          <p>{L(rules)}</p>
          <dl className="wildcard-sheet-facts" aria-label="What it costs and what it does">
            {facts.rows.map((r) => <div key={r.key} className={`wsf-row${r.tone ? ` ${r.tone}` : ''}`}><dt>{r.label}</dt><dd><b>{r.value}</b>{r.note && <small>{r.note}</small>}</dd></div>)}
          </dl>
          {card.effectId === 'CURSE' && state.curse?.ownerId === human.id && <div className="wildcard-sheet-note">Severity {state.curse.severity + 1}/3 · drains {1 + state.curse.severity} HP and {SOUL()} each round.</div>}

          {card.effectId === 'SHENRON_WISH' && !story && <div className="wildcard-sheet-picker">{WISHES.map(([id, name, text]) => <button type="button" key={id} className={wish === id ? 'on' : ''} onClick={() => setWish(id)}><strong>{name}</strong><span>{text}</span></button>)}
            {wish === 'ABSOLUTE_POWER' && <div className="wildcard-sheet-row">Boost: {['POWER', 'RANK'].map(s => <button type="button" key={s} className={stat === s ? 'on' : ''} onClick={() => setStat(s)}>{s}</button>)}</div>}</div>}
          {card.effectId === 'SCOUTER' && <div className="wildcard-sheet-picker">{opponents.map(p => <button type="button" key={p.id} className={targetId === p.id ? 'on' : ''} onClick={() => setTargetId(p.id)}><strong>{p.name}</strong><span>{p.hp} HP · {p.hand.length} cards</span></button>)}</div>}
          {card.effectId === 'MAFUBA' && <div className="wildcard-sheet-picker cards">{plays.length ? plays.map(pl => { const owner = state.players.find(p => p.id === pl.playerId); return <button type="button" key={pl.card.id} className={targetCardId === pl.card.id ? 'on' : ''} onClick={() => setTargetCardId(pl.card.id)}>{pl.card.image && <img src={pl.card.image} alt="" />}<strong>{pl.card.character}</strong><span>{owner?.name} · {mafubaCost(pl.card)} {SOUL()}</span></button>; }) : <em>No card on the table yet.</em>}</div>}

          {!status?.usable && <div className="wildcard-sheet-warn">{status?.reason || 'Not available right now.'}</div>}
          {status?.usable && !complete && <div className="wildcard-sheet-warn soft">{hint}</div>}
          <div className="wildcard-sheet-actions">
            <button type="button" className="ghost" onClick={onClose}>Cancel</button>
            <button type="button" className="use" disabled={!ready} onClick={() => onConfirm(options)}>USE {card.character.toUpperCase()}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
