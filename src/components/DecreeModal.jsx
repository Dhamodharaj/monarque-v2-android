import { useState } from 'react';
import { L, SOUL } from '../game/lexicon.js';
import CardArt from './CardArt.jsx';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { gameSounds } from '../utils/sound.js';
import { getCardCost } from '../game/CardTiers.js';
import registry from '../data/cards.json';

const CHARACTERS = registry.filter((c) => c.type === 'CHARACTER');

const EV = GAME_CONFIG.events;
const WISHES = {
  HEAL: ['Mending', `+${EV.wish.heal} HP`], KI: ['Surge of Soul', `+${EV.wish.ki} Soul`],
  RECALL: ['Recall', 'Clear all your cooldowns'], THIEF: ['A Taken Being', 'Take a random card from last place']
};
const TITLES = { DRAFT: 'THE CULLING DRAFT', AUCTION: 'THE SILENT TITHE', TRAINING: 'RITE OF THE WHETSTONE', WISH: 'THE BOON ROUND' };

/** Interactive Monarque whim for the human player (draft / tithe / whetstone / boon). */
export default function DecreeModal({ state, human, options, onAct }) {
  const decree = state.decree;
  const [bid, setBid] = useState(0);
  const [trainId, setTrainId] = useState(null);
  const [stat, setStat] = useState('POWER');
  if (!decree || !options) return null;
  const nameOf = (id) => state.players.find(p => p.id === id)?.name ?? 'A vessel';
  const header = (sub) => <header><small>MONARQUE</small><h2>{TITLES[decree.kind]}</h2><p>{L(sub)}</p></header>;
  const act = (choice, cue = 'ui') => { gameSounds.cue(cue, 0.8); onAct(choice); };
  let body = null;

  if (decree.kind === 'DRAFT') {
    const position = decree.order.indexOf(human.id) + 1;
    body = <>
      {header(`Pick one card to add to your hand. You draft ${position === 1 ? 'first' : `#${position}`} (the weakest vessels choose first).`)}
      <div className="decree-pool">
        {decree.pool.map(c => {
          const ok = options.cards.includes(c.id);
          return <button type="button" key={c.id} disabled={!ok} className={`decree-card ${c.type === 'WILDCARD' ? 'wild' : ''}`} onClick={() => act({ cardId: c.id }, 'draftPick')}>
            <div className="decree-card-art">{c.type === 'WILDCARD' ? <img src={c.image} alt="" /> : <CardArt card={c} />}</div>
            <strong>{c.character}</strong>
            {c.type === 'WILDCARD' ? <small>WILDCARD · {c.title}</small> : <small>P {c.power} · R {c.rank}</small>}
          </button>;
        })}
      </div>
      {!options.cards.length && <button type="button" className="decree-go" onClick={() => act({ cardId: null })}>Skip</button>}
    </>;
  } else if (decree.kind === 'AUCTION') {
    const max = options.maxBid;
    body = <>
      {header(`Secretly offer 0–${max} Soul. The single highest offer wins +${EV.auction.heal} HP and ${EV.auction.kiBack} Soul back. Everyone pays their offer; tied top offers cancel out.`)}
      <div className="decree-bids">{Array.from({ length: max + 1 }, (_, i) => <button type="button" key={i} className={bid === i ? 'on' : ''} onClick={() => { setBid(i); gameSounds.cue('auctionTick', 0.7); }}><b>{i}</b><small>{SOUL()}</small></button>)}</div>
      <p className="decree-note">You have {human.ki} {SOUL()}. Offers still to come: {decree.order.length - decree.idx - 1}.</p>
      <button type="button" className="decree-go" onClick={() => act({ bid }, 'auctionTick')}>PLACE OFFER · {bid} {SOUL().toUpperCase()}</button>
    </>;
  } else if (decree.kind === 'TRAINING') {
    const mine = human.hand.filter(c => options.cards.includes(c.id)).sort((a, b) => b.power - a.power);
    const sel = mine.find(c => c.id === trainId);
    body = <>
      {header(`Choose one card to train for the rest of the match: +${options.power} Power or −${options.rank} Rank.`)}
      <div className="decree-pool train">
        {mine.map(c => <button type="button" key={c.id} className={`decree-card ${trainId === c.id ? 'on' : ''}`} onClick={() => { setTrainId(c.id); gameSounds.cue('cardSelect', 0.6); }}>
          <div className="decree-card-art"><CardArt card={c} /></div><strong>{c.character}</strong><small>P {c.power} · R {c.rank}{c.trained ? ' ★' : ''}</small><small className="decree-cost" title={`Costs ${getCardCost(c, CHARACTERS)} ${SOUL()} to play`}>⚡ {getCardCost(c, CHARACTERS)} {SOUL()}</small></button>)}
      </div>
      <div className="decree-bids stat">{['POWER', 'RANK'].map(s => {
        const off = sel && (s === 'POWER' ? sel.power >= 999 : sel.rank <= 1);
        return <button type="button" key={s} disabled={off} className={stat === s ? 'on' : ''} onClick={() => setStat(s)}><b>{s === 'POWER' ? `+${options.power}` : `−${options.rank}`}</b><small>{s}{sel ? ` → ${s === 'POWER' ? Math.min(999, sel.power + options.power) : Math.max(1, sel.rank - options.rank)}` : ''}</small></button>;
      })}</div>
      <button type="button" className="decree-go" disabled={!sel} onClick={() => act({ cardId: trainId, stat }, 'training')}>HONE {sel ? sel.character.toUpperCase() : ''}</button>
    </>;
  } else if (decree.kind === 'WISH') {
    body = <>
      {header('You won the round — Monarque grants you one boon.')}
      <div className="decree-wishes">{options.wishes.map(w => <button type="button" key={w} onClick={() => act({ wish: w }, 'wishGlow')}><strong>{L(WISHES[w][0])}</strong><span>{L(w === 'THIEF' && options.victimId ? `Take a random card from ${nameOf(options.victimId)}` : WISHES[w][1])}</span></button>)}</div>
    </>;
  }
  return <div className={`decree-layer kind-${decree.kind.toLowerCase()}`} role="dialog" aria-modal="true" aria-label={TITLES[decree.kind]}><div className="decree-panel">{body}</div></div>;
}

/** Small banner shown while an AI vessel is answering the whim. */
export function DecreeWaiting({ state }) {
  const d = state.decree; if (!d) return null;
  const who = state.players.find(p => p.id === state.currentPlayer)?.name ?? 'A vessel';
  const verb = { DRAFT: 'is drafting a card', AUCTION: 'is placing a bid', TRAINING: 'is training', WISH: 'is making a wish' }[d.kind];
  return <div className="decree-waiting" role="status"><span className="decree-waiting-dot" />{TITLES[d.kind]} · {who} {verb}…</div>;
}
