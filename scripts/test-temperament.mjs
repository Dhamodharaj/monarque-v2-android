// Temperament must change REAL decisions, not just dialogue. Same state, same seeds, different temperament -> measurably different power use.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStoryEngine } from '../src/story/duel.js';
import { POWERS } from '../src/story/powers.js';
import { makePowerPicker, temperamentOf, PERSONA } from '../src/story/storyAI.js';
const cards = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url)));
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log(`PASS ${m}`); };

const of = (family) => POWERS.find((p) => p.family === family && p.grade !== 'C').fighter;
const families = ['FINAL_ATONEMENT', 'SOLAR_FLARE', 'SENZU', 'SCOUTER'];
const foePowers = families.map(of);

/** Counts how often each temperament picks each family in a staged state. */
function tally(temperament, { foeHp, meHp, round }) {
  const counts = Object.fromEntries(families.map((f) => [f, 0])); let none = 0; const TRIALS = 400;
  for (let i = 0; i < TRIALS; i++) {
    const eng = createStoryEngine(cards, { random: rng(500 + i), human: { name: 'H', powers: [], step: 3 }, foe: { name: 'F', powers: foePowers, step: 3 } });
    const me = eng.state.players[1], foe = eng.state.players[0];
    me.hp = meHp; me.ki = 14; foe.hp = foeHp; eng.state.roundNumber = round; eng.state.currentPlayer = me.id;
    const pick = makePowerPicker(eng, temperament, rng(9000 + i));
    const r = pick(me, eng.getState());
    if (!r) { none++; continue; }
    const card = eng.getWildcardCards(me.id).find((c) => c.id === r.cardId);
    counts[card.effectId]++;
  }
  return { counts, none, TRIALS };
}

ok(temperamentOf('HEROES') === 'SOVEREIGN' && temperamentOf('DEVOURER') === 'DEVOURER' && Object.keys(PERSONA).length === 4, 'four temperaments; legacy groups map onto them');

// 1. Sovereign never gambles its own HP (Final Atonement) when the kill is not there; Devourer will when the foe is hurt.
const sov = tally('SOVEREIGN', { foeHp: 90, meHp: 80, round: 6 });
ok(sov.counts.FINAL_ATONEMENT === 0, 'SOVEREIGN never self-damages without a lethal window');
const devLow = tally('DEVOURER', { foeHp: 24, meHp: 80, round: 6 });
const devHigh = tally('DEVOURER', { foeHp: 95, meHp: 80, round: 6 });
const off = (t) => t.counts.FINAL_ATONEMENT + t.counts.SOLAR_FLARE;
ok(off(devLow) > off(devHigh), `DEVOURER presses offensive powers harder when the foe is hurt (${off(devLow)} vs ${off(devHigh)})`);

// 2. Ancient conserves: nothing in the opening rounds, and fewer low-value plays overall than Deceiver.
const ancEarly = tally('ANCIENT', { foeHp: 90, meHp: 90, round: 1 });
ok(ancEarly.none === ancEarly.TRIALS, 'ANCIENT holds everything in the opening rounds');
const decEarly = tally('DECEIVER', { foeHp: 90, meHp: 90, round: 1 });
ok(decEarly.none < decEarly.TRIALS, 'DECEIVER acts early');

// 3. Deceiver prefers blinding/foresight early; Sovereign is quieter with them.
const decBlind = decEarly.counts.SOLAR_FLARE + decEarly.counts.SCOUTER;
const sovEarly = tally('SOVEREIGN', { foeHp: 90, meHp: 90, round: 1 });
ok(decBlind > sovEarly.counts.SOLAR_FLARE + sovEarly.counts.SCOUTER, `DECEIVER uses blind/foresight early more than SOVEREIGN (${decBlind} vs ${sovEarly.counts.SOLAR_FLARE + sovEarly.counts.SCOUTER})`);

// 4. Overall the temperaments are distinguishable (not four copies of one policy).
const sig = (t) => JSON.stringify([t.none, ...Object.values(t.counts)]);
const sigs = new Set(['SOVEREIGN', 'DECEIVER', 'DEVOURER', 'ANCIENT'].map((t) => sig(tally(t, { foeHp: 40, meHp: 60, round: 5 }))));
ok(sigs.size >= 3, `at least three distinct behaviour signatures (${sigs.size})`);
console.log(`PASS temperament decision tests (${n})`);
