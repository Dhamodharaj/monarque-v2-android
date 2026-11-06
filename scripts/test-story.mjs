// Story duels run on the real Battle engine. Checks: powers behave as Edicts, GM gifts, no freezes, balance.
import { readFileSync } from 'node:fs';
import { GameEngine } from '../src/game/GameEngine.js';
import { AIEngine } from '../src/game/AIEngine.js';
import { takeAiTurn } from '../src/game/AITurn.js';
import { createStoryEngine } from '../src/story/duel.js';
import { POWERS, POWER_OF, powerCard } from '../src/story/powers.js';
import { ROSTER, FIGHTER_BY_ID } from '../src/story/roster.js';
import { makePowerPicker } from '../src/story/storyAI.js';
const cards = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url)));
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

ok(POWERS.length === 32 && new Set(POWERS.map(p => p.fighter)).size === 32 && POWERS.every(p => FIGHTER_BY_ID[p.fighter]), '32 fighters, one power each');
// every power fires without throwing at every step
let fireErr = 0, fired = 0;
for (const spec of POWERS) for (const step of [1, 2, 3]) {
  const eng = createStoryEngine(cards, { random: rng(7), human: { name: 'H', powers: [spec.fighter], step }, foe: { name: 'F', powers: [], step: 1 } });
  const me = eng.state.players[0];
  eng.state.currentPlayer = me.id; me.ki = 14;
  const card = me.hand.find(c => c.id.startsWith('pow-'));
  try {
    if (spec.family === 'MAFUBA' || (spec.family === 'SHENRON_WISH' && spec.wish === 'ABSOLUTE_POWER')) {
      const foeId = eng.state.players[1].id; // staged: leader = foe plays first
      eng.state.currentPlayer = foeId; eng.state.roundLeaderId = foeId;
      eng.callStat(foeId, 'POWER'); const fc = eng.state.players[1].hand.find(c => c.type !== 'WILDCARD' && !c.lastStand && eng.getView(foeId).players[1].hand.length);
      eng.playCard(foeId, fc.id, {});
      if (spec.family === 'MAFUBA') eng.useWildcard(me.id, card.id, { targetCardId: fc.id }); else eng.useWildcard(me.id, card.id, {});
    } else if (spec.family === 'SOLAR_FLARE') { eng.state.currentPlayer = me.id; eng.state.roundLeaderId = me.id; eng.useWildcard(me.id, card.id, {}); }
    else if (spec.family === 'SCOUTER') eng.useWildcard(me.id, card.id, { targetId: eng.state.players[1].id });
    else eng.useWildcard(me.id, card.id, {});
    fired++;
  } catch (e) { fireErr++; console.log('  fire error', spec.fighter, step, e.message); }
}
ok(fireErr === 0, `all 32 powers x 3 steps fire (${fired}/96)`);

// A power is a Edict: one per round, consumed, shown in the Edict list
{
  const eng = createStoryEngine(cards, { random: rng(3), human: { name: 'H', powers: ['baron-samedi', 'hades', 'the-reaper'], step: 2 }, foe: { name: 'F', powers: ['shuten-doji'], step: 1 } });
  const me = eng.state.players[0];
  eng.state.currentPlayer = me.id;
  const wc = eng.getWildcardCards(me.id);
  ok(wc.length === 3 && wc.every(c => c.type === 'WILDCARD' && c.story), 'powers appear in the Edict hand (3 of 3)');
  const hpBefore = me.hp; me.hp = 50;
  eng.useWildcard(me.id, wc.find(c => c.story.fighter === 'baron-samedi').id, {});
  ok(me.hp === 50 + 25, 'Baron Samedi Step II (Adaptation) mends 25 HP');
  let blocked = false; try { eng.useWildcard(me.id, wc.find(c => c.story.fighter === 'the-reaper').id, {}); } catch { blocked = true; }
  ok(blocked, 'only one power per round (same Edict rule)');
  ok(eng.getWildcardCards(me.id).length === 2, 'used power is consumed for the duel');
  void hpBefore;
}
// No random wild cards; GM gifts exist
{
  const eng = createStoryEngine(cards, { random: rng(11), human: { name: 'H', powers: [], step: 1 }, foe: { name: 'F', powers: [], step: 1 } });
  ok(eng.state.players.every(p => p.hand.filter(c => c.type === 'WILDCARD').length === 0) && eng.state.reserveDeck.every(c => c.type !== 'WILDCARD'), 'duel starts with no Edicts');
}
// Full AI-vs-AI duels, both sides use powers; measure
function playDuel(seed, humanFighter, foeFighter, hStep, fStep, foeGm = null) {
  const random = rng(seed);
  const eng = createStoryEngine(cards, { random, human: { name: 'H', powers: [humanFighter, 'the-reaper'].slice(0, hStep), step: hStep }, foe: foeGm != null ? { name: 'GM', gmBout: foeGm } : { name: 'F', powers: [foeFighter], step: fStep } });
  const ais = [new AIEngine(cards, random), new AIEngine(cards, random)];
  const pickers = [makePowerPicker(eng, 'SOVEREIGN', random), makePowerPicker(eng, FIGHTER_BY_ID[foeFighter]?.temperament ?? 'DEVOURER', random)];
  let steps = 0, powers = [0, 0], gifts = 0, gm = 0; const seen = new Set();
  while (eng.state.phase !== 'MATCH_COMPLETE' && steps++ < 800) {
    const id = eng.state.currentPlayer; const idx = eng.state.players.findIndex(p => p.id === id);
    takeAiTurn(eng, ais[idx], id, { pickWildcard: pickers[idx] });
    for (const e of eng.state.eventLog) if (!seen.has(e.seq)) { seen.add(e.seq); if (e.type === 'WILDCARD_USED' && e.detail?.story) powers[idx === 0 ? 0 : 1]++; if (e.type === 'GM_POWER') { gm++; if (e.effectId === 'GM_GIFT') gifts++; } }
  }
  return { done: eng.state.phase === 'MATCH_COMPLETE', winner: eng.state.winner, rounds: eng.state.roundNumber, powers, gifts, gm };
}
{
  const N = 60; let stuck = 0, hWins = 0, rounds = [], pw = 0, g = 0, gmc = 0, games = 0;
  const ids = ROSTER.map(f => f.id);
  for (let i = 0; i < N; i++) {
    const r = playDuel(100 + i, ids[i % 32], ids[(i * 7 + 3) % 32], 1 + (i % 3), 1 + ((i + 1) % 3));
    games++; if (!r.done) stuck++; if (r.winner === 'player-1') hWins++; rounds.push(r.rounds); pw += r.powers[0] + r.powers[1]; g += r.gifts; gmc += r.gm;
  }
  rounds.sort((a, b) => a - b);
  ok(stuck === 0, `${N} AI-vs-AI story duels all finish (stuck ${stuck})`);
  console.log(`  median rounds ${rounds[N >> 1]}, p90 ${rounds[Math.floor(N * 0.9)]}, powers fired/duel ${(pw / games).toFixed(2)}, GM events/duel ${(gmc / games).toFixed(2)}, GM gifts/duel ${(g / games).toFixed(2)}, first-seat win ${(100 * hWins / N).toFixed(0)}%`);
  ok(pw / games >= 1, 'powers are actually used in duels');
}
// GM final bouts finish
{ for (let b = 0; b < 3; b++) { const r = playDuel(900 + b, 'hades', 'hel', 3, 3, b); ok(r.done, `GM bout ${b + 1} finishes in ${r.rounds} rounds`); } }
process.exit(fails ? 1 : 0);
