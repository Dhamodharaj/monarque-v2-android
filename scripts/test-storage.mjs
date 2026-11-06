// Saved profile data is untrusted input: corrupt, hand-edited or oversized values are coerced; a blocked localStorage never throws.
import assert from 'node:assert/strict';
const store = new Map();
globalThis.window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { if (globalThis.__blocked) throw new Error('quota'); store.set(k, String(v)); } } };
const S = await import('../src/services/storage.js');
let n = 0; const ok = (m) => { n += 1; console.log(`PASS ${m}`); };

store.set('monarque.game.v1', JSON.stringify({ profile: { name: `\u0007${'y'.repeat(60)}`, walletCoins: 'NaN', ownedCardIds: ['a', 'a', 5, {}, 'b'] }, settings: { animations: 'yes' }, stats: { matchesWon: -4, roundsWon: '7' }, matchHistory: [1, null, { ok: 1 }] }));
const d = S.loadGameData();
assert.equal(d.profile.name.length, 24); assert.ok(!/[\u0000-\u001f]/.test(d.profile.name));
assert.equal(d.profile.walletCoins, 0); assert.deepEqual(d.profile.ownedCardIds, ['a', 'b']);
assert.equal(d.settings.animations, true); assert.equal(d.stats.matchesWon, 0); assert.equal(d.stats.roundsWon, 7);
assert.deepEqual(d.matchHistory, [{ ok: 1 }]);
ok('corrupt profile data is coerced to safe values');

store.set('monarque.game.v1', '{not json'); assert.equal(S.loadGameData().profile.name, 'Vessel'); ok('unparseable save falls back to defaults');

globalThis.__blocked = true;
assert.doesNotThrow(() => S.saveGameData({ profile: { name: 'Ash' } })); assert.doesNotThrow(() => S.resetGameData());
assert.equal(S.saveGameData({ profile: { name: 'Ash' } }).profile.name, 'Ash'); ok('blocked or full storage never throws');
console.log(`\n${n} storage checks passed`);
