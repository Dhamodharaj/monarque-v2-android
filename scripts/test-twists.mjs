import fs from 'node:fs';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/GameEngine.js';
import { AIEngine } from '../src/game/AIEngine.js';
import { takeAiTurn } from '../src/game/AITurn.js';
import { TWISTS, TWIST_IDS, pickTwist, twistOf } from '../src/game/twists.js';
import { newRun, buildDuelCfg, twistFor } from '../src/story/storyFlow.js';
import { ROSTER } from '../src/story/roster.js';
const registry = JSON.parse(fs.readFileSync(new URL('../src/data/cards.json', import.meta.url), 'utf8'));
const seeded = (n) => () => { n = (n * 48271) % 2147483647; return n / 2147483647; };

assert.equal(twistOf('nope'), null); assert.equal(twistOf('__proto__'), null);
assert.equal(pickTwist(() => 0, 0.5), null); assert.ok(TWIST_IDS.includes(pickTwist(seeded(3), 0)));

function play(twist, mode, seed) {
  const random = seeded(seed);
  const engine = new GameEngine(registry, { random, twist });
  engine.createMatch(mode, Array.from({ length: mode }, (_, i) => `AI ${i + 1}`)); engine.state.players.forEach((p) => { p.type = 'AI'; }); engine.startMatch();
  const ai = new AIEngine(registry, random); let steps = 0, inverted = [], rounds = 0, seenRound = 0;
  while (engine.state.phase !== 'MATCH_COMPLETE' && steps++ < 4000) {
    if (engine.state.roundNumber !== seenRound) { seenRound = engine.state.roundNumber; if (engine.state.domainInversionRounds > 0) inverted.push(seenRound); }
    takeAiTurn(engine, ai, engine.state.currentPlayer);
  }
  assert.equal(engine.state.phase, 'MATCH_COMPLETE', `${twist} stalled`);
  return { engine, inverted, rounds: engine.state.roundNumber };
}
for (const id of [null, ...TWIST_IDS]) for (const mode of [2, 4]) for (const seed of [1, 2, 3]) {
  const { engine, inverted } = play(id, mode, seed);
  assert.equal(engine.state.twist, id);
  if (id === 'MIRROR_ROUNDS') for (let r = 4; r < engine.state.roundNumber; r += 4) assert.ok(inverted.includes(r), `round ${r} should be a Mirror Round (inverted: ${inverted})`);
}
console.log('PASS every twist finishes 2p and 4p matches');

// Effects are real: Blood Moon ends sooner than Iron Veil on average over the same seeds.
const avg = (id) => [1, 2, 3, 4, 5, 6].reduce((n, s) => n + play(id, 2, s).rounds, 0) / 6;
const moon = avg('BLOOD_MOON'), veil = avg('IRON_VEIL'); console.log(`avg rounds: Blood Moon ${moon.toFixed(1)} vs Iron Veil ${veil.toFixed(1)}`);
assert.ok(moon < veil, 'Blood Moon should be shorter than Iron Veil');
// Soul Tide starts everyone with +1 Soul each round.
const st = new GameEngine(registry, { random: seeded(9), twist: 'SOUL_TIDE' }); st.createMatch(2, ['A', 'B']); const base = new GameEngine(registry, { random: seeded(9) }); base.createMatch(2, ['A', 'B']);
st.startMatch(); base.startMatch(); assert.equal(st.state.players[0].ki, base.state.players[0].ki + 1);

// Story: only rounds 2-5, deterministic per run seed, carried into the duel config.
const run = newRun(ROSTER[0].id, 'twist-seed');
const per = [1, 2, 3, 4, 5, 6, 7].map((round) => twistFor({ ...run, round }));
assert.equal(per[0], null); assert.equal(per[5], null); assert.equal(per[6], null);
assert.deepEqual(per, [1, 2, 3, 4, 5, 6, 7].map((round) => twistFor({ ...run, round })));
let seen = new Set(); for (let i = 0; i < 60; i++) for (const r of [2, 3, 4, 5]) { const t = twistFor({ ...run, seed: `s${i}`, round: r }); if (t) seen.add(t.id); }
assert.equal(seen.size, TWIST_IDS.length, 'every twist can appear in Story');
const withT = [2, 3, 4, 5].map((round) => buildDuelCfg({ ...run, round })).find((c) => c.twist); if (withT) { assert.equal(withT.hud.twist.id, withT.twist); }
console.log('twist tests passed');
