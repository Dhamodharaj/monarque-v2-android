// Targeted balance simulations for Story Mode duels, run on the REAL engine with the REAL AI (same stack as sim-story.mjs).
//
//   node scripts/sim-balance.mjs [--quick] [--out docs/BALANCE_REPORT.md]
//
// Every number here is a DIAGNOSTIC SIGNAL, not a final measurement of player balance: both seats are played by the same AI, so
// the results say how the powers behave when piloted by the game's own heuristics. Seats are always balanced (each matchup is
// played from both seats) so seat bias cancels out of the power numbers, and the seat bias itself is measured separately on
// mirror matches (identical sides), which is the only unbiased way to isolate it.
//
// Experiments
//   1  Seat advantage: mirror duels (no powers; and every contender against its own twin). Identical sides, so any edge is the seat.
//   2  Ablation: each power against a no-power foe, both seats, steps I and III. The marginal value of the power alone.
//   3  Round robin: every contender against every other, both seats, step I. The real matchup field.
//   4  POWER vs RANK: call frequency and how often the leader wins on each call.
//   5  Soul: spent and recovered per duel (cards, boosts and powers, versus placement rewards, refunds and Gather Soul).
//   6  HP sacrifice: Gather Soul and self-damage powers, how often, and what happens to the player who does it.
//   7  Concentration: does a small group of powers decide the results, and does the S..C grade predict anything?
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const cards = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url)));
const rngFrom = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ------------------------------------------------------------------ one instrumented duel (runs inside a worker)
async function runDuel(job, mods) {
  const { AIEngine, takeAiTurn, createStoryEngine, makePowerPicker, ROSTER_BY_ID } = mods;
  const random = rngFrom(job.seed); Math.random = random;
  const side = (s) => ({ name: s.name, powers: s.fighter ? [s.fighter] : [], step: s.step ?? 1 });
  const eng = createStoryEngine(cards, { random, human: side({ ...job.a, name: 'A' }), foe: side({ ...job.b, name: 'B' }) });
  const ais = [new AIEngine(cards, random), new AIEngine(cards, random)];
  const temp = (s) => ROSTER_BY_ID[s.fighter]?.temperament ?? 'SOVEREIGN';
  const pick = [makePowerPicker(eng, temp(job.a), random), makePowerPicker(eng, temp(job.b), random)];
  // Forced policies (experiments 5/6): one side's AI is overridden in one respect, the other side plays normally.
  const POLICY = { never: (ai) => { ai.shouldCharge = () => false; }, always: (ai) => { ai.shouldCharge = () => true; }, power: (ai) => { ai.chooseCall = () => 'POWER'; }, rank: (ai) => { ai.chooseCall = () => 'RANK'; }, noBoost: (ai) => { ai.chooseBoost = () => ({ powerKi: 0, rankKi: 0 }); } };
  [job.a, job.b].forEach((sd, k) => { if (sd.policy) POLICY[sd.policy](ais[k]); });
  const mk = () => ({ spentAction: 0, gainedAction: 0, gainedResolve: 0, lostResolve: 0, lowSoulTurns: 0, turns: 0 });
  const st = [mk(), mk()];
  let guard = 0;
  while (eng.state.phase !== 'MATCH_COMPLETE' && guard++ < 1500) {
    const id = eng.state.currentPlayer; const i = id === 'player-1' ? 0 : 1;
    const before = eng.state.players.map((p) => p.ki); const lrBefore = eng.state.lastRound;
    st[i].turns++; if (before[i] <= 1) st[i].lowSoulTurns++;
    takeAiTurn(eng, ais[i], id, { pickWildcard: pick[i] });
    const lr = eng.state.lastRound; const resolved = lr && lr !== lrBefore;
    eng.state.players.forEach((p, k) => {
      const res = resolved ? lr.deltas?.[p.id]?.ki ?? 0 : 0;
      const act = (p.ki - res) - before[k];
      if (act < 0) st[k].spentAction += -act; else st[k].gainedAction += act; // includes effects a power has on the other side (e.g. a foe losing Soul)
      if (res > 0) st[k].gainedResolve += res; else if (res < 0) st[k].lostResolve += -res;
    });
  }
  const log = eng.state.eventLog;
  const seatOf = (pid) => (pid === 'player-1' ? 0 : 1);
  const rec = { done: eng.state.phase === 'MATCH_COMPLETE', winner: eng.state.winner == null ? -1 : seatOf(eng.state.winner), rounds: eng.state.roundNumber, roundsFinal: eng.state.roundNumber, firstLeader: seatOf(log.find((e) => e.type === 'ROUND_START')?.leaderId),
    calls: { POWER: [0, 0], RANK: [0, 0], TOTAL: [0, 0] }, leaderWins: 0, scoredRounds: 0, uses: [[], []], charges: [0, 0], selfHp: [0, 0], soul: st, hpEnd: eng.state.players.map((p) => p.hp) };
  let leader = null;
  for (const e of log) {
    if (e.type === 'ROUND_START') leader = e.leaderId;
    else if (e.type === 'ROUND_RESULT' && e.call && e.winnerId) { const c = rec.calls[e.call]; if (c) { c[0]++; if (e.winnerId === leader) c[1]++; } rec.scoredRounds++; if (e.winnerId === leader) rec.leaderWins++; }
    else if (e.type === 'CHARGE') { rec.charges[seatOf(e.playerId)]++; rec.selfHp[seatOf(e.playerId)] += e.hp; }
    else if (e.type === 'WILDCARD_USED' && e.detail?.story) {
      const R = e.card?.story?.rider ?? {}; const self = (R.selfDmg ?? 0) + (e.effectId === 'FINAL_ATONEMENT' ? (R.self ?? 15) : 0);
      rec.uses[seatOf(e.playerId)].push({ fighter: e.card.story.fighter, family: e.effectId, round: e.round, soul: e.card.story.kiCost ?? 0, self });
      rec.selfHp[seatOf(e.playerId)] += self;
    }
  }
  return rec;
}

// ------------------------------------------------------------------ worker plumbing
if (!isMainThread) {
  const [{ AIEngine }, { takeAiTurn }, { createStoryEngine }, { makePowerPicker }, { ROSTER }] = await Promise.all([
    import('../src/game/AIEngine.js'), import('../src/game/AITurn.js'), import('../src/story/duel.js'), import('../src/story/storyAI.js'), import('../src/story/roster.js')]);
  const mods = { AIEngine, takeAiTurn, createStoryEngine, makePowerPicker, ROSTER_BY_ID: Object.fromEntries(ROSTER.map((f) => [f.id, f])) };
  parentPort.on('message', async (batch) => {
    const out = [];
    for (const job of batch) { try { out.push({ id: job.id, ...(await runDuel(job, mods)) }); } catch (err) { out.push({ id: job.id, done: false, error: String(err?.message ?? err) }); } }
    parentPort.postMessage(out);
  });
  parentPort.postMessage('ready');
}

// ------------------------------------------------------------------ statistics helpers
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => (a.length ? sum(a) / a.length : NaN);
const sd = (a) => { const m = mean(a); return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / Math.max(1, a.length - 1)); };
const wilson = (k, n, z = 1.96) => { if (!n) return [NaN, NaN]; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - h) / d, (c + h) / d]; };
const pc = (x, d = 1) => (Number.isFinite(x) ? `${(100 * x).toFixed(d)}%` : 'n/a');
const ci = (k, n) => { const [lo, hi] = wilson(k, n); return `${pc(k / n)} (${pc(lo, 0)}–${pc(hi, 0)})`; };
const f2 = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const spearman = (xs, ys) => { const rk = (a) => { const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = Array(a.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; }; const a = rk(xs), b = rk(ys), ma = mean(a), mb = mean(b); const num = sum(a.map((v, i) => (v - ma) * (b[i] - mb))); return num / Math.sqrt(sum(a.map((v) => (v - ma) ** 2)) * sum(b.map((v) => (v - mb) ** 2))); };
const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n`;

// ------------------------------------------------------------------ main (orchestrates experiments, aggregates, writes the report)
async function main() {
  const args = process.argv.slice(2); const quick = args.includes('--quick');
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null; // 'policy' runs just the forced-policy tests (used for what-if tuning)
  const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const tuneFighters = arg('--fighters', null)?.split(','); const tuneN = Number(arg('--n', 100)); const fieldN = Number(arg('--field', 3)); // --only tune: ablation (n per seat) + field sample (field per seat vs each other contender)
  const polList = args.includes('--policies') ? args[args.indexOf('--policies') + 1].split(',') : null;
  const outPath = args.includes('--out') ? args[args.indexOf('--out') + 1] : (quick ? null : 'docs/BALANCE_REPORT.md');
  const { ROSTER } = await import('../src/story/roster.js');
  const { POWERS, POWER_OF, FAMILY, GRADE_POINTS } = await import('../src/story/powers.js');
  const ids = POWERS.map((p) => p.fighter);
  const K = quick ? { mirrorNone: 60, mirrorPow: 2, abl1: 6, abl3: 4, rr: 1, policy: 20 } : { mirrorNone: 1000, mirrorPow: 14, abl1: 80, abl3: 40, rr: 6, policy: 250 };

  // ---- build jobs. A = player-1 (first seat, leads round 1), B = player-2.
  const jobs = []; let seed = 100000; const add = (exp, a, b, tag) => jobs.push({ id: jobs.length, exp, tag, seed: seed += 7919, a, b });
  if (only === 'tune') {
    for (const f of tuneFighters ?? ids) {
      for (let i = 0; i < tuneN; i++) { add('t-abl', { fighter: f, step: 1 }, {}, f); add('t-abl', {}, { fighter: f, step: 1 }, f); }
      for (const g of ids) if (g !== f) for (let i = 0; i < fieldN; i++) { add('t-field', { fighter: f, step: 1 }, { fighter: g, step: 1 }, f); add('t-field', { fighter: g, step: 1 }, { fighter: f, step: 1 }, f); }
    }
  }
  if (!only) {
  for (let i = 0; i < K.mirrorNone; i++) add('seat-none', {}, {});
  for (const f of ids) for (let i = 0; i < K.mirrorPow; i++) add('seat-pow', { fighter: f, step: 1 }, { fighter: f, step: 1 }, f);
  for (const step of [1, 3]) for (const f of ids) for (let i = 0; i < (step === 1 ? K.abl1 : K.abl3); i++) { add(`abl${step}`, { fighter: f, step }, {}, f); add(`abl${step}`, {}, { fighter: f, step }, f); }
  for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) for (let i = 0; i < K.rr; i++) { add('rr', { fighter: ids[x], step: 1 }, { fighter: ids[y], step: 1 }, `${ids[x]}|${ids[y]}`); add('rr', { fighter: ids[y], step: 1 }, { fighter: ids[x], step: 1 }, `${ids[y]}|${ids[x]}`); }
  }
  const POLICIES = only === 'tune' ? [] : polList ?? ['never', 'always', 'power', 'rank', 'noBoost'];
  for (const pol of POLICIES) for (let i = 0; i < K.policy; i++) { add(`pol-${pol}`, { policy: pol }, {}, pol); add(`pol-${pol}`, {}, { policy: pol }, pol); }
  console.error(`[balance] ${jobs.length} duels${quick ? ' (quick)' : ''}`);

  // ---- run
  const nW = Math.max(1, Math.min(os.cpus().length, 8)); const results = new Array(jobs.length); let next = 0, doneN = 0; const t0 = Date.now();
  const BATCH = 24; const self = fileURLToPath(import.meta.url);
  await new Promise((resolve, reject) => {
    let live = nW;
    for (let w = 0; w < nW; w++) {
      const worker = new Worker(self, { workerData: {}, argv: [] });
      const feed = () => { if (next >= jobs.length) { worker.terminate(); if (--live === 0) resolve(); return; } const b = jobs.slice(next, next + BATCH); next += b.length; worker.postMessage(b); };
      worker.on('message', (m) => { if (m === 'ready') return feed(); for (const r of m) { results[r.id] = r; doneN++; } if (doneN % 1000 < BATCH) console.error(`[balance] ${doneN}/${jobs.length} (${Math.round((Date.now() - t0) / 1000)}s)`); feed(); });
      worker.on('error', reject);
    }
  });
  const bad = results.filter((r) => !r.done); console.error(`[balance] finished in ${Math.round((Date.now() - t0) / 1000)}s; unfinished or errored: ${bad.length}`);
  const rows = results.map((r, i) => ({ ...r, ...jobs[i] })); const ok = rows.filter((r) => r.done && r.winner >= 0);

  // ---------------------------------------------------------------- 1 seat
  const seatStats = (rs) => { const n = rs.length, k = rs.filter((r) => r.winner === 0).length; return { n, k }; };
  const sNone = seatStats(ok.filter((r) => r.exp === 'seat-none')), sPow = seatStats(ok.filter((r) => r.exp === 'seat-pow'));
  const lead1 = ok.filter((r) => r.exp === 'seat-none' || r.exp === 'seat-pow'); const leadWin = sum(lead1.map((r) => r.leaderWins)), leadRounds = sum(lead1.map((r) => r.scoredRounds));
  const seatByFighter = ids.map((f) => { const rs = ok.filter((r) => r.exp === 'seat-pow' && r.tag === f); return { f, ...seatStats(rs) }; });
  const seatAll = { n: sNone.n + sPow.n, k: sNone.k + sPow.k };

  if (only === 'tune') {
    const won = (r, f) => (r.a.fighter === f ? r.winner === 0 : r.winner === 1);
    const { POWER_OF: PO } = await import('../src/story/powers.js');
    for (const f of tuneFighters ?? ids) {
      const ab = ok.filter((r) => r.exp === 't-abl' && r.tag === f), fl = ok.filter((r) => r.exp === 't-field' && r.tag === f);
      const early = mean(ab.map((r) => r.uses[r.a.fighter === f ? 0 : 1][0]?.round ?? NaN).filter(Number.isFinite));
      console.log(`${f.padEnd(16)} ${PO[f].grade}  ablation ${ci(ab.filter((r) => won(r, f)).length, ab.length).padEnd(18)} field ${ci(fl.filter((r) => won(r, f)).length, fl.length).padEnd(18)} 1st use ${f2(early, 1)}  duel ${f2(mean(ab.map((r) => r.rounds)), 1)}`);
    }
    return;
  }
  const mirrors = ok.filter((r) => r.exp === 'seat-none' || r.exp === 'seat-pow');
  const parity = ['odd', 'even'].map((p) => { const rs = mirrors.filter((r) => (r.rounds % 2 === 1) === (p === 'odd')); return { p, ...seatStats(rs) }; });
  const policyRow = (pol) => { const rs = ok.filter((r) => r.exp === `pol-${pol}`); const k = sum(rs.map((r) => (r.a.policy ? (r.winner === 0 ? 1 : 0) : (r.winner === 1 ? 1 : 0)))); const per = rs.map((r) => { const seat = r.a.policy ? 0 : 1; return { c: r.charges[seat], spent: r.soul[seat].spentAction, hp: r.selfHp[seat], rounds: r.rounds }; }); return { pol, n: rs.length, k, charges: mean(per.map((x) => x.c)), spent: mean(per.map((x) => x.spent)), hp: mean(per.map((x) => x.hp)), rounds: mean(per.map((x) => x.rounds)), callPower: sum(rs.map((r) => r.calls.POWER[0])) / Math.max(1, sum(rs.map((r) => r.calls.POWER[0] + r.calls.RANK[0] + r.calls.TOTAL[0]))) }; };
  const pol = Object.fromEntries(POLICIES.map((p) => [p, policyRow(p)]));
  if (only === 'policy') { for (const p of POLICIES) console.log(`${p}\t${pol[p].n}\t${ci(pol[p].k, pol[p].n)}\tgather/duel ${f2(pol[p].charges)}\tHP given ${f2(pol[p].hp, 1)}\tduel ${f2(pol[p].rounds, 1)} rounds`); return; }

  // ---------------------------------------------------------------- 2 ablation (seat-balanced win rate of a power vs no power)
  const ablation = (step) => ids.map((f) => {
    const rs = ok.filter((r) => r.exp === `abl${step}` && r.tag === f); const k = sum(rs.map((r) => (r.a.fighter === f ? (r.winner === 0 ? 1 : 0) : (r.winner === 1 ? 1 : 0)))); const n = rs.length;
    const useRows = rs.map((r) => { const seat = r.a.fighter === f ? 0 : 1; return { seat, uses: r.uses[seat].length, won: r.winner === seat, rounds: r.rounds, firstRound: r.uses[seat][0]?.round ?? null }; });
    const used = useRows.filter((u) => u.uses > 0), unused = useRows.filter((u) => u.uses === 0);
    return { f, n, k, wr: k / n, usePerDuel: mean(useRows.map((u) => u.uses)), usedShare: used.length / n, wrUsed: used.length ? used.filter((u) => u.won).length / used.length : NaN, wrUnused: unused.length ? unused.filter((u) => u.won).length / unused.length : NaN, firstRound: mean(used.map((u) => u.firstRound)), seatFirstWins: rs.filter((r) => r.a.fighter === f && r.winner === 0).length, seatFirstN: rs.filter((r) => r.a.fighter === f).length, rounds: mean(rs.map((r) => r.rounds)) };
  });
  const abl1 = ablation(1), abl3 = ablation(3);

  // ---------------------------------------------------------------- 3 round robin (step I)
  const rr = ok.filter((r) => r.exp === 'rr'); const wins = Object.fromEntries(ids.map((f) => [f, [0, 0]])); const pair = {};
  for (const r of rr) { const A = r.a.fighter, B = r.b.fighter; const w = r.winner === 0 ? A : B; const l = r.winner === 0 ? B : A; wins[w][0]++; wins[w][1]++; wins[l][1]++; const key = [A, B].sort().join('|'); pair[key] ??= { x: [A, B].sort()[0], n: 0, xw: 0 }; pair[key].n++; if (w === pair[key].x) pair[key].xw++; }
  const rrTable = ids.map((f) => ({ f, k: wins[f][0], n: wins[f][1], wr: wins[f][0] / wins[f][1] })).sort((a, b) => b.wr - a.wr);
  const rrNoise = Math.sqrt(0.25 / mean(rrTable.map((r) => r.n)));
  const rrObservedSd = sd(rrTable.map((r) => r.wr));
  const extremePairs = Object.entries(pair).map(([key, p]) => ({ key, ...p, rate: p.xw / p.n })).filter((p) => p.n >= 10 && (p.rate >= 0.9 || p.rate <= 0.1)).sort((a, b) => Math.abs(b.rate - 0.5) - Math.abs(a.rate - 0.5));

  // ---------------------------------------------------------------- 4 calls
  const calls = { POWER: [0, 0], RANK: [0, 0], TOTAL: [0, 0] };
  for (const r of ok) for (const c of Object.keys(calls)) { calls[c][0] += r.calls[c][0]; calls[c][1] += r.calls[c][1]; }
  const callTotal = sum(Object.values(calls).map((c) => c[0]));
  const callsNoPower = { POWER: 0, RANK: 0, TOTAL: 0 }; for (const r of ok.filter((x) => x.exp === 'seat-none')) for (const c of Object.keys(callsNoPower)) callsNoPower[c] += r.calls[c][0];
  const callsBySeatRounds = { first: 0, second: 0 };

  // ---------------------------------------------------------------- 5 Soul
  const soul = (rs) => { const per = rs.flatMap((r) => [r.soul[0], r.soul[1]]); return { spentAction: mean(per.map((s) => s.spentAction)), gainedAction: mean(per.map((s) => s.gainedAction)), gainedResolve: mean(per.map((s) => s.gainedResolve)), lostResolve: mean(per.map((s) => s.lostResolve)), lowShare: sum(per.map((s) => s.lowSoulTurns)) / Math.max(1, sum(per.map((s) => s.turns))), n: per.length }; };
  const soulNone = soul(ok.filter((r) => r.exp === 'seat-none')), soulRR = soul(rr);
  const soulWin = (() => { const per = rr.flatMap((r) => [{ s: r.soul[0], w: r.winner === 0 }, { s: r.soul[1], w: r.winner === 1 }]); const g = (w) => per.filter((p) => p.w === w).map((p) => p.s); const m = (a, k) => mean(a.map((s) => s[k])); return { win: { spent: m(g(true), 'spentAction'), gained: m(g(true), 'gainedResolve') + m(g(true), 'gainedAction') }, lose: { spent: m(g(false), 'spentAction'), gained: m(g(false), 'gainedResolve') + m(g(false), 'gainedAction') } }; })();

  // ---------------------------------------------------------------- 6 HP sacrifice
  const sacRows = ok.filter((r) => r.exp === 'rr' || r.exp === 'seat-none' || r.exp === 'seat-pow');
  const chargePer = (rs) => { const per = rs.flatMap((r) => [{ c: r.charges[0], hp: r.selfHp[0], won: r.winner === 0 }, { c: r.charges[1], hp: r.selfHp[1], won: r.winner === 1 }]); return per; };
  const sac = chargePer(sacRows); const sacUsers = sac.filter((p) => p.c > 0), sacNon = sac.filter((p) => p.c === 0);
  const sacNone = chargePer(ok.filter((r) => r.exp === 'seat-none'));
  const selfPower = rr.flatMap((r) => [0, 1].map((s) => ({ s, uses: r.uses[s].filter((u) => u.self > 0), won: r.winner === s }))).filter((x) => x.uses.length);
  // within-power-only HP cost: the power's own sacrifice, by fighter (ablation, step I)
  const selfPowerRows = abl1.filter((a) => POWER_OF[a.f].rider[0].selfDmg || POWER_OF[a.f].family === 'FINAL_ATONEMENT' || POWER_OF[a.f].rider[0].self);

  // ---------------------------------------------------------------- 7 concentration / grade
  const gradePts = ids.map((f) => GRADE_POINTS[POWER_OF[f].grade]);
  const rho1 = spearman(gradePts, abl1.map((a) => a.wr)), rho3 = spearman(gradePts, abl3.map((a) => a.wr)), rhoRR = spearman(gradePts, ids.map((f) => rrTable.find((r) => r.f === f).wr)), rhoAblRR = spearman(abl1.map((a) => a.wr), ids.map((f) => rrTable.find((r) => r.f === f).wr));
  const byGroup = (key, label) => { const g = {}; for (const f of ids) { const k = key(f); (g[k] ??= []).push(f); } return Object.entries(g).map(([k, fs]) => ({ k: label(k), n: fs.length, abl1: mean(fs.map((f) => abl1.find((a) => a.f === f).wr)), abl3: mean(fs.map((f) => abl3.find((a) => a.f === f).wr)), rr: mean(fs.map((f) => rrTable.find((r) => r.f === f).wr)) })); };
  const byGrade = byGroup((f) => POWER_OF[f].grade, (k) => k).sort((a, b) => 'SABC'.indexOf(a.k) - 'SABC'.indexOf(b.k));
  const byFamily = byGroup((f) => POWER_OF[f].family, (k) => `${FAMILY[k].label} (${k === 'SHENRON_WISH' ? 'Wish' : FAMILY[k].gm})`).sort((a, b) => b.abl1 - a.abl1);
  const byTemper = byGroup((f) => ROSTER.find((r) => r.id === f).temperament, (k) => k).sort((a, b) => b.rr - a.rr);
  const topN = (arr, n) => arr.slice(0, n);
  const sortedAbl = [...abl1].sort((a, b) => b.wr - a.wr);
  const outliers = (arr, noiseSd) => arr.filter((a) => Math.abs(a.wr - 0.5) > 2.5 * noiseSd);
  const ablNoise = Math.sqrt(0.25 / mean(abl1.map((a) => a.n)));
  const shareExcess = (() => { const ex = rrTable.map((r) => Math.max(0, r.wr - 0.5)); const tot = sum(ex) || 1; const s = [...ex].sort((a, b) => b - a); return { top3: sum(s.slice(0, 3)) / tot, top5: sum(s.slice(0, 5)) / tot, top8: sum(s.slice(0, 8)) / tot, uniform5: 5 / ex.filter((x) => x > 0).length }; })();

  // ---------------------------------------------------------------- report
  const name = (f) => ROSTER.find((r) => r.id === f)?.name ?? f; const short = (f) => `${name(f)} (${POWER_OF[f].grade}, ${FAMILY[POWER_OF[f].family].label})`;
  const L = [];
  L.push('# Balance diagnostics', '', `Generated by \`scripts/sim-balance.mjs\`${quick ? ' (quick run: numbers are noisy)' : ''}. ${rows.length} duels on the real engine with the real AI; ${bad.length} unfinished.`, '',
    '**Read this first.** These are diagnostic signals, not player-balance measurements. Both sides are played by the game\'s own AI, so a result describes a power *as that AI uses it*. A power the AI under-uses will look weak here and may be strong in a human\'s hands (see the "fired in" and "1st use" columns). Seats are balanced in every power comparison, so seat bias cancels. Intervals are 95% Wilson intervals. Nothing in this report assumes which character *should* be strong.', '');

  L.push('## 1. First seat versus second seat', '', 'Mirror matches (identical sides, identical AI), so the only difference is the seat. Seat 1 leads round 1 and then leadership rotates.', '',
    table(['Sample', 'Duels', 'Seat 1 wins'], [['No powers', sNone.n, ci(sNone.k, sNone.n)], ['Every contender vs its own twin', sPow.n, ci(sPow.k, sPow.n)], ['Combined', seatAll.n, ci(seatAll.k, seatAll.n)]]),
    `Round leaders win ${ci(leadWin, leadRounds)} of scored rounds (leadership alternates by seat, so this is a per-round edge, not a seat edge).`, '',
    `Seat 1 win rate by how long the duel lasted: ends on an odd round ${ci(parity[0].k, parity[0].n)}, on an even round ${ci(parity[1].k, parity[1].n)}. Seat 1 leads the odd rounds, so a gap here is the leader edge showing up as a parity effect.`, '',
    `Does any power make the seat matter? Seat 1 win rate across the ${ids.length} contenders' mirrors has a spread of ±${pc(sd(seatByFighter.map((x) => x.k / x.n)))} (one s.d.); pure chance with ${K.mirrorPow} duels each would give ±${pc(Math.sqrt(0.25 / K.mirrorPow))}. ${sd(seatByFighter.map((x) => x.k / x.n)) <= 1.25 * Math.sqrt(0.25 / K.mirrorPow) ? 'No contender is seat-sensitive beyond chance.' : 'Some contenders are seat-sensitive.'}`, '');

  L.push('## 2. POWER versus RANK', '', table(['Call', 'Rounds', 'Share', 'Leader wins on it'], Object.keys(calls).map((c) => [c, calls[c][0], pc(calls[c][0] / callTotal), ci(calls[c][1], calls[c][0])])),
    `With no powers in play the split is POWER ${pc(callsNoPower.POWER / sum(Object.values(callsNoPower)))}, RANK ${pc(callsNoPower.RANK / sum(Object.values(callsNoPower)))}, TOTAL ${pc(callsNoPower.TOTAL / sum(Object.values(callsNoPower)))}.`, '');

  L.push('## 3. Power usage and win rate (ablation: one power against a no-power foe, both seats)', '',
    'Win rate above 50% means the power is worth something on its own. "Fired in" is the share of duels where the AI used the power (each power is one use per duel, so 100% means the AI always finds a moment); "1st use" is the average round it fires, which shows how early or late the AI considers it worthwhile.', '',
    table(['Contender (grade, family)', `Step I win (n=${abl1[0].n})`, `Step III win (n=${abl3[0].n})`, 'Fired in', '1st use (round)', 'Duel length'],
      sortedAbl.map((a) => { const b3 = abl3.find((x) => x.f === a.f); return [short(a.f), ci(a.k, a.n), ci(b3.k, b3.n), pc(a.usedShare, 0), f2(a.firstRound, 1), f2(a.rounds, 1)]; })), '');

  L.push('## 4. Individual matchups (round robin, step I, both seats, each pair played ' + 2 * K.rr + ' times)', '',
    `Field mean is 50% by construction. Noise alone would spread win rates by about ±${pc(rrNoise)} (one s.d.); the observed spread is ±${pc(rrObservedSd)} (${f2(rrObservedSd / rrNoise, 1)}x noise${rrObservedSd / rrNoise < 1.3 ? ', so most of the spread is indistinguishable from chance' : ', so a real spread exists beyond chance'}).`, '',
    table(['Rank', 'Contender (grade, family)', 'Field win rate', 'Ablation (step I)'], rrTable.map((r, i) => [i + 1, short(r.f), ci(r.k, r.n), pc(abl1.find((a) => a.f === r.f).wr)])), '',
    extremePairs.length ? `Lopsided pairings (≥90% either way, ≥10 games; each pair is a small sample): ${extremePairs.slice(0, 12).map((p) => `${name(p.x)} beat ${name(p.key.split('|').find((q) => q !== p.x))} ${p.xw}/${p.n}`.replace(/beat/, p.rate >= 0.5 ? 'beat' : 'lost to')).join('; ')}.` : 'No pairing is lopsided (≥90% over ≥10 games).', '');

  L.push('## 5. Soul spending and recovery (average per player per duel, round-robin field)', '',
    table(['', 'Spent on actions', 'Regained by actions (Gather Soul, refunds)', 'Regained at round end', 'Lost at round end', 'Turns at ≤1 Soul'],
      [['Round robin', f2(soulRR.spentAction, 1), f2(soulRR.gainedAction, 1), f2(soulRR.gainedResolve, 1), f2(soulRR.lostResolve, 1), pc(soulRR.lowShare, 0)], ['No-power mirror', f2(soulNone.spentAction, 1), f2(soulNone.gainedAction, 1), f2(soulNone.gainedResolve, 1), f2(soulNone.lostResolve, 1), pc(soulNone.lowShare, 0)]]),
    `Winners spent ${f2(soulWin.win.spent, 1)} and regained ${f2(soulWin.win.gained, 1)}; losers spent ${f2(soulWin.lose.spent, 1)} and regained ${f2(soulWin.lose.gained, 1)}.`, '');

  const polTable = (names) => table(['Policy for one side (other side plays normally; no powers; both seats)', 'Duels', 'Win rate of the forced side', 'Gather uses / duel', 'Soul spent / duel', 'HP given / duel', 'POWER calls'],
    names.map(([k, label]) => { const r = pol[k]; return [label, r.n, ci(r.k, r.n), f2(r.charges), f2(r.spent, 1), f2(r.hp, 1), pc(r.callPower, 0)]; }));
  L.push('## 5b. Controlled tests: what a policy is worth', '',
    'Instead of comparing players who happened to do something (confounded: you cannot gather at 20 HP or below, so the players who gather are the ones who are not losing), one side is forced into a policy and plays the normal AI. 50% means the policy is worth the same as what the AI does by itself.', '',
    polTable([['never', 'Never Gather Soul'], ['always', 'Gather Soul whenever allowed'], ['noBoost', 'Never spend Soul on boosts'], ['power', 'Always call POWER'], ['rank', 'Always call RANK']]), '');
  L.push('## 6. HP sacrifice', '',
    table(['Measure', 'Value'], [
      ['Players who used Gather Soul at least once (all duels)', ci(sacUsers.length, sac.length)],
      ['Gather Soul uses per player per duel (normal AI)', f2(mean(sac.map((p) => p.c)), 2)],
      ['…in no-power mirrors', f2(mean(sacNone.map((p) => p.c)), 2)],
      ['HP given up voluntarily per player per duel (gather + self-damage powers)', f2(mean(sac.map((p) => p.hp)), 1)],
      ['Self-damage power uses (round robin) that ended in a win (confounded, see ablation below)', ci(selfPower.filter((x) => x.won).length, selfPower.length)]]),
    `Whether the sacrifice pays is answered by the controlled test above (never / always gather). Self-damage powers by ablation win rate (step I): ${selfPowerRows.map((a) => `${name(a.f)} ${pc(a.wr, 0)}`).join(', ') || 'none'}.`, '');

  L.push('## 7. Does a small group dominate? Does grade matter?', '',
    `- Top 3 / 5 / 8 contenders hold ${pc(shareExcess.top3, 0)} / ${pc(shareExcess.top5, 0)} / ${pc(shareExcess.top8, 0)} of all win-rate above 50% in the round robin (an even spread would be ${pc(3 / Math.max(1, rrTable.filter((r) => r.wr > 0.5).length), 0)} / ${pc(5 / Math.max(1, rrTable.filter((r) => r.wr > 0.5).length), 0)} / ${pc(8 / Math.max(1, rrTable.filter((r) => r.wr > 0.5).length), 0)}).`,
    `- Ablation outliers beyond 2.5 s.d. of noise (±${pc(ablNoise)}): ${outliers(abl1, ablNoise).map((a) => `${name(a.f)} ${pc(a.wr, 0)}`).join(', ') || 'none'}.`,
    `- Round-robin outliers beyond 2.5 s.d. of noise (±${pc(rrNoise)}): ${outliers(rrTable, rrNoise).map((a) => `${name(a.f)} ${pc(a.wr, 0)}`).join(', ') || 'none'}.`,
    `- Spearman correlation of the designed grade (S=5..C=2) with measured strength: ablation step I ${f2(rho1)}, step III ${f2(rho3)}, round robin ${f2(rhoRR)}. (Near 0 means the grade says nothing about outcomes; positive means higher grades really are stronger.)`,
    `- Ablation and round robin agree with each other: ρ = ${f2(rhoAblRR)}.`, '',
    '**By grade**', '', table(['Grade', 'Powers', 'Ablation I', 'Ablation III', 'Round robin'], byGrade.map((g) => [g.k, g.n, pc(g.abl1), pc(g.abl3), pc(g.rr)])), '',
    '**By family**', '', table(['Family', 'Powers', 'Ablation I', 'Ablation III', 'Round robin'], byFamily.map((g) => [g.k, g.n, pc(g.abl1), pc(g.abl3), pc(g.rr)])), '',
    '**By temperament (how the AI uses the power)**', '', table(['Temperament', 'Powers', 'Ablation I', 'Ablation III', 'Round robin'], byTemper.map((g) => [g.k, g.n, pc(g.abl1), pc(g.abl3), pc(g.rr)])), '');

  const report = L.join('\n');
  console.log(report);
  if (outPath) { writeFileSync(outPath, report + '\n'); writeFileSync(outPath.replace(/\.md$/, '.json'), JSON.stringify({ K, seat: { none: sNone, pow: sPow }, abl1, abl3, rrTable, calls, soulRR, soulNone }, null, 1)); console.error(`[balance] wrote ${outPath}`); }
}

if (isMainThread) await main();
