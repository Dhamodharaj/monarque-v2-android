// Validates the supplied Monarque data after it has been integrated: counts, ids, required fields, effect mapping,
// contender <-> power coverage, and that display-only copy has not drifted from the engine's configured values.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDICTS, WHIMS, OMENS, CONTENDERS, ENGINE_EFFECT } from '../src/data/monarque.generated.js';
import { POWERS, POWER_OF } from '../src/story/powers.js';
import { ROSTER } from '../src/story/roster.js';
import { GAME_CONFIG } from '../src/config/gameConfig.js';
import { WILDCARD_CARDS, CRAZY_ROUNDS, GM_POWERS } from '../src/game/SpecialCards.js';

const cards = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url)));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const uniq = (arr) => new Set(arr).size === arr.length;

ok(EDICTS.length === 8 && WHIMS.length === 8 && OMENS.length === 7 && CONTENDERS.length === 32, 'counts: 8 edicts, 8 whims, 7 omens, 32 contenders');
ok(cards.filter((c) => c.type === 'CHARACTER').length === 60, '60 bound beings');
ok(uniq(cards.map((c) => c.id)), 'registry ids unique');
ok(uniq(CONTENDERS.map((c) => c.id)) && uniq(EDICTS.map((c) => c.id)) && uniq(WHIMS.map((c) => c.id)) && uniq(OMENS.map((c) => c.id)), 'ids unique within each set');

for (const c of CONTENDERS) {
  ok(['SOVEREIGN', 'DECEIVER', 'DEVOURER', 'ANCIENT'].includes(c.temperament), `${c.id}: valid temperament`);
  ok(c.character && c.form && c.description && c.personality, `${c.id}: display fields present`);
  ok(POWER_OF[c.id], `${c.id}: has a power row`);
  ok(!['power', 'rank', 'powerGroup', 'tier'].some((k) => k in c), `${c.id}: contenders are not playable cards (no Power/Rank/tier)`);
}
ok(POWERS.length === 32 && uniq(POWERS.map((p) => p.fighter)), '32 distinct power rows');
ok(ROSTER.length === 32, 'roster built from contenders');

for (const e of EDICTS) { ok(e.monarqueLines?.early && e.monarqueLines?.fraying, `${e.id}: early and fraying lines`); ok(ENGINE_EFFECT[e.effectId], `${e.id}: engine mapping`); }
for (const w of WHIMS) { ok(w.telegraph, `${w.id}: telegraph line`); ok(ENGINE_EFFECT[w.effectId], `${w.id}: engine mapping`); }
for (const o of OMENS) { ok(o.duration >= 1, `${o.id}: duration`); ok(ENGINE_EFFECT[o.effectId], `${o.id}: engine mapping`); }
ok(WILDCARD_CARDS.length === 8 && CRAZY_ROUNDS.length === 7 && GM_POWERS.length === 8, 'executable special-card sets are complete');
ok(uniq(Object.values(ENGINE_EFFECT)), 'engine mapping is one-to-one');

// Display copy must agree with configured values.
const EV = GAME_CONFIG.events;
const find = (arr, id) => arr.find((x) => x.id === id);
const tithe = find(WHIMS, 'whim-silent-tithe')?.rules ?? {};
ok(tithe.maxBid === EV.auction.maxBid && tithe.heal === EV.auction.heal, 'Silent Tithe matches config');
const boon = find(OMENS, 'omen-boon-round')?.rules?.options ?? {};
ok(boon.HEAL === EV.wish.heal && boon.SOUL === EV.wish.ki, 'Boon Round matches config');
ok(find(OMENS, 'omen-debt-doubled')?.rules?.lossMult === 2, 'Debt Doubled is x2');
// Story Mode is rename-only: Soul and Gather Soul share Ki's numbers.
ok(GAME_CONFIG.charge.hp === 11 && GAME_CONFIG.charge.ki === 4, 'Gather Soul: -11 HP, +4 Soul (retuned from -5 after balance runs: at -5 gathering beat the AI 66-71%)');
console.log(`PASS Monarque data validation (${n} checks)`);
