// Unlocks and rewards: feats (one-time achievements that pay coins), Battle halls that open as you win, and first-clear Story rewards.
// Pure functions over a small `progress` object that lives inside the saved game data (see storage.js). Nothing here touches storage itself.
import { TWIST_IDS } from '../game/twists.js';
import { DIFFICULTY_ORDER } from '../config/difficulty.js';

const STORY_KEYS = DIFFICULTY_ORDER.flatMap((d) => [1, 2, 3, 4, 5, 6, 7].map((r) => `${d}:${r}`));
export const emptyProgress = () => ({
  counters: { wins: 0, wins4: 0, winsNormal: 0, winsHard: 0, clutch: 0, comeback: 0, twistWins: [], storyWins: 0 },
  feats: {},
  storyClaimed: [], // 'difficulty:round' pairs whose first-clear coins were already paid
});

/** One-time achievements. `done(counters)` is checked after every recorded result; `reward` is paid once, in wallet coins. */
export const FEATS = Object.freeze([
  { id: 'FIRST_BLOOD', name: 'First Blood', desc: 'Win a Battle match.', reward: 5, done: (c) => c.wins >= 1, progress: (c) => [c.wins, 1] },
  { id: 'STEADY_HAND', name: 'Steady Hand', desc: 'Win 5 Battle matches.', reward: 10, done: (c) => c.wins >= 5, progress: (c) => [c.wins, 5] },
  { id: 'VETERAN', name: 'Veteran of the Fallen', desc: 'Win 25 Battle matches.', reward: 30, done: (c) => c.wins >= 25, progress: (c) => [c.wins, 25] },
  { id: 'FOUR_WAY', name: 'Last One Standing', desc: 'Win a four-vessel match.', reward: 10, done: (c) => c.wins4 >= 1, progress: (c) => [c.wins4, 1] },
  { id: 'STEEL_NERVES', name: 'Steel Nerves', desc: 'Win a Battle match on Normal.', reward: 10, done: (c) => c.winsNormal + c.winsHard >= 1, progress: (c) => [c.winsNormal + c.winsHard, 1] },
  { id: 'UNBROKEN', name: 'Unbroken', desc: 'Win a Battle match on Hard.', reward: 25, done: (c) => c.winsHard >= 1, progress: (c) => [c.winsHard, 1] },
  { id: 'CLUTCH', name: 'By a Thread', desc: 'Win a match with 20% HP or less.', reward: 10, done: (c) => c.clutch >= 1, progress: (c) => [c.clutch, 1] },
  { id: 'COMEBACK', name: 'Not Yet', desc: 'Win a match after drawing a Last Breath.', reward: 10, done: (c) => c.comeback >= 1, progress: (c) => [c.comeback, 1] },
  { id: 'TWISTED', name: 'Twisted Fate', desc: 'Win a match under a rule twist.', reward: 10, done: (c) => c.twistWins.length >= 1, progress: (c) => [c.twistWins.length, 1] },
  { id: 'ALL_TWISTS', name: 'Master of Fates', desc: 'Win a match under every twist.', reward: 30, done: (c) => TWIST_IDS.every((t) => c.twistWins.includes(t)), progress: (c) => [c.twistWins.length, TWIST_IDS.length] },
  { id: 'STORY_FIRST', name: 'The Rite Begins', desc: 'Win a Story duel.', reward: 5, done: (c) => c.storyWins >= 1, progress: (c) => [c.storyWins, 1] },
  { id: 'TOURNAMENT', name: 'Champion of the Fallen', desc: 'Win the fifth tournament duel.', reward: 20, done: (c, p) => p.storyClaimed.some((k) => k.endsWith(':5')), progress: (c, p) => [p.storyClaimed.some((k) => k.endsWith(':5')) ? 1 : 0, 1] },
  { id: 'BERSERKER', name: 'The Berserker Falls', desc: 'Defeat the Berserker.', reward: 20, done: (c, p) => p.storyClaimed.some((k) => k.endsWith(':6')), progress: (c, p) => [p.storyClaimed.some((k) => k.endsWith(':6')) ? 1 : 0, 1] },
  { id: 'MONARQUE', name: 'The Seals Break', desc: 'Defeat Monarque.', reward: 40, done: (c, p) => p.storyClaimed.some((k) => k.endsWith(':7')), progress: (c, p) => [p.storyClaimed.some((k) => k.endsWith(':7')) ? 1 : 0, 1] },
  { id: 'HARD_CROWN', name: 'The Hard Crown', desc: 'Defeat Monarque on Hard.', reward: 60, done: (c, p) => p.storyClaimed.includes('hard:7'), progress: (c, p) => [p.storyClaimed.includes('hard:7') ? 1 : 0, 1] },
]);
export const FEAT_BY_ID = Object.freeze(Object.fromEntries(FEATS.map((f) => [f.id, f])));

/** Battle halls: two are open from the start, the rest are earned. `test(counters, stats)` uses the saved stats too, so players with older saves keep what they have won. */
export const HALL_RULES = Object.freeze({
  cathedral: { need: null, test: () => true },
  temple: { need: null, test: () => true },
  fortress: { need: 'Win 3 Battle matches', test: (c, stats) => Math.max(c.wins, stats?.matchesWon ?? 0) >= 3 },
  citadel: { need: 'Win a four-vessel match', test: (c) => c.wins4 >= 1 },
  sea: { need: 'Win a match on Normal or Hard', test: (c) => c.winsNormal + c.winsHard >= 1 },
  ruins: { need: 'Win a match under a rule twist', test: (c) => c.twistWins.length >= 1 },
});
export const hallUnlocked = (id, progress, stats) => { const r = HALL_RULES[id]; return !r || r.test(progress?.counters ?? emptyProgress().counters, stats); };
export const hallNeed = (id) => HALL_RULES[id]?.need ?? null;

const clone = (p) => ({ counters: { ...p.counters, twistWins: [...p.counters.twistWins] }, feats: { ...p.feats }, storyClaimed: [...p.storyClaimed] });
function settle(p, now) {
  const earned = [];
  for (const f of FEATS) if (!p.feats[f.id] && f.done(p.counters, p)) { p.feats[f.id] = now; earned.push(f); }
  return { progress: p, earned, coins: earned.reduce((n, f) => n + f.reward, 0) };
}

/** A finished Battle match. m = { won, mode, difficulty, twist, clutch, comeback }. Returns { progress, earned, coins } (coins = feat rewards only). */
export function applyMatch(progress, m, now = new Date().toISOString()) {
  const p = clone(progress); const c = p.counters;
  if (m.won) {
    c.wins += 1; if (m.mode === 4) c.wins4 += 1;
    if (m.difficulty === 'normal') c.winsNormal += 1; if (m.difficulty === 'hard') c.winsHard += 1;
    if (m.clutch) c.clutch += 1; if (m.comeback) c.comeback += 1;
    if (m.twist && TWIST_IDS.includes(m.twist) && !c.twistWins.includes(m.twist)) c.twistWins.push(m.twist);
  }
  return settle(p, now);
}

/** A won Story duel. s = { round (1-7), difficulty }. Returns { progress, earned, coins (feats), firstClear (bool) }; the caller pays the first-clear coins with STORY_CLEAR_COINS. */
export const STORY_CLEAR_COINS = Object.freeze({ 1: 3, 2: 3, 3: 4, 4: 4, 5: 5, 6: 8, 7: 12 });
export function applyStoryWin(progress, s, now = new Date().toISOString()) {
  const p = clone(progress); const key = `${s.difficulty}:${s.round}`;
  p.counters.storyWins += 1;
  const firstClear = STORY_KEYS.includes(key) && !p.storyClaimed.includes(key);
  if (firstClear) p.storyClaimed.push(key);
  return { ...settle(p, now), firstClear };
}

/** Coerce untrusted saved data (hand-edited, truncated or from another build). */
export function normalizeProgress(raw) {
  const d = emptyProgress(); const rc = raw?.counters ?? {};
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1e6, Math.max(0, Math.floor(n))) : 0; };
  for (const k of Object.keys(d.counters)) if (k !== 'twistWins') d.counters[k] = num(rc[k]);
  d.counters.twistWins = Array.isArray(rc.twistWins) ? [...new Set(rc.twistWins.filter((t) => TWIST_IDS.includes(t)))] : [];
  if (raw?.feats && typeof raw.feats === 'object' && !Array.isArray(raw.feats)) for (const [id, when] of Object.entries(raw.feats)) if (FEAT_BY_ID[id] && typeof when === 'string') d.feats[id] = when.slice(0, 40);
  d.storyClaimed = Array.isArray(raw?.storyClaimed) ? [...new Set(raw.storyClaimed.filter((k) => STORY_KEYS.includes(k)))] : [];
  return d;
}
