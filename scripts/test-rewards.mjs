import assert from 'node:assert/strict';
const store = new Map();
globalThis.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) } };
const P = await import('../src/services/progress.js');
const S = await import('../src/services/storage.js');
const { TWIST_IDS } = await import('../src/game/twists.js');
const { difficultyOf } = await import('../src/config/difficulty.js');

assert.deepEqual([1, 1, 1.5, 2], ['baseline', 'easy', 'normal', 'hard'].map((d) => difficultyOf(d).coinMul));
// Halls: two free, rest earned; old saves keep what they had won.
const p0 = P.emptyProgress();
assert.deepEqual(Object.keys(P.HALL_RULES).filter((h) => P.hallUnlocked(h, p0, { matchesWon: 0 })), ['cathedral', 'temple']);
assert.ok(P.hallUnlocked('fortress', p0, { matchesWon: 7 }), 'an old save with 7 wins keeps the fortress');
assert.ok(P.hallNeed('ruins') && !P.hallNeed('cathedral'));

// Feats pay once; earning is idempotent.
let r = P.applyMatch(p0, { won: true, mode: 2, difficulty: 'easy', twist: null }, 'T1');
assert.deepEqual(r.earned.map((f) => f.id), ['FIRST_BLOOD']); assert.equal(r.coins, 5);
r = P.applyMatch(r.progress, { won: true, mode: 4, difficulty: 'hard', twist: 'BLOOD_MOON', clutch: true, comeback: true }, 'T2');
for (const id of ['FOUR_WAY', 'STEEL_NERVES', 'UNBROKEN', 'CLUTCH', 'COMEBACK', 'TWISTED']) assert.ok(r.progress.feats[id], id);
assert.ok(P.hallUnlocked('citadel', r.progress, {}) && P.hallUnlocked('sea', r.progress, {}) && P.hallUnlocked('ruins', r.progress, {}));
const again = P.applyMatch(r.progress, { won: true, mode: 4, difficulty: 'hard', twist: 'BLOOD_MOON' }, 'T3'); assert.equal(again.coins, 0); assert.equal(again.progress.feats.FIRST_BLOOD, 'T1', 'earn date is kept');
// A loss earns nothing and counts nothing.
const lost = P.applyMatch(P.emptyProgress(), { won: false, mode: 2, difficulty: 'hard', twist: 'IRON_VEIL', clutch: true }); assert.equal(lost.coins, 0); assert.equal(lost.progress.counters.wins, 0); assert.equal(lost.progress.counters.twistWins.length, 0);
// Every twist -> Master of Fates.
let pm = P.emptyProgress(); for (const t of TWIST_IDS) pm = P.applyMatch(pm, { won: true, mode: 2, difficulty: 'easy', twist: t }).progress; assert.ok(pm.feats.ALL_TWISTS);
// Does not mutate its input.
const frozen = JSON.stringify(p0); P.applyMatch(p0, { won: true, mode: 2, difficulty: 'easy', twist: 'BLOOD_MOON' }); assert.equal(JSON.stringify(p0), frozen);

// Story first clears pay once per difficulty+round; harder pays more; feats follow.
let sp = P.emptyProgress(); const a = P.applyStoryWin(sp, { round: 2, difficulty: 'easy' }); assert.ok(a.firstClear && a.earned.some((f) => f.id === 'STORY_FIRST'));
const b = P.applyStoryWin(a.progress, { round: 2, difficulty: 'easy' }); assert.ok(!b.firstClear, 'no farming the same clear');
const c = P.applyStoryWin(b.progress, { round: 2, difficulty: 'hard' }); assert.ok(c.firstClear, 'a harder clear pays again');
assert.equal(Math.round(P.STORY_CLEAR_COINS[2] * difficultyOf('hard').coinMul), 6);
sp = a.progress; for (const [round, difficulty] of [[5, 'easy'], [6, 'easy'], [7, 'easy'], [7, 'hard']]) sp = P.applyStoryWin(sp, { round, difficulty }).progress;
for (const id of ['TOURNAMENT', 'BERSERKER', 'MONARQUE', 'HARD_CROWN']) assert.ok(sp.feats[id], id);
assert.ok(!P.applyStoryWin(P.emptyProgress(), { round: 99, difficulty: 'easy' }).firstClear && !P.applyStoryWin(P.emptyProgress(), { round: 1, difficulty: 'nope' }).firstClear);

// Storage round-trips progress and coerces junk.
S.saveGameData({ ...S.loadGameData(), progress: sp }); assert.deepEqual(S.loadGameData().progress.feats, sp.feats);
store.set('monarque.game.v1', JSON.stringify({ progress: { counters: { wins: 'x', clutch: -5, twistWins: ['BLOOD_MOON', 'nope', 3] }, feats: { FIRST_BLOOD: 'd', FAKE: 'd', CLUTCH: 5 }, storyClaimed: ['easy:2', 'bogus', 'hard:9'] } }));
const d = S.loadGameData().progress; assert.equal(d.counters.wins, 0); assert.equal(d.counters.clutch, 0); assert.deepEqual(d.counters.twistWins, ['BLOOD_MOON']); assert.deepEqual(Object.keys(d.feats), ['FIRST_BLOOD']); assert.deepEqual(d.storyClaimed, ['easy:2']);
store.set('monarque.game.v1', JSON.stringify({ profile: { name: 'Old' } })); assert.deepEqual(S.loadGameData().progress, P.emptyProgress(), 'a save from before feats gets empty progress');
console.log('rewards tests passed');
