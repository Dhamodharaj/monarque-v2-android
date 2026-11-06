// Plain-language "what will this cost me and what will it do" facts for a power or Edict, shown before the player commits.
// PRESENTATION ONLY: every number is read from the card the engine will resolve (card.story.kiCost / card.story.rider) or from
// the same GAME_CONFIG constants the engine uses. Nothing here changes a rule, and scripts/test-power-facts.mjs checks the
// claims against the real engine so the text cannot drift.
import { GAME_CONFIG } from '../config/gameConfig.js';

const SEAL_ROUNDS = GAME_CONFIG.mafubaSealRounds;
const n = (v, w) => `${v} ${w}${v === 1 ? '' : 's'}`;

// Un-enhanced Edicts (Battle Mode, and Monarque's own hand) use fixed numbers, mirrored from the engine.
const BASE = {
  SENZU: { soul: 0, rider: { hp: 25, ki: 5 } },
  FINAL_ATONEMENT: { soul: 0, rider: { self: 15, others: 17 } },
  OTHER_WORLD: { soul: 0, rider: { rounds: 2 } },
  SOLAR_FLARE: { soul: 0, rider: {} },
  SCOUTER: { soul: 0, rider: {} },
  SHENRON_WISH: { soul: 4, rider: { rounds: 2 } },
  MAFUBA: { soul: null, rider: {} },
  CURSE: { soul: 0, rider: {} },
};

/**
 * @param card  a wild card as dealt by the engine (story Powers carry `card.story`)
 * @param opts  { wish, stat } the boon the player has picked for an un-enhanced Wish
 * @returns {{ rows: {key,label,value,note?,tone?}[] }} six rows: Soul cost, HP cost, Duration, Counter, Spent, Timing
 */
export function powerFacts(card, opts = {}) {
  const e = card.effectId, st = card.story ?? null;
  const base = BASE[e] ?? { soul: 0, rider: {} };
  const R = st ? (st.rider ?? {}) : base.rider;
  const soul = st ? st.kiCost : base.soul;
  const wish = st ? st.wish : (opts.wish ?? 'IMMORTALITY');
  const gamble = Boolean(R.gamble);
  const now = [], later = [], dur = [], counter = [], needs = [];
  let hpCost = 0, hpNote = '', spent, spentNote = '';

  // ---- the effect riders every enhanced Power can carry (all resolve the instant it is used)
  if (!gamble) {
    if (R.hp && e !== 'FINAL_ATONEMENT') now.push(`heal ${R.hp} HP`);
    if (R.ki) now.push(`regain ${R.ki} Soul`);
    if (R.oppKi) now.push(`foe loses ${R.oppKi} Soul`);
    if (R.oppDmg) { now.push(`foe loses ${R.oppDmg} HP`); counter.push('Unbreaking cancels the HP loss'); }
    if (R.oppKi) counter.push('Soul loss cannot be blocked');
    if (R.cdClear) now.push('your cooldowns are cleared');
    if (R.draw) { now.push(`draw ${n(R.draw, 'card')}`); later.push(`the ${R.draw === 1 ? 'card is' : 'cards are'} ready next round`); }
    if (R.nextPower) later.push(`your next card played gets +${R.nextPower} Power`);
    if (R.nextRank) later.push(`your next card played gets −${R.nextRank} Rank`);
    if (R.shield) { later.push(`Unbreaking shields you for ${n(R.shield, 'round')}`); dur.push(`shield ${n(R.shield, 'round')}`); }
  } else {
    now.push('one random outcome from six (heal, Soul, foe HP, foe Soul, Rank or Power)');
    counter.push('Unbreaking cancels the foe-HP outcome');
  }

  // ---- the family itself
  switch (e) {
    case 'SENZU':
      dur.unshift('Instant');
      if (!st) { now.push('heal 25 HP, regain 5 Soul'); }
      if (!st || R.cdClear || R.cdMinus) { now.push(st && R.cdMinus ? `your cooldowns drop by ${R.cdMinus}` : st ? '' : 'your cooldowns drop by 1 round'); }
      break;
    case 'FINAL_ATONEMENT': {
      const self = st ? (R.self ?? 15) : 15, others = st ? (R.others ?? 17) : 17;
      hpCost = self;
      now.push(`foe loses ${others} HP`, 'the round ends at once: no ranking, no rewards');
      later.push('every card played this round is on a 2-round cooldown');
      dur.unshift('Instant, and it ends the round');
      counter.push('Unbreaking cancels the HP loss, yours and the foe’s');
      break;
    }
    case 'OTHER_WORLD': {
      const r = R.rounds ?? 2;
      now.push('the lower stat wins instead of the higher');
      later.push(`still inverted for ${n(r - 1, 'more round')}`);
      dur.unshift(`${n(r, 'round')}, counting this one`);
      counter.push('Only one Inversion can run at a time');
      break;
    }
    case 'SOLAR_FLARE':
      needs.push('Leader only, before anyone plays.');
      now.push('the foe must play blind, cannot boost, and cannot use Edicts or Powers');
      dur.unshift('This round only');
      break;
    case 'SCOUTER':
      now.push('you scan the foe’s Soul, HP and best cards (only you see it)');
      dur.unshift('The report lasts this round only');
      break;
    case 'SHENRON_WISH':
      if (wish === 'IMMORTALITY') {
        const r = R.rounds ?? 2;
        now.push('Unbreaking: you take no HP loss from now on');
        if (r > 1) later.push(`it lasts ${n(r - 1, 'more round')}`);
        dur.unshift(`${n(r, 'round')}, counting this one`);
      } else if (wish === 'ABSOLUTE_POWER') {
        const stat = (st ? st.stat : opts.stat) === 'RANK' ? 'RANK' : 'POWER';
        now.push(stat === 'RANK' ? 'the card you play this round has its Rank halved' : 'the card you play this round has its Power doubled');
        dur.unshift('This round, on the card you play');
        needs.push('Needs a card already on the table.');
      } else if (wish === 'DIVINE_DESTRUCTION') {
        now.push('the foe loses one random card');
        later.push(st ? 'that card is gone for the rest of this duel' : 'that card is gone for the rest of this match');
        dur.unshift(st ? 'Permanent for this duel' : 'Permanent for this match');
        counter.push('Only cards that are ready are taken: cooling, sealed and Last Stand cards are safe');
      }
      if (!st) spentNote = 'One boon per match, for the whole table.';
      break;
    case 'MAFUBA':
      needs.push('Needs a card already on the table.');
      now.push('the foe’s played card is sealed and the round is voided');
      later.push(`the sealed card stays unavailable for ${n(SEAL_ROUNDS, 'round')}`);
      dur.unshift(`Round voided now; card sealed ${n(SEAL_ROUNDS, 'round')}`);
      counter.push('The seal cannot be lifted early; cooldown tools skip it');
      break;
    case 'CURSE':
      now.push('the card you play this round decides whether the Unraveling is destroyed, passed on or worsens');
      later.push('while you carry it, it drains HP and Soul each round');
      dur.unshift('Decided by this round’s ranking');
      hpNote = 'None now. While you carry it, it drains HP every round.';
      spent = 'Not spent'; spentNote = 'You keep it until it is destroyed or passed on.';
      break;
    default: dur.unshift('Instant');
  }

  // ---- row values
  const soulValue = e === 'MAFUBA' && !st ? '1–3 Soul' : (soul ? `${soul} Soul` : 'Free');
  const soulNote = e === 'MAFUBA' && !st ? 'By the sealed card’s tier: Elusive 1, Normal 2, Powerful and OP 3.' : (R.ki && !gamble ? `You regain ${R.ki} Soul on use, so the net price is ${Math.max(0, soul - R.ki) ? n(Math.max(0, soul - R.ki), 'Soul') : 'nothing'}.` : '');
  const hpSelf = hpCost || (gamble ? 0 : (R.selfDmg ?? 0));
  const hpValue = hpSelf ? `${hpSelf} HP` : 'None';
  const hpDetail = hpNote || (hpSelf ? (st ? 'Not paid while Unbreaking shields you. Unusable if it would leave you at 0 HP.' : 'Not paid while Unbreaking shields you. It can eliminate you.') : '');
  if (!spent) { spent = st ? 'Spent for this duel' : 'Spent for this match'; if (!spentNote && st) spentNote = 'It returns at the start of your next duel.'; }
  const future = later.length > 0, current = now.length > 0 || dur.some((d) => /round/i.test(d));
  const timing = gamble ? 'Depends on the roll' : future && current ? 'This round and future rounds' : future ? 'Future rounds' : 'This round only';
  const timingNote = gamble ? 'Four of the six outcomes land at once. The other two (a Rank bonus, or a Power bonus with a heal and Soul) apply to your next card played.' : [now.filter(Boolean).length ? `Now: ${now.filter(Boolean).join('; ')}.` : '', later.length ? `Later: ${later.join('; ')}.` : ''].filter(Boolean).join(' ');
  const thing = st ? 'power' : 'Edict';
  const gate = `${needs.join(' ')}${needs.length ? ' ' : ''}A Blinding Eclipse or an Edict lockout blocks it, and you may use only one ${thing} per round.`;
  const counterNote = [...new Set(counter)].map((s) => `${s.replace(/\.$/, '')}.`);

  // Compact wording of the same six answers, for the in-hand chips, the activation spotlight and the round log.
  const counterShort = counterNote.length && counter.some((c) => /Unbreaking/.test(c)) ? 'Only Unbreaking can blunt the HP loss' : 'Cannot be countered';
  const spentShort = spent.replace(/^Spent for /, 'Spent: ');
  return {
    rows: [
      { key: 'soul', label: 'Soul cost', value: soulValue, short: soulValue, note: soulNote },
      { key: 'hp', label: 'HP cost', value: hpValue, short: hpSelf ? `${hpSelf} HP` : 'No HP cost', note: hpDetail, tone: hpSelf ? 'risk' : undefined },
      { key: 'duration', label: 'Duration', value: dur.filter(Boolean).join(' · ') || 'Instant', short: dur.filter(Boolean)[0] || 'Instant' },
      { key: 'counter', label: 'Can it be countered?', value: e === 'CURSE' ? 'No' : 'No. The foe cannot answer it once it is used.', short: counterShort, note: [...counterNote, gate].join(' ') },
      { key: 'spent', label: 'Spent?', value: spent, short: spentShort, note: spentNote },
      { key: 'timing', label: 'Changes', value: timing, short: timing, note: timingNote },
    ],
  };
}

/** Facts for a power as it was just used (any player). Built from the WILDCARD_USED event, so it matches what the engine resolved. */
export function powerFactsFromEvent(ev) {
  const c = ev?.card; if (!c) return null;
  const d = ev.detail ?? {};
  const card = { effectId: ev.effectId ?? c.effectId, story: c.story && c.story.kiCost !== undefined ? c.story : null };
  const rows = powerFacts(card, { wish: d.wish, stat: d.stat }).rows;
  // A base Seal's price depends on the sealed card: the engine reports what was actually paid.
  if (!card.story && card.effectId === 'MAFUBA' && d.paidKi) rows[0] = { ...rows[0], value: `${d.paidKi} Soul`, short: `${d.paidKi} Soul` };
  return rows;
}
