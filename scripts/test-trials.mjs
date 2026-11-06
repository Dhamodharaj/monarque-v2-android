// Encounter trials: every duel tests a different skill, and each trial really changes how the opponent plays.
import { readFileSync } from 'node:fs';
import { AIEngine } from '../src/game/AIEngine.js';
import { takeAiTurn } from '../src/game/AITurn.js';
import { createStoryEngine } from '../src/story/duel.js';
import { makePowerPicker } from '../src/story/storyAI.js';
import { newRun, buildDuelCfg, rngFor } from '../src/story/storyFlow.js';
import { TRIALS, TRIAL_BY_ROUND, TRIAL_BY_BOUT, SKILLS, trialFor, trialCard, configureFoeAI } from '../src/story/trials.js';
const cards = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url)));
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };

// --- structure ---------------------------------------------------------------------------------------------------------------------
const roundTrials = TRIAL_BY_ROUND.slice(1).map((id) => TRIALS[id]);
ok(roundTrials.every(Boolean) && TRIAL_BY_BOUT.map((id) => TRIALS[id]).every(Boolean), 'every round and every final bout has a trial');
ok(new Set(roundTrials.map((t) => t.id)).size === 6, 'no two of rounds 1..6 share a trial: not every opponent is difficult in the same way');
ok(SKILLS.every((s) => roundTrials.some((t) => t.tests === s)), `rounds 1..6 between them test all ${SKILLS.length} skills: ${SKILLS.join(', ')}`);
ok(TRIAL_BY_BOUT.map((id) => TRIALS[id].tests).filter((v, i, a) => a.indexOf(v) === i).length === 3, 'the three Monarque bouts test three different skills');
ok(Object.values(TRIALS).every((t) => t.hint.length > 30 && t.blurb && t.label && t.short), 'every trial explains itself in plain words');
ok(trialCard(trialFor(1)).hint === TRIALS.HABIT.hint && !('ai' in trialCard(trialFor(1))), 'the player-facing card carries the hint but none of the AI numbers');
{
  const run = newRun('hades', 'trial-cfg');
  const seen = new Set();
  for (let r = 1; r <= 7; r++) { run.round = r; run.wins = r - 1; const cfg = buildDuelCfg(run); seen.add(cfg.trial.id); ok(cfg.hud.trial?.id === cfg.trial.id, `round ${r}: the duel config and the HUD carry the ${cfg.trial.id} trial`); }
  ok(seen.size === 7, 'seven encounters, seven different trials in the duel configs');
}

// --- behaviour: run duels with the trial's AI on the foe and measure what it does -----------------------------------------------------
function observe(trialId, n = 24) {
  const out = { calls: 0, repeats: 0, flips: 0, lateCalls: 0, lateAlt: 0, soulSpent: 0, soulSeen: 0, turns: 0, lowTurns: 0, firstPower: [], powers: 0, rounds: 0, charges: 0 };
  for (let i = 0; i < n; i++) {
    const random = rngFor('trial-test', trialId, i); Math.random = random;
    const trial = TRIALS[trialId];
    const eng = createStoryEngine(cards, { random, human: { name: 'H', powers: ['hades', 'baba-yaga'], step: 2 }, foe: { name: 'F', powers: ['baron-samedi', 'coatlicue'], step: 2, start: { hp: 120, ki: 16, maxHp: 120, maxKi: 22 } } });
    const ais = [new AIEngine(cards, random), configureFoeAI(new AIEngine(cards, random), { aggression: 1.2, trial })];
    const pick = [makePowerPicker(eng, 'SOVEREIGN', random), makePowerPicker(eng, 'SOVEREIGN', random, trial.picker)];
    let last = null, guard = 0, used = false, prevKi = null;
    while (eng.state.phase !== 'MATCH_COMPLETE' && guard++ < 1500) {
      const id = eng.state.currentPlayer; const k = id === 'player-1' ? 0 : 1;
      if (k === 1) { out.turns++; out.soulSeen += eng.state.players[1].ki; if (eng.state.players[1].ki <= 3) out.lowTurns++; }
      const before = eng.state.players[1].ki, wc = eng.state.wildcardUsedThisRound?.includes('player-2');
      takeAiTurn(eng, ais[k], id, { pickWildcard: pick[k], onAction: (type, extra) => {
        if (k !== 1) return;
        if (type === 'CALL') { out.calls++; if (last) { if (extra.call === last) out.repeats++; else out.flips++; if (eng.state.roundNumber >= (trial.ai.shift?.at ?? 99)) { out.lateCalls++; if (extra.call !== last) out.lateAlt++; } } last = extra.call; }
        if (type === 'CHARGE') out.charges++;
        if (type === 'WILDCARD') { out.powers++; if (!used) { used = true; out.firstPower.push(eng.state.roundNumber); } }
      } });
      if (k === 1) { const d = before - eng.state.players[1].ki; if (d > 0 && !wc) out.soulSpent += d; }
    }
    out.rounds += eng.state.roundNumber;
    if (!used) out.firstPower.push(99);
  }
  return out;
}
const R = Object.fromEntries(['HABIT', 'READER', 'ENDURANCE', 'PATIENT', 'GAMBLER', 'ADAPTIVE'].map((id) => [id, observe(id)]));
const rep = (o) => o.repeats / Math.max(1, o.repeats + o.flips), med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
ok(rep(R.HABIT) > 0.7, `HABIT foe repeats its last call ${Math.round(rep(R.HABIT) * 100)}% of the time (an exploitable tendency)`);
ok(rep(R.READER) < rep(R.HABIT) - 0.15, `READER foe repeats only ${Math.round(rep(R.READER) * 100)}% (calls are not predictable from the last one)`);
ok(R.ADAPTIVE.lateCalls > 5 && R.ADAPTIVE.lateAlt / R.ADAPTIVE.lateCalls > 0.65, `ADAPTIVE foe alternates its call ${Math.round((100 * R.ADAPTIVE.lateAlt) / Math.max(1, R.ADAPTIVE.lateCalls))}% of the time after the reversal round`);
ok(rep(R.ADAPTIVE) < rep(R.HABIT), 'the reversal shows up as a drop in repeat rate against plain HABIT');
ok(med(R.PATIENT.firstPower) > med(R.GAMBLER.firstPower), `PATIENT foe fires its first power later than GAMBLER (round ${med(R.PATIENT.firstPower)} vs ${med(R.GAMBLER.firstPower)})`);
const perRound = (o) => o.soulSpent / Math.max(1, o.rounds);
const avg = (o) => o.soulSeen / Math.max(1, o.turns), low = (o) => o.lowTurns / Math.max(1, o.turns);
console.log(`  soul: ENDURANCE avg ${avg(R.ENDURANCE).toFixed(1)} low ${low(R.ENDURANCE).toFixed(2)} | GAMBLER avg ${avg(R.GAMBLER).toFixed(1)} low ${low(R.GAMBLER).toFixed(2)} | spent/round ${perRound(R.ENDURANCE).toFixed(2)} vs ${perRound(R.GAMBLER).toFixed(2)}`);
ok(low(R.GAMBLER) > low(R.ENDURANCE), 'ENDURANCE foe keeps a deeper Soul reserve; GAMBLER spends itself dry more often');
ok(R.GAMBLER.powers >= R.ENDURANCE.powers, 'GAMBLER uses powers at least as often as the hoarding ENDURANCE foe');

// --- trials never touch the rules: caps and the opening hand are the same, only the AI and a small stat tilt differ ---------------------------
{
  const run = newRun('hades', 'rules'); const lens = new Set();
  for (let r = 1; r <= 6; r++) { run.round = r; run.wins = r - 1; if (r === 6) run.berserker = undefined; const cfg = buildDuelCfg(run); const e = createStoryEngine(cards, { ...cfg, random: () => 0.37 }); lens.add(e.state.players[0].hand.filter((c) => c.type === 'CHARACTER').length === e.state.players[1].hand.filter((c) => c.type === 'CHARACTER').length); }
  ok(lens.size === 1 && lens.has(true), 'both sides still get the same number of character cards in every trial');
}
process.exit(fails ? 1 : 0);
