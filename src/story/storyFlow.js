// Story run state: tournament bracket, claims, Steps, retries, save/load. Pure functions + a small store.
// The duel itself is the Battle engine (see duel.js); this file only decides WHO fights and WHAT carries over.
import { ROSTER, FIGHTER_BY_ID } from './roster.js';
import { POWER_OF, GRADE_POINTS, stepForWins, BERSERK_BOOST } from './powers.js';
import { PROGRESSION, playerStart, playerFinalStart, foeStart, monarqueStart, paceFor } from './progression.js';
import { trialFor, tiltStart, trialCard } from './trials.js';
import { BOUT_OPENERS, FADING_LINES } from './narration.js';
import { difficultyOf, normalizeDifficulty } from '../config/difficulty.js';
import { pickTwist, twistOf } from '../game/twists.js';

export const SAVE_KEY = 'monarque.story.run.v1';
export const PROFILE_KEY = 'monarque.story.profile.v1';
export const SCHEMA = 1;
// Seven major encounters: five knockout rounds, the Berserker, and Monarque himself (three bouts).
export const ROUND_NAMES = ['', 'Round of 32', 'Round of 16', 'Quarter-finals', 'Semi-finals', 'Tournament Final', 'The Berserker', 'Monarque'];
export const ROUND_TITLES = ['', 'Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5', 'Round 6', 'Final'];
/** Which phase of Monarque's deterioration a round belongs to. Drives his dialogue; never combat. */
export const stageOf = (round, bout = 0) => (round >= 7 ? ['BOUT_1', 'BOUT_2', 'BOUT_3'][Math.min(2, bout)] : round === 6 ? 'BERSERKER' : round >= 3 ? 'MIDDLE' : 'EARLY');
export const FIELD_AFTER = [0, 16, 8, 4, 2, 1, 1, 1];
const BANDS = { 1: [-2, -1], 2: [-1, 0], 3: [0, 1], 4: [1, 2], 5: [2, 3] };

// --- seeded randomness --------------------------------------------------------------------------
export function hashSeed(str) { let h = 1779033703 ^ String(str).length; for (let i = 0; i < String(str).length; i++) { h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^ (h >>> 16)) >>> 0; }
export function rngFor(...parts) { let a = hashSeed(parts.join('|')); return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shuffle = (arr, rand) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const normal = (rand) => Math.sqrt(-2 * Math.log(Math.max(1e-9, rand()))) * Math.cos(2 * Math.PI * rand());

// --- rating (off-screen matches) ----------------------------------------------------------------
const gradeOf = (fid) => GRADE_POINTS[POWER_OF[fid].grade];
export const rating = (n) => gradeOf(n.fighterId) + 0.5 * n.claims.reduce((s, f) => s + gradeOf(f), 0) + (stepForWins(n.wins) - 1);
const winChance = (a, b, rand) => Math.min(0.92, Math.max(0.08, 1 / (1 + Math.exp(-(a - b + normal(rand) * 0.8) / 2))));
function npcClaim(winner, loser, rand) {
  const pool = [loser.fighterId, ...loser.claims].filter((f) => f !== winner.fighterId && !winner.claims.includes(f));
  if (!pool.length) return null;
  return [...pool].sort((a, b) => gradeOf(b) + rand() * 0.2 - (gradeOf(a) + rand() * 0.2))[0];
}

/** One full bracket: the player always advances; everyone else is simulated. */
function simulate(playerId, rand) {
  const npcs = Object.fromEntries(ROSTER.map((f) => [f.id, { fighterId: f.id, claims: [], wins: 0 }]));
  let field = shuffle(ROSTER.map((f) => f.id), rand);
  const rounds = []; const path = [];
  for (let r = 1; r <= 5; r++) {
    const pairs = []; const next = [];
    for (let i = 0; i < field.length; i += 2) {
      const a = field[i], b = field[i + 1];
      if (a === playerId || b === playerId) {
        const opp = a === playerId ? b : a;
        path[r] = { fighterId: opp, claims: [...npcs[opp].claims], wins: r - 1, rating: rating({ ...npcs[opp], wins: r - 1 }) };
        pairs.push({ a, b, winner: playerId, loser: opp, player: true, claim: null }); next.push(playerId); continue;
      }
      const w = rand() < winChance(rating(npcs[a]), rating(npcs[b]), rand) ? a : b; const l = w === a ? b : a;
      const c = npcClaim(npcs[w], npcs[l], rand); if (c) npcs[w].claims.push(c);
      npcs[w].wins++; pairs.push({ a, b, winner: w, loser: l, claim: c }); next.push(w);
    }
    rounds.push({ round: r, pairs }); field = next;
  }
  return { rounds, path };
}

export function newRun(fighterId, seed = `run-${Date.now()}`, echo = null, difficulty = 'easy') {
  const own = rating({ fighterId, claims: [], wins: 0 });
  let best = null, bestScore = Infinity;
  for (let attempt = 0; attempt < 40; attempt++) {
    const sim = simulate(fighterId, rngFor(seed, 'bracket', attempt));
    let score = 0;
    for (let r = 1; r <= 5; r++) {
      const mine = own + 0.5 * 3.8 * (r - 1) + (stepForWins(r - 1) - 1), diff = sim.path[r].rating - mine, [lo, hi] = BANDS[r];
      score += diff < lo ? lo - diff : diff > hi ? diff - hi : 0;
    }
    if (score < bestScore) { bestScore = score; best = sim; }
    if (!score) break;
  }
  return {
    schema: SCHEMA, seed, fighterId, wins: 0, round: 1, attempt: 0, retriesUsed: {}, powers: echo && echo !== fighterId ? [fighterId, echo] : [fighterId],
    bracket: best, difficulty: normalizeDifficulty(difficulty), berserker: null, berserkPower: null, phase: 'INTRO', boutsLost: 0, history: [], started: Date.now(),
  };
}

/** Round 6: Monarque lifts a sealed warrior from the tournament archive and pours a third of his raw power into them.
 *  +50% HP, Soul and power effects. `extraPowers` is how many random powers they carry beside their own (five, like the player's five claims),
 *  and `monarqueEdicts` is the pool one Monarque Edict is drawn from: the power Monarque himself lends them. */
export const BERSERKER = { hp: PROGRESSION.foe[6][0], soul: PROGRESSION.foe[6][1], maxSoul: PROGRESSION.foe[6][1] + PROGRESSION.berserkerHeadroom, extraPowers: 5, boost: BERSERK_BOOST, monarqueEdicts: ['SENZU', 'FINAL_ATONEMENT', 'OTHER_WORLD', 'SOLAR_FLARE', 'SCOUTER', 'SHENRON_WISH'] };

export const stepOf = (run) => (run.round >= 6 ? 3 : stepForWins(run.wins));
/** The opponent for the current round: { fighterId, powers:[fighterIds], step, name, isGm } */
export function opponentFor(run) {
  if (run.round === 7) return { isGm: true, name: 'Monarque', fighterId: null, powers: [], step: 3 };
  if (run.round === 6) { const c = run.berserker ?? buildBerserker(run); return { ...c, monarquePower: c.monarquePower ?? null, step: 3, name: FIGHTER_BY_ID[c.fighterId].name, boost: BERSERKER.boost, start: foeStart(6) }; }
  const p = run.bracket.path[run.round];
  return { fighterId: p.fighterId, powers: [p.fighterId, ...p.claims], step: stepForWins(p.wins), name: FIGHTER_BY_ID[p.fighterId].name, wins: p.wins };
}
export const tickerFor = (run, round) => run.bracket.rounds[round - 1].pairs.filter((p) => !p.player).map((p) => ({ winner: p.winner, loser: p.loser, claim: p.claim }));

/** Powers the player may claim after beating `opp`: the loser's own power, or one they had collected.
 *  The Berserker is different: the player takes only the exact power Monarque overfed. */
export const claimOptions = (run, opp) => (run.round === 6 ? [opp.fighterId] : opp.powers).filter((f) => !run.powers.includes(f));

/** Round 6, the Berserker: a warrior from the tournament archive the player has NEVER faced and does not hold (and never the player).
 *  Chosen uniformly at random from that pool (no rating weighting, so the same top fighter does not keep coming back).
 *  Monarque infuses them with a third of his own power; see BERSERKER for the +50% surge. Rules, not authored content. */
export function buildBerserker(run) {
  const rand = rngFor(run.seed, 'berserker');
  const beaten = new Set([1, 2, 3, 4, 5].map((r) => run.bracket?.path?.[r]?.fighterId).filter(Boolean));
  const held = new Set(run.powers);
  let archive = ROSTER.map((f) => f.id).filter((id) => id !== run.fighterId && !beaten.has(id) && !held.has(id));
  if (!archive.length) archive = ROSTER.map((f) => f.id).filter((id) => id !== run.fighterId && !held.has(id));
  if (!archive.length) archive = ROSTER.map((f) => f.id).filter((id) => id !== run.fighterId);
  const pick = archive[Math.floor(rand() * archive.length)];
  const taken = new Set([...held, pick]);
  const pool = shuffle(ROSTER.map((f) => f.id).filter((id) => !taken.has(id) && !beaten.has(id)), rand).sort((a, b) => gradeOf(b) - gradeOf(a) + (rand() - 0.5) * 0.9);
  const granted = []; const fam = {}; let s = 0;
  for (const id of pool) {
    if (granted.length >= BERSERKER.extraPowers) break;
    const sp = POWER_OF[id];
    if (sp.grade === 'S' && s >= 2) continue;
    if ((fam[sp.family] ?? 0) >= 2) continue;
    granted.push(id); fam[sp.family] = (fam[sp.family] ?? 0) + 1; if (sp.grade === 'S') s++;
  }
  for (const id of pool) { if (granted.length >= BERSERKER.extraPowers) break; if (!granted.includes(id)) granted.push(id); }
  const monarquePower = BERSERKER.monarqueEdicts[Math.floor(rand() * BERSERKER.monarqueEdicts.length)];
  return { fighterId: pick, powers: [pick, ...granted], monarquePower, rating: 0 };
}

// --- persistence --------------------------------------------------------------------------------
const ls = () => { try { return window.localStorage; } catch { return null; } };
export const saveRun = (run) => { try { ls()?.setItem(SAVE_KEY, JSON.stringify(run)); } catch { /* storage blocked */ } };
// A save made with another roster (older build) would point at contenders that no longer exist and crash the screen. Validate every id.
const runIsSound = (r) => {
  const known = (id) => id == null || (POWER_OF[id] && FIGHTER_BY_ID[id]);
  const list = (a) => !a || (Array.isArray(a) && a.every(known));
  return r && r.schema === SCHEMA && known(r.fighterId) && list(r.powers) && list(r.defeated) && (!r.foes || (typeof r.foes === 'object' && Object.values(r.foes).every((f) => !f || known(f.fighterId))));
};
export const loadRun = () => { try { const r = JSON.parse(ls()?.getItem(SAVE_KEY) ?? 'null'); if (runIsSound(r)) return r; if (r) ls()?.removeItem(SAVE_KEY); return null; } catch { return null; } };
export const clearRun = () => { try { ls()?.removeItem(SAVE_KEY); } catch { /* ignore */ } };
const blankProfile = () => ({ keepsake: null, runs: 0, clears: 0, bestRound: 0, defeated: {} });
export const loadProfile = () => { try { const p = { ...blankProfile(), ...JSON.parse(ls()?.getItem(PROFILE_KEY) ?? '{}') }; if (p.keepsake && !POWER_OF[p.keepsake]) p.keepsake = null; p.defeated = Object.fromEntries(Object.entries(p.defeated ?? {}).filter(([id]) => FIGHTER_BY_ID[id])); return p; } catch { return blankProfile(); } };
export const saveProfile = (p) => { try { ls()?.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* ignore */ } return p; };
export const updateProfile = (fn) => saveProfile(fn(loadProfile()));

/** Tiny bridge between the story screens and the Battle match screen that App.jsx owns. */
export const storyBridge = { cfg: null, pending: null };

// --- duel configuration (what App.jsx hands to the Battle engine) ------------------------------
import { GM_BOUTS } from './duel.js';
const MISTAKES = [0, 0.4, 0.4, 0.3, 0.2, 0.1, 0, 0];
// How hard the opponent leads with its strongest cards (Battle AI `aggression`). Grows with the tournament: later foes are merciless.
const AGGRESSION = [1, 1.1, 1.15, 1.25, 1.35, 1.45, 1.6, 1.7];
// How much the opponent learns your habits (AIEngine.setAdapt). Deliberately gentle: it starts barely noticeable, tops out well below 1, and eases off after a lost duel.
const ADAPT = [0, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.7];
export const roundLabel = (run) => (run.round === 7 ? GM_BOUTS[Math.min(2, run.boutsLost)].label : `${ROUND_TITLES[run.round]} · ${ROUND_NAMES[run.round]}`);
/** The twist for this round's duel (tournament rounds 2-5 only; the Berserker and Monarque are fixed encounters). Derived from the run seed, so a retry or a resumed save faces the same twist. */
export const twistFor = (run) => (run.round >= 2 && run.round <= 5 && run.twists !== false ? twistOf(pickTwist(rngFor(run.seed, 'twist', run.round), 0.35)) : null);
export function buildDuelCfg(run) {
  const me = FIGHTER_BY_ID[run.fighterId]; const opp = opponentFor(run);
  const retry = (run.retriesUsed?.[run.round] ?? 0) > 0;
  const foeF = opp.fighterId ? FIGHTER_BY_ID[opp.fighterId] : null;
  const gm = opp.isGm;
  const trial = trialFor(run.round, run.boutsLost);
  const twist = twistFor(run);
  const diff = difficultyOf(run.difficulty); // saves from before the selector have none: they were Easy
  const tough = (start) => (start && (diff.foeHpMul !== 1 || diff.foeKiMul !== 1) ? { ...start, hp: Math.round(start.hp * diff.foeHpMul), maxHp: Math.round(start.maxHp * diff.foeHpMul), ki: Math.round(start.ki * diff.foeKiMul), maxKi: Math.round(start.maxKi * diff.foeKiMul) } : start);
  const picker = diff.eagerMul !== 1 ? { ...(trial?.picker ?? {}), eagerMul: (trial?.picker?.eagerMul ?? 1) * diff.eagerMul } : trial?.picker;
  return {
    difficulty: diff.id, roundNo: run.round, drama: run.round <= 5, picker, twist: twist?.id ?? null,
    human: { name: me.short, fighterId: me.id, powers: run.powers, step: stepOf(run), start: run.round >= 7 ? playerFinalStart() : playerStart(run.round), gifts: retry ? ['SENZU'] : [], boosted: [], surged: run.berserkPower && run.powers.includes(run.berserkPower) ? [run.berserkPower] : [] }, // an ordinary collected power; when played it also restores 40% of max HP and Soul
    foe: gm ? { name: 'Monarque', gmBout: Math.min(2, run.boutsLost), temperament: 'SOVEREIGN', step: 3, start: tough(tiltStart(monarqueStart(Math.min(2, run.boutsLost)), trial)) } : { name: foeF.short, fighterId: foeF.id, powers: opp.powers, step: opp.step, temperament: foeF.temperament, start: tough(tiltStart(run.round === 6 ? opp.start : foeStart(run.round), trial)), ...(run.round === 6 ? { boost: opp.boost, monarquePower: opp.monarquePower } : {}) },
    stage: stageOf(run.round, run.boutsLost),
    pace: paceFor(run.round, run.boutsLost),
    trial,
    mistake: trial?.noMistakes ? 0 : (MISTAKES[run.round] ?? 0) * diff.mistakeMul,
    aggression: (AGGRESSION[run.round] ?? 1.2) + diff.aggrAdd,
    adapt: Math.min(1, Math.round((ADAPT[run.round] ?? 0.5) * (retry ? 0.6 : 1) * diff.adaptMul * 100) / 100),
    arena: run.round >= 7 ? 6 : Math.max(0, Math.min(run.round, 6) - 1),
    hud: {
      twist: twist ? { id: twist.id, name: twist.name, icon: twist.icon, blurb: twist.blurb } : null, trial: trialCard(trial), roundLabel: roundLabel(run), step: stepOf(run), isGm: gm, opener: gm ? BOUT_OPENERS[Math.min(2, run.boutsLost)] : null, fading: gm ? FADING_LINES[Math.min(2, run.boutsLost)] : null, foeId: foeF?.id ?? null, foeName: gm ? 'Monarque' : foeF.name, foeType: gm ? 'Celestial sovereign' : foeF.type,
      foePowers: gm ? [] : opp.powers, foeMonarquePower: gm ? null : opp.monarquePower ?? null, retry: run.round <= 6 ? (run.retriesUsed?.[run.round] ? 0 : 1) : null, stage: stageOf(run.round, run.boutsLost),
      temperament: gm ? null : foeF.temperament, berserker: run.round === 6,
      stake: gm ? `Win any bout and the seals break · ${3 - run.boutsLost} left` : run.round === 6 ? 'Berserk: +50% HP, Soul and power · Win: take the berserker’s power (restores 40% HP and Soul when played) · Lose: be sealed into a card' : 'Win: bind their power · Lose: be sealed into a card',
    },
  };
}
