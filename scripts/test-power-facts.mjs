// The power facts shown before activation (Soul cost, HP cost, duration, counter, spent, timing) must match what the engine does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStoryEngine } from '../src/story/duel.js';
import { POWERS, powerCard, BERSERK_BOOST } from '../src/story/powers.js';
import { powerFacts, powerFactsFromEvent } from '../src/game/powerFacts.js';
import { describeEvent, factsLine } from '../src/game/presentation.js';
import { GAME_CONFIG } from '../src/config/gameConfig.js';

const cards = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url)));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const row = (f, key) => f.rows.find((r) => r.key === key);
const num = (s) => (/free|none/i.test(s) ? 0 : Number(String(s).match(/\d+/)?.[0] ?? NaN));

// Stage a power and use it the way the existing story test does. Returns what changed.
function fire(spec, step, { meImmune = false, foeImmune = false } = {}) {
  const eng = createStoryEngine(cards, { random: rng(7), human: { name: 'H', powers: [spec.fighter], step }, foe: { name: 'F', powers: [], step: 1 } });
  const me = eng.state.players[0], foe = eng.state.players[1];
  eng.state.currentPlayer = me.id; me.ki = 14; me.hp = 60; foe.ki = 14; foe.hp = 100;
  if (meImmune) eng.state.activeEffects.immortality = { playerId: me.id, rounds: 2 };
  if (foeImmune) eng.state.activeEffects.immortality = { playerId: foe.id, rounds: 2 };
  const card = me.hand.find((c) => c.id.startsWith('pow-'));
  const facts = powerFacts(card);
  let fc = null, round0 = 1, foeKi0 = 14;
  if (spec.family === 'MAFUBA' || (spec.family === 'SHENRON_WISH' && spec.wish === 'ABSOLUTE_POWER')) {
    eng.state.currentPlayer = foe.id; eng.state.roundLeaderId = foe.id; eng.callStat(foe.id, 'POWER');
    fc = foe.hand.find((c) => c.type !== 'WILDCARD' && !c.lastStand); eng.playCard(foe.id, fc.id, {}); round0 = eng.state.roundNumber; foeKi0 = foe.ki;
    eng.useWildcard(me.id, card.id, spec.family === 'MAFUBA' ? { targetCardId: fc.id } : {});
  } else if (spec.family === 'SOLAR_FLARE') { eng.state.roundLeaderId = me.id; eng.useWildcard(me.id, card.id, {}); }
  else if (spec.family === 'SCOUTER') eng.useWildcard(me.id, card.id, { targetId: foe.id });
  else eng.useWildcard(me.id, card.id, {});
  return { eng, me, foe, card, facts, fc, round0, foeKi0, R: card.story.rider };
}

let checked = 0;
for (const spec of POWERS) for (const step of [1, 2, 3]) {
  const { eng, me, foe, card, facts, fc, round0, foeKi0, R } = fire(spec, step);
  const tag = `${spec.fighter} step ${step}`;
  ok(facts.rows.length === 6 && facts.rows.every((r) => r.label && r.value), `${tag}: six filled rows`);
  ok(['soul', 'hp', 'duration', 'counter', 'spent', 'timing'].every((k) => row(facts, k)), `${tag}: every requested fact is present`);
  // Spent: the power leaves the hand
  ok(!me.hand.some((c) => c.id === card.id) && /spent/i.test(row(facts, 'spent').value), `${tag}: spent for the duel`);
  if (R.gamble) { ok(num(row(facts, 'soul').value) === 0 && num(row(facts, 'hp').value) === 0, `${tag}: gamble is free and costs no HP`); continue; }
  // Soul: stated price, minus the refund the power gives back
  ok(num(row(facts, 'soul').value) === spec.ki[step - 1], `${tag}: stated Soul cost is ${spec.ki[step - 1]}`);
  ok(14 - me.ki === spec.ki[step - 1] - (R.ki ?? 0), `${tag}: engine charged the stated Soul (net of its refund)`);
  // HP: stated price is what the engine takes from you (heal riders aside)
  const hpCost = num(row(facts, 'hp').value), healed = spec.family === 'FINAL_ATONEMENT' ? 0 : (R.hp ?? 0);
  ok(60 - me.hp === hpCost - healed, `${tag}: engine took the stated ${hpCost} HP (heal ${healed})`);
  // Duration
  if (spec.family === 'OTHER_WORLD') { ok(eng.state.domainInversionRounds === R.rounds && row(facts, 'duration').value.startsWith(`${R.rounds} round`), `${tag}: inversion lasts ${R.rounds} rounds`); }
  if (spec.family === 'SHENRON_WISH' && spec.wish === 'IMMORTALITY') { ok(eng.state.activeEffects.immortality.rounds === R.rounds && row(facts, 'duration').value.startsWith(`${R.rounds} round`), `${tag}: Unbreaking lasts ${R.rounds} rounds`); }
  if (R.shield) ok(eng.state.activeEffects.immortality?.rounds === R.shield && /shield/.test(row(facts, 'duration').value), `${tag}: shield lasts ${R.shield} rounds`);
  if (spec.family === 'MAFUBA') { ok(eng.state.sealedCards[fc.id].releaseRound - round0 === GAME_CONFIG.mafubaSealRounds + 1 && row(facts, 'duration').value.includes(`${GAME_CONFIG.mafubaSealRounds} rounds`), `${tag}: seal lasts ${GAME_CONFIG.mafubaSealRounds} rounds`); }
  if (spec.family === 'SHENRON_WISH' && spec.wish === 'DIVINE_DESTRUCTION') ok(eng.state.banishedCards.some((c) => c.reason === 'divine-destruction') && /permanent/i.test(row(facts, 'duration').value), `${tag}: the card is gone for the duel`);
  // Timing: a bonus to the next card is a future effect and the engine stores it for that card
  if (R.nextPower || R.nextRank) ok((me.nextBonus?.power ?? 0) === (R.nextPower ?? 0) && (me.nextBonus?.rank ?? 0) === (R.nextRank ?? 0) && /future/i.test(row(facts, 'timing').value), `${tag}: next-card bonus is stored and labelled as future`);
  if (R.oppKi) ok(foeKi0 - foe.ki === R.oppKi, `${tag}: foe lost the stated Soul`);
  checked++;
}
ok(checked >= 31 * 3, `${checked} powers x steps checked against the engine`);

// Counter claims: Unbreaking cancels HP loss, and your own HP cost is waived while you are shielded; Soul loss cannot be blocked.
{
  const surtr = POWERS.find((p) => p.fighter === 'surtr');
  const a = fire(surtr, 1, { foeImmune: true });
  ok(a.foe.hp === 100, 'Unbreaking cancels the Reckoning HP loss on the foe');
  ok(/Unbreaking/.test(row(a.facts, 'counter').note), 'the counter note says so');
  const kali = POWERS.find((p) => p.fighter === 'kali');
  const b = fire(kali, 1, { meImmune: true });
  ok(b.me.hp === 60, 'your HP cost is not paid while Unbreaking shields you');
  ok(/Not paid while Unbreaking/.test(row(b.facts, 'hp').note), 'the HP note says so');
  const balor = POWERS.find((p) => p.fighter === 'balor');
  const c = fire(balor, 1, { foeImmune: true });
  ok(14 - c.foe.ki === c.R.oppKi && /Soul loss cannot be blocked/.test(row(c.facts, 'counter').note), 'Soul loss goes through Unbreaking');
}

// Pre-use block: a Blinding Eclipse leaves the foe unable to use a power that round.
{
  const eng = createStoryEngine(cards, { random: rng(11), human: { name: 'H', powers: ['hades'], step: 1 }, foe: { name: 'F', powers: ['beelzebub'], step: 1 } });
  const me = eng.state.players[0], foe = eng.state.players[1];
  eng.state.currentPlayer = foe.id; eng.state.roundLeaderId = foe.id; foe.ki = 14;
  eng.useWildcard(foe.id, foe.hand.find((c) => c.id.startsWith('pow-')).id, {});
  eng.state.currentPlayer = me.id;
  const status = eng.getWildcardCards(me.id).find((c) => c.id.startsWith('pow-'));
  ok(status && !status.usable && /Blinded/.test(status.reason), 'a Blinding Eclipse blocks your power that round');
  ok(/Blinding Eclipse or an Edict lockout blocks it/.test(row(powerFacts(status), 'counter').note), 'the sheet warns about it before you try');
}

// Berserk surge: the facts follow the boosted card, not the base row.
{
  const base = powerFacts(powerCard('tiamat', 3, 'p1', 1)), boosted = powerFacts(powerCard('tiamat', 3, 'p1', BERSERK_BOOST));
  ok(row(base, 'duration').value !== row(boosted, 'duration').value, 'a berserk-boosted power states its boosted duration');
  ok(row(base, 'hp').value === row(boosted, 'hp').value && row(base, 'soul').value === row(boosted, 'soul').value, 'the costs you pay are not boosted');
}

// Un-enhanced Edicts (Battle Mode) are covered too.
{
  const eng = createStoryEngine(cards, { random: rng(5), human: { name: 'H', powers: [], step: 1, gifts: ['SENZU', 'FINAL_ATONEMENT', 'OTHER_WORLD', 'SHENRON_WISH', 'MAFUBA'] }, foe: { name: 'F', powers: [], step: 1 } });
  const hand = eng.state.players[0].hand.filter((c) => c.type === 'WILDCARD');
  ok(hand.length === 5, 'five base Edicts staged');
  for (const c of hand) { const f = powerFacts(c, { wish: 'IMMORTALITY' }); ok(f.rows.length === 6 && /match/.test(row(f, 'spent').value), `${c.effectId}: base Edict facts say spent for the match`); }
  const fa = powerFacts(hand.find((c) => c.effectId === 'FINAL_ATONEMENT'));
  ok(num(row(fa, 'hp').value) === 15, 'base Reckoning states its 15 HP cost');
  ok(num(row(powerFacts(hand.find((c) => c.effectId === 'SHENRON_WISH')), 'soul').value) === 4, 'base Boon states its 4 Soul cost');
}
// Activation: the event every player sees (the foe's too) carries the same six facts, built from what the engine resolved.
{
  let fromEvents = 0;
  for (const spec of POWERS) for (const step of [1, 2, 3]) {
    const { eng, me, card, facts } = fire(spec, step);
    const ev = eng.state.eventLog.filter((e) => e.type === 'WILDCARD_USED' && e.playerId === me.id).at(-1);
    ok(ev, `${spec.fighter} step ${step}: activation event emitted`);
    const rows = powerFactsFromEvent(ev);
    ok(rows.length === 6 && rows.every((r) => r.label && r.short), `${spec.fighter} step ${step}: event facts have six short answers`);
    ok(rows.every((r, i) => r.value === facts.rows[i].value), `${spec.fighter} step ${step}: event facts equal the pre-use sheet`);
    const d = describeEvent(ev, () => 'H');
    ok(d.facts && factsLine(d.facts).split(' · ').length >= 6, `${spec.fighter} step ${step}: spotlight/log carry the facts`);
    fromEvents++;
  }
  ok(fromEvents === POWERS.length * 3, 'every power and step reports its facts when used');
  const eng = createStoryEngine(cards, { random: rng(5), human: { name: 'H', powers: [], step: 1, gifts: ['FINAL_ATONEMENT', 'SENZU'] }, foe: { name: 'F', powers: [], step: 1 } });
  eng.state.currentPlayer = eng.state.players[0].id;
  const fa = eng.state.players[0].hand.find((c) => c.effectId === 'FINAL_ATONEMENT');
  eng.useWildcard(eng.state.players[0].id, fa.id, {});
  const evFa = eng.state.eventLog.find((e) => e.type === 'WILDCARD_USED' && e.effectId === 'FINAL_ATONEMENT');
  const rf = powerFactsFromEvent(evFa);
  ok(rf.find((r) => r.key === 'hp').short === '15 HP' && rf.find((r) => r.key === 'spent').short === 'Spent: this match', 'a base Edict event reports its fixed HP cost');
}
console.log(`PASS power facts match the engine (${n} checks)`);
