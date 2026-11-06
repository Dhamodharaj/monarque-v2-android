import assert from 'node:assert/strict';
import { DIFFICULTIES, DIFFICULTY_ORDER, normalizeDifficulty, difficultyOf, scaleAdapt, applyDifficultyToAI } from '../src/config/difficulty.js';
import { newRun, buildDuelCfg } from '../src/story/storyFlow.js';
import { AIEngine } from '../src/game/AIEngine.js';

// Easy is a slight step above the raw engine defaults, still the gentlest level.
const e = DIFFICULTIES.easy;
assert.ok(e.foeHpMul > 1 && e.foeHpMul < 1.15 && e.fuzz < 0.6 && e.fuzz > 0.35 && e.rivalHp > 0 && e.rivalHp < 10);
assert.equal(normalizeDifficulty('bogus'), 'easy'); assert.equal(normalizeDifficulty(undefined), 'easy'); assert.equal(normalizeDifficulty('__proto__'), 'easy');
// Monotonic ramp.
const [a, b, c] = DIFFICULTY_ORDER.map(difficultyOf);
for (const k of ['adaptMul', 'aggrAdd', 'foeHpMul', 'foeKiMul', 'eagerMul']) assert.ok(a[k] <= b[k] && b[k] <= c[k], k);
for (const k of ['fuzz', 'noiseMul', 'mistakeMul']) assert.ok(a[k] >= b[k] && b[k] >= c[k], k);
assert.equal(scaleAdapt(0.9, 'hard'), 1);
const ai = applyDifficultyToAI(new AIEngine(), 'hard'); assert.equal(ai.fuzz, 0); assert.equal(ai.noiseMul, 0.15);

// Story config: easy (and old saves without a field) identical to each other; harder levels tougher.
const run = newRun('goku' in {} ? 'goku' : (await import('../src/story/roster.js')).ROSTER[0].id, 'seed-1');
const cfg = (d, r = 2) => buildDuelCfg({ ...run, round: r, difficulty: d });
const old = buildDuelCfg({ ...run, round: 2, difficulty: undefined });
assert.deepEqual(cfg('easy'), old);
const [ce, cn, ch] = ['easy', 'normal', 'hard'].map((d) => cfg(d));
assert.ok(ce.foe.start.hp < cn.foe.start.hp && cn.foe.start.hp < ch.foe.start.hp);
assert.ok(ce.aggression < cn.aggression && cn.aggression < ch.aggression);
assert.equal(ch.mistake, 0); assert.ok(cn.mistake < ce.mistake && cn.mistake > 0);
assert.ok(ce.adapt <= cn.adapt && cn.adapt <= ch.adapt && ch.adapt <= 1);
assert.ok(Math.abs(ch.foe.start.maxHp / ce.foe.start.maxHp - 1.5 / 1.08) < 0.03);
// Final boss too.
const g = buildDuelCfg({ ...run, round: 7, boutsLost: 0, difficulty: 'hard' }); assert.ok(g.foe.start.hp > buildDuelCfg({ ...run, round: 7, boutsLost: 0 }).foe.start.hp);
assert.equal(newRun(run.fighterId, 's', null, 'hard').difficulty, 'hard'); assert.equal(newRun(run.fighterId, 's').difficulty, 'easy');
console.log('difficulty tests passed');
// Battle rival bonus: only AI seats, none on Easy.
import { GameEngine } from '../src/game/GameEngine.js';
import { applyRivalBonus } from '../src/config/difficulty.js';
const cards = JSON.parse((await import('node:fs')).readFileSync(new URL('../src/data/cards.json', import.meta.url), 'utf8'));
const mk = () => { const en = new GameEngine(Array.isArray(cards) ? cards : cards.cards); en.createMatch(2, ['Me', 'Foe']); en.startMatch(); return en; };
const eEasy = mk(); const hp0 = eEasy.state.players[1].hp; applyRivalBonus(eEasy, 'easy'); assert.equal(eEasy.state.players[1].hp, hp0 + 5);
const eHard = mk(); applyRivalBonus(eHard, 'hard');
assert.equal(eHard.state.players[1].hp, hp0 + 30); assert.equal(eHard.state.players[1].maxHp, 130); assert.equal(eHard.state.players[0].hp, hp0);
console.log('rival bonus ok');
