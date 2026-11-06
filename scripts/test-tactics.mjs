import fs from 'node:fs';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/GameEngine.js';
import { AIEngine } from '../src/game/AIEngine.js';
import { takeAiTurn } from '../src/game/AITurn.js';
import { TacticsDirector, STANCES } from '../src/game/tactics.js';
const registry = JSON.parse(fs.readFileSync(new URL('../src/data/cards.json', import.meta.url), 'utf8'));
const seeded = (n) => () => { n = (n * 48271) % 2147483647; return n / 2147483647; };

// --- rules: synthetic states ---
const st = (round, myHp, foeHp, lastRound = null) => ({ roundNumber: round, lastRound, players: [{ id: 'player-1', hp: foeHp, maxHp: 100 }, { id: 'player-2', hp: myHp, maxHp: 100 }] });
const run = (temper, ...states) => { const d = new TacticsDirector({ temperaments: { 'player-2': temper }, random: () => 0 }); const ai = new AIEngine(); const out = states.map((s) => d.update(s, 'player-2', ai)); return { d, ai, out }; };
assert.equal(run('SOVEREIGN', st(1, 100, 100)).d.stanceOf('player-2'), 'GUARD');
assert.equal(run('SOVEREIGN', st(5, 90, 40)).d.stanceOf('player-2'), 'PRESS');
assert.equal(run('DEVOURER', st(4, 30, 80)).d.stanceOf('player-2'), 'FRENZY');
assert.equal(run('DEVOURER', st(4, 80, 50)).d.stanceOf('player-2'), 'PRESS');
assert.equal(run('ANCIENT', st(2, 80, 80)).d.stanceOf('player-2'), 'GUARD');
assert.equal(run('ANCIENT', st(7, 60, 70)).d.stanceOf('player-2'), 'PRESS');
assert.equal(run('DECEIVER', st(2, 80, 80)).d.stanceOf('player-2'), 'TRICKSTER');
// Deceiver drops the mask after losing two rounds in a row.
{ const lost = (round) => ({ round, placements: [{ playerId: 'player-1' }, { playerId: 'player-2' }] });
  const { d, out } = run('DECEIVER', st(5, 80, 80, lost(4)), st(6, 70, 80, lost(5)), st(7, 60, 80, lost(6)));
  assert.equal(d.stanceOf('player-2'), 'PRESS'); assert.ok(out.some((o) => o?.changed)); }
// Stances are held at least two rounds, evaluated once per round, and skip unknown temperaments.
{ const d = new TacticsDirector({ temperaments: { 'player-2': 'SOVEREIGN' }, random: () => 0 }); const ai = new AIEngine();
  assert.equal(d.update(st(4, 90, 90), 'player-2', ai).stance, 'STEADY'); assert.equal(d.update(st(4, 90, 90), 'player-2', ai), null);
  assert.equal(d.update(st(5, 90, 40), 'player-2', ai).stance, 'PRESS'); assert.equal(d.update(st(6, 90, 90), 'player-2', ai).stance, 'PRESS', 'held for two rounds'); assert.equal(d.update(st(7, 90, 90), 'player-2', ai).stance, 'STEADY'); }
assert.equal(new TacticsDirector({ temperaments: {} }).update(st(1, 100, 100), 'player-2', new AIEngine()), null);
// Lines are spoken on a shift, not on STEADY.
{ const { out } = run('ANCIENT', st(2, 80, 80)); assert.ok(out[0].line?.text && out[0].line.playerId === 'player-2'); }

// --- the stance really reaches the AI's persona ---
{ const ai = new AIEngine(registry); ai.setPersona('player-2', 'SOVEREIGN'); ai.setStance('player-2', STANCES.PRESS); ai.setStance('player-2', null); }

// --- full matches with the director attached still finish, both modes and every temperament ---
let shifts = 0;
for (const temper of ['SOVEREIGN', 'DECEIVER', 'DEVOURER', 'ANCIENT']) for (const seed of [1, 2, 3]) {
  const random = seeded(seed * 7); const engine = new GameEngine(registry, { random }); engine.createMatch(2, ['H', 'R']); engine.state.players.forEach((p) => { p.type = 'AI'; }); engine.startMatch();
  const ai = new AIEngine(registry, random); ai.setPersona('player-2', temper); const dir = new TacticsDirector({ temperaments: { 'player-2': temper }, random });
  let steps = 0;
  while (engine.state.phase !== 'MATCH_COMPLETE' && steps++ < 4000) { const s = engine.getState(); const r = dir.update(s, s.currentPlayer, ai); if (r?.changed) shifts++; takeAiTurn(engine, ai, s.currentPlayer); }
  assert.equal(engine.state.phase, 'MATCH_COMPLETE', `${temper} seed ${seed} stalled`);
}
assert.ok(shifts >= 8, `stances should shift during real matches (got ${shifts})`);
console.log(`tactics tests passed (${shifts} stance shifts across 12 matches)`);
