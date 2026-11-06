import { L } from '../game/lexicon.js';
import registry from '../data/cards.json';

const byEffect = (type, effectId) => registry.find(c => c.type === type && c.effectId === effectId);
import { SIDE_QUEST_TEXT } from '../game/presentation.js';
import { FIGHTER_BY_ID } from '../story/roster.js';
import { powerFactsFromEvent } from '../game/powerFacts.js';

const CREST = '/ui/monarque.webp';
const GM_FALLBACK = { GM_GIFT: ['Monarque’s Boon', 'Monarque grants an Edict to the vessel that needs it.', '/story/edicts/monarque-boon.webp'] };
/** The most recent power an opponent played: read from the event log so it stays on screen until they play another. */
function lastFoePower(state) {
  const humanId = state.players?.[0]?.id;
  const ev = [...(state.eventLog ?? [])].reverse().find((e) => e.type === 'WILDCARD_USED' && e.playerId !== humanId && e.effectId !== 'CURSE');
  if (!ev) return null;
  const who = state.players.find((p) => p.id === ev.playerId); const st = ev.detail?.story ?? ev.card?.story ?? null;
  const owner = st?.fighter ? (FIGHTER_BY_ID[st.fighter]?.short ?? st.fighter) : null;
  const title = st?.name ?? ev.card?.character ?? ev.card?.title ?? 'A power';
  const bits = [owner ? `${owner}’s power` : null, ...(st?.applied ?? [])].filter(Boolean).join(' · ');
  // What the power actually DOES, in plain words (same source as the round log): "Now: the foe must play blind, cannot boost, …"
  let effect = '';
  try { effect = (powerFactsFromEvent(ev) ?? []).find((r) => r.key === 'timing')?.note ?? ''; } catch { effect = ''; }
  effect = effect.replace(/^Now:\s*/, '').replace(/\s*Later:.*$/, '');
  const head = owner ? `${owner}’s power. ` : '';
  const text = effect ? `${head}${effect.charAt(0).toUpperCase()}${effect.slice(1)}` : (bits || 'Last power played');
  return { id: `foe-${ev.seq}`, kind: 'foe', title: `${who?.name ?? 'Opponent'} · ${title}`, image: ev.card?.image || CREST, text: `${text} (round ${ev.round})`, tag: 'LAST' };
}
const CRAZY_KEYS = { publicForecast: 'PUBLIC_FORECAST', noApex: 'NO_APEX', totalMight: 'TOTAL_MIGHT', wishRound: 'WISH_ROUND', highStakes: 'HIGH_STAKES', zenkai: 'ZENKAI' };

/** Big centre reveal of a special card (whim / omen / edict / Unraveling outcome). */
export function SpecialSpotlight({ item }) {
  if (!item) return null;
  return (
    <div className={`special-spotlight tone-${item.tone} ${item.fx ? `fx-${item.fx}` : ''}`} role="status" aria-live="assertive" key={item.key}>
      <div className="special-spotlight-glow" />
      <div className="special-spotlight-card">
        {item.fx === 'MAFUBA' && <div className="mafuba-chains" aria-hidden="true"><i /><i /><i /><i /></div>}
        {item.sacrifice && <div className="sacrifice-rite" aria-hidden="true"><span className="sacrifice-ring" /><span className="sacrifice-hp"><b>−{item.sacrifice.hp}</b><i>HP</i></span><span className="sacrifice-arrow">⟶</span><span className="sacrifice-ki"><b>+{item.sacrifice.ki}</b><i>{L('SOUL')}</i></span></div>}
        {item.image ? <img src={item.image} alt="" /> : null}
        <div className="special-spotlight-copy">
          {item.kicker && <small>{L(item.kicker)}</small>}
          <strong>{L(item.title)}</strong>
          {item.text && <span>{L(item.text)}</span>}
        </div>
      </div>
    </div>
  );
}

/** Small persistent icons for whatever special card is currently in play, plus a round-log toggle. */
export function SpecialCorner({ state, logLines, logOpen, onToggleLog }) {
  const chips = [];
  const fx = state.activeEffects ?? {};
  for (const [key, effectId] of Object.entries(CRAZY_KEYS)) {
    if (fx[key]) { const c = byEffect('CRAZY_ROUND', effectId); chips.push({ id: key, kind: 'crazy', title: c?.title ?? key, image: c?.image, rounds: fx[key], text: c?.description }); }
  }
  if (fx.timeChamber) { const c = byEffect('GM_POWER', 'TIME_CHAMBER'); chips.push({ id: 'chamber', kind: 'gm', title: 'The Hollow Hour', image: c?.image, rounds: fx.timeChamber, text: 'HP lost on placement is ×1.5.' }); }
  if (fx.bounty) { const c = byEffect('GM_POWER', 'BOUNTY_HUNT'); const t = state.players.find(p => p.id === fx.bounty.targetId); chips.push({ id: 'bounty', kind: 'gm', title: 'The Debt Called', image: c?.image, text: `${t?.name ?? 'The champion'} is named. Place above them for +8 HP, +2 Soul.` }); }
  if (fx.sideQuest) { const c = byEffect('GM_POWER', 'SIDE_QUEST'); chips.push({ id: 'quest', kind: 'gm', title: 'A Trial Is Set', image: c?.image, text: `${SIDE_QUEST_TEXT[fx.sideQuest.type]?.(fx.sideQuest) ?? fx.sideQuest.text} First to do it: +12 HP, +2 Soul.` }); }
  if (state.lastGm) {
    const c = byEffect('GM_POWER', state.lastGm.effectId); const fb = GM_FALLBACK[state.lastGm.effectId];
    const target = state.players.find((p) => p.id === state.lastGm.targetId);
    const gift = state.lastGm.effectId === 'GM_GIFT' && target ? `${target.name} is granted ${state.lastGm.giftTitle ?? 'an Edict'}.` : '';
    chips.unshift({ id: 'lastgm', kind: 'gm', title: `Monarque · ${c?.title ?? fb?.[0] ?? 'A decree'}`, image: c?.image || fb?.[2] || CREST, text: `${gift || c?.description || fb?.[1] || ''} (round ${state.lastGm.round})`.trim() });
  }
  const foe = lastFoePower(state); if (foe) chips.push(foe);
  if (state.domainInversionRounds > 0) { const c = byEffect('WILDCARD', 'OTHER_WORLD'); chips.push({ id: 'domain', kind: 'wild', title: fx.backwards ? 'The Reversed Hour' : 'The Inverted Realm', image: c?.image, rounds: state.domainInversionRounds, text: 'The LOWER stat wins.' }); }
  if (fx.immortality) { const holder = state.players.find(p => p.id === fx.immortality.playerId); chips.push({ id: 'immortal', kind: 'wild', title: 'Unbreaking', image: byEffect('WILDCARD', 'SHENRON_WISH')?.image, rounds: fx.immortality.rounds, text: `${holder?.name ?? 'A vessel'} takes no HP damage.` }); }
  if (state.scheduledGm?.round === (state.roundNumber + 1)) chips.push({ id: 'stir', kind: 'gm warn', title: 'Monarque stirs…', image: CREST, text: 'A whim lands next round.' });
  const curseHolder = state.players.find(p => p.id === state.curse?.ownerId);
  if (curseHolder) chips.push({ id: 'curse', kind: 'curse', title: 'The Unraveling', image: byEffect('WILDCARD', 'CURSE')?.image, text: `${curseHolder.name} · severity ${state.curse.severity + 1}/3`, rounds: undefined });
  return (
    <aside className="special-corner" aria-label="Active special cards">
      <div className="special-corner-icons">
        {chips.map(chip => (
          <div key={chip.id} className={`special-chip ${chip.kind}`} tabIndex={0}>
            {chip.image ? <img src={chip.image} alt="" /> : <span className="special-chip-fallback">✦</span>}
            {chip.rounds ? <b className="special-chip-rounds">{chip.rounds}</b> : null}
            {chip.tag ? <b className="special-chip-tag">{chip.tag}</b> : null}
            <div className="special-chip-tip"><strong>{L(chip.title)}{chip.rounds ? ` · ${chip.rounds} round${chip.rounds > 1 ? 's' : ''}` : ''}</strong><span>{L(chip.text)}</span></div>
          </div>
        ))}
        <button type="button" className={`special-log-toggle ${logOpen ? 'open' : ''}`} onClick={onToggleLog} aria-expanded={logOpen} aria-label="Toggle round log">LOG</button>
      </div>
      {logOpen && <ol className="round-log">{logLines.length ? logLines.map((l, i) => <li key={i}><b>R{l.round}</b> {l.text}{l.facts ? <small className="round-log-facts">{l.facts}</small> : null}</li>) : <li>No events yet.</li>}</ol>}
    </aside>
  );
}
