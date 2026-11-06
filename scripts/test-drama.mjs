import fs from 'node:fs';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/GameEngine.js';
import { AIEngine } from '../src/game/AIEngine.js';
import { takeAiTurn } from '../src/game/AITurn.js';
import { clutchBonus, DRAMA } from '../src/game/drama.js';
const registry = JSON.parse(fs.readFileSync(new URL('../src/data/cards.json', import.meta.url), 'utf8'));
const seeded = (n) => () => { n = (n * 48271) % 2147483647; return n / 2147483647; };

function play(drama, mode, seed) {
  const random = seeded(seed); const engine = new GameEngine(registry, { random, drama });
  engine.createMatch(mode, Array.from({ length: mode }, (_, i) => `AI ${i + 1}`)); engine.state.players.forEach((p) => { p.type = 'AI'; }); engine.startMatch();
  const ai = new AIEngine(registry, random); let steps = 0; const reck = [];
  while (engine.state.phase !== 'MATCH_COMPLETE' && steps++ < 4000) {
    const s = engine.state; if (s.reckoning) { const alive = s.players.filter((p) => p.hp > 0); reck.push({ n: alive.length, ok: alive.every((p) => p.hp <= (p.maxHp ?? 100) * DRAMA.reckoningAt) }); }
    takeAiTurn(engine, ai, s.currentPlayer);
  }
  assert.equal(engine.state.phase, 'MATCH_COMPLETE', `drama=${drama} seed ${seed} stalled`);
  const log = engine.state.eventLog ?? [];
  return { engine, breaths: log.filter((e) => e.type === 'LAST_BREATH'), reck, recks: log.filter((e) => e.type === 'FINAL_RECKONING') };
}

// Off by default: no drama events, no flags.
for (const seed of [1, 2, 3]) { const r = play(false, 2, seed); assert.equal(r.breaths.length, 0); assert.equal(r.recks.length, 0); assert.equal(r.engine.state.drama, false); assert.ok(r.engine.state.players.every((p) => p.breathUsed === undefined)); }

// On: Last Breath at most once per fighter, only for fighters at <=25% HP when it fired; Reckoning only with two fighters both <=35%.
let breaths = 0, recks = 0, matches = 0;
for (const mode of [2, 4]) for (let seed = 1; seed <= 10; seed++) {
  const r = play(true, mode, seed * 3); matches++;
  const per = {}; for (const b of r.breaths) per[b.playerId] = (per[b.playerId] ?? 0) + 1;
  assert.ok(Object.values(per).every((n) => n === 1), 'Last Breath fires once per fighter');
  assert.ok(r.reck.every((x) => x.n === 2 && x.ok), 'Final Reckoning only for two nearly-spent fighters');
  breaths += r.breaths.length; recks += r.recks.length;
}
assert.ok(breaths >= matches, `Last Breath should be common (got ${breaths} in ${matches} matches)`);
console.log(`drama ok: ${breaths} Last Breaths, ${recks} Final Reckoning rounds over ${matches} matches`);

// The halving is real: a fighter holding the shield loses at most half of what the table says.
{ const random = seeded(11); const e = new GameEngine(registry, { random, drama: true }); e.createMatch(2, ['A', 'B']); e.state.players.forEach((p) => { p.type = 'AI'; }); e.startMatch();
  const ai = new AIEngine(registry, random); e.state.players[0].hp = 24; let seenShield = false, steps = 0;
  while (e.state.phase !== 'MATCH_COMPLETE' && steps++ < 600 && !seenShield) {
    const s = e.state; takeAiTurn(e, ai, s.currentPlayer);
    const p = e.state.players[0]; if (p.breathUsed && e.state.lastRound) { seenShield = true; assert.equal(p.breathShield, e.state.roundNumber, 'shield covers the next round'); assert.ok(p.ki >= 0); }
  }
  assert.ok(seenShield, 'a fighter at 24 HP draws a Last Breath after the first round'); }

// Rewards.
const fin = (hp, breath, won = true, drama = true) => ({ drama, winner: won ? 'player-1' : 'player-2', players: [{ id: 'player-1', hp, maxHp: 100, breathUsed: breath }, { id: 'player-2', hp: 0 }] });
assert.equal(clutchBonus(fin(15, false)).coins, 2); assert.equal(clutchBonus(fin(15, true)).coins, 5); assert.equal(clutchBonus(fin(60, true)).coins, 3);
assert.equal(clutchBonus(fin(60, false)).coins, 0); assert.equal(clutchBonus(fin(10, true, false)).coins, 0); assert.equal(clutchBonus(fin(10, true, true, false)).coins, 0);
console.log('drama tests passed');
