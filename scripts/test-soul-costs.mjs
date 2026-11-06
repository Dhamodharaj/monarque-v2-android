// Individual Soul costs: Story Mode charges each bound being its own soulCost; Battle Mode keeps the tier costs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameEngine } from '../src/game/GameEngine.js';
import { createStoryEngine } from '../src/story/duel.js';
import { getCardCost, getSoulCost, classifyCard, CARD_TIER_COST } from '../src/game/CardTiers.js';

const cards = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url)));
const chars = cards.filter((c) => c.type === 'CHARACTER');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log(`PASS ${m}`); };
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

ok(chars.length === 60 && chars.every((c) => Number.isInteger(c.soulCost) && c.soulCost >= 0), 'all 60 bound beings carry a non-negative integer soulCost');
ok(chars.filter((c) => c.tier === 'WEAK').every((c) => c.soulCost === 0), 'Elusive (Last Stand) beings cost 0');
ok(chars.filter((c) => c.tier !== 'WEAK').every((c) => c.soulCost >= 1), 'every other being costs at least 1 Soul');
ok(new Set(chars.map((c) => c.soulCost)).size >= 5, 'costs are individual, not one flat value per tier');
for (const tier of ['OP', 'POWERFUL', 'NORMAL']) {
  const xs = chars.filter((c) => c.tier === tier).map((c) => c.soulCost);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  ok(Math.abs(mean - CARD_TIER_COST[tier]) <= 0.4, `${tier} average cost (${mean.toFixed(2)}) stays near the tier cost ${CARD_TIER_COST[tier]}`);
}

// Battle Mode: unchanged tier costs, even though the data now has soulCost.
const battle = new GameEngine(cards, { random: rng(3) }); battle.createMatch(2); battle.startMatch();
const bHand = battle.state.players[0].hand.filter((c) => c.type === 'CHARACTER');
ok(bHand.every((c) => getCardCost(c, chars) === CARD_TIER_COST[classifyCard(c, chars)]), 'Battle Mode charges the tier cost');

// Story Mode: the engine's own cards charge their individual cost.
let differs = 0, seen = 0;
for (let seed = 1; seed <= 12; seed++) {
  const eng = createStoryEngine(cards, { random: rng(seed), human: { name: 'H', powers: ['apep'], step: 1 }, foe: { name: 'F', powers: [], step: 1 } });
  for (const pl of eng.state.players) for (const c of pl.hand.filter((x) => x.type === 'CHARACTER')) {
    seen++;
    const expect = c.lastStand || classifyCard(c, chars) === 'WEAK' ? 0 : c.soulCost;
    assert.equal(getCardCost(c, chars), expect, `${c.id} cost in Story Mode`);
    if (getCardCost(c, chars) !== CARD_TIER_COST[classifyCard(c, chars)]) differs++;
    if (c.lastStand) assert.equal(getCardCost(c, chars), 0, 'Last-Stand card is free');
  }
}
ok(seen > 0 && differs > 0, `Story Mode charges soulCost on ${seen} dealt cards (${differs} differ from their tier cost)`);

// The engine really deducts it: play a 2-Soul NORMAL being and check Soul spent.
let paid = false;
for (let seed = 1; seed <= 40 && !paid; seed++) {
  const eng = createStoryEngine(cards, { random: rng(seed), human: { name: 'H', powers: [], step: 1 }, foe: { name: 'F', powers: [], step: 1 } });
  const lead = eng.state.players.find((p) => p.id === eng.state.currentPlayer);
  const card = lead.hand.find((c) => c.type === 'CHARACTER' && !c.lastStand && c.soulCost === 2 && c.tier === 'NORMAL');
  if (!card) continue;
  eng.callStat(lead.id, 'POWER'); const before = lead.ki; eng.playCard(lead.id, card.id);
  assert.equal(before - lead.ki, 2, 'engine deducted the card-specific cost');
  paid = true;
}
ok(paid, 'the engine deducts the card-specific Soul cost when a card is played');

// Fallback: a being without a valid soulCost uses its tier cost.
const bare = { ...chars.find((c) => c.tier === 'POWERFUL'), costMode: 'SOUL', soulCost: undefined };
ok(getSoulCost(bare, chars) === CARD_TIER_COST.POWERFUL, 'missing soulCost falls back to the tier cost');
console.log(`PASS soul cost tests (${n})`);
