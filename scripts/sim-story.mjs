// Headless balance run: an AI stands in for the player through whole story runs on the real Battle engine.
import { readFileSync } from 'node:fs';
import { AIEngine } from '../src/game/AIEngine.js';
import { takeAiTurn } from '../src/game/AITurn.js';
import { createStoryEngine } from '../src/story/duel.js';
import { makePowerPicker } from '../src/story/storyAI.js';
import { newRun, opponentFor, buildBerserker, buildDuelCfg, claimOptions, stepOf, rngFor } from '../src/story/storyFlow.js';
import { ROSTER } from '../src/story/roster.js';
import { POWER_OF, stepForWins } from '../src/story/powers.js';
import { PROGRESSION } from '../src/story/progression.js';
import { configureFoeAI, TRIALS } from '../src/story/trials.js';
// Tuning hook: PROG='{"player":[...],"foe":[...]}' node scripts/sim-story.mjs 200  overrides the progression table for this run only.
if (process.env.PROG) Object.assign(PROGRESSION, JSON.parse(process.env.PROG));
// Same for trials: TRIALS='{"HABIT":{"stats":{"hp":4,"soul":1}}}' (top-level keys of a trial are replaced).
if (process.env.TRIALS) for (const [k, v] of Object.entries(JSON.parse(process.env.TRIALS))) Object.assign(TRIALS[k], v);
const cards = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url)));
const N = Number(process.argv[2] ?? 100);
const rng = (seed) => rngFor('sim', seed);
function duel(run, seed) {
  const cfg = buildDuelCfg(run); const random = rng(seed); Math.random = random;
  const eng = createStoryEngine(cards, { ...cfg, random });
  const ais = [new AIEngine(cards, random), new AIEngine(cards, random)]; configureFoeAI(ais[1], cfg);
  const pick = [makePowerPicker(eng, 'SOVEREIGN', random), makePowerPicker(eng, cfg.foe.temperament, random, cfg.trial?.picker)];
  let n = 0;
  while (eng.state.phase !== 'MATCH_COMPLETE' && n++ < 1500) { const id = eng.state.currentPlayer; const i = id === 'player-1' ? 0 : 1; takeAiTurn(eng, ais[i], id, { pickWildcard: pick[i], mistake: i === 1 ? cfg.mistake : 0 }); }
  if (eng.state.phase !== 'MATCH_COMPLETE') console.log('STALL', eng.state.roundNumber);
  return { won: eng.state.winner === 'player-1', rounds: eng.state.roundNumber, done: eng.state.phase === 'MATCH_COMPLETE' };
}
const byRound = {};
const first = Array(8).fill(0), tries = Array(8).fill(0), retryWin = Array(8).fill(0), retryTry = Array(8).fill(0), len = [];
let reachedFinal = 0, anyBout = 0, bout1 = 0, bout = [0, 0, 0], boutT = [0, 0, 0], stuck = 0, cleared = 0, died = Array(8).fill(0);
for (let i = 0; i < N; i++) {
  const fighter = ROSTER[i % 32].id; let run = newRun(fighter, `sim-${i}`);
  let alive = true;
  for (let r = 1; r <= 6 && alive; r++) {
    run.round = r; if (r === 6) run.berserker = buildBerserker(run);
    const opp = opponentFor(run); let won = false;
    tries[r]++; const a = duel(run, i * 100 + r); if (!a.done) { stuck++; console.log("STUCK", i, r, JSON.stringify({f:fighter,opp:opp.fighterId,powers:run.powers,oppP:opp.powers,step:stepOf(run)})); } len.push(a.rounds); (byRound[r] ??= []).push(a.rounds);
    if (a.won) { first[r]++; won = true; } else { retryTry[r]++; run.retriesUsed = { [r]: 1 }; const b = duel(run, i * 100 + r + 50); if (b.won) { retryWin[r]++; won = true; } }
    if (!won) { alive = false; died[r]++; break; }
    const opts = claimOptions(run, opp).sort((x, y) => 'SABC'.indexOf(POWER_OF[x].grade) - 'SABC'.indexOf(POWER_OF[y].grade));
    if (opts.length) { run.powers.push(opts[0]); if (r === 6) run.berserkPower = opts[0]; }
    run.wins++; run.retriesUsed = {};
  }
  if (!alive) continue;
  reachedFinal++; run.round = 7; let got = false;
  for (let b = 0; b < 3 && !got; b++) { run.boutsLost = b; boutT[b]++; const x = duel(run, i * 100 + 90 + b); (byRound[7] ??= []).push(x.rounds); if (x.won) { bout[b]++; got = true; } }
  if (got) { anyBout++; cleared++; }
}
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '-');
len.sort((a, b) => a - b);
console.log(`runs ${N}; stuck ${stuck}; median duel ${len[len.length >> 1]} rounds, p90 ${len[Math.floor(len.length * 0.9)]}`);
for (let r = 1; r <= 6; r++) console.log(`R${r}: first-try win ${pct(first[r], tries[r])} (n=${tries[r]}), retry win ${pct(retryWin[r], retryTry[r])}, run ended ${died[r]}`);
console.log(`reached final ${reachedFinal}/${N}; won a bout ${pct(anyBout, reachedFinal)}; bout I ${pct(bout[0], boutT[0])} II ${pct(bout[1], boutT[1])} III ${pct(bout[2], boutT[2])}; full clear ${pct(cleared, N)}`);

const q = (a, f) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * f))];
console.log('duel length (rounds) by encounter: p10 / median / p90');
for (const r of Object.keys(byRound)) console.log(`  ${r == 7 ? 'Final' : 'R' + r}: ${q(byRound[r], 0.1)} / ${q(byRound[r], 0.5)} / ${q(byRound[r], 0.9)} (n=${byRound[r].length})`);
