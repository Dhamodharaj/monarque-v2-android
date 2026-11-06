import fs from 'node:fs';
import cards from '../src/data/cards.json' with { type: 'json' };

const ranges = { OP: [990, 999], POWERFUL: [880, 989], NORMAL: [100, 879], WEAK: [1, 99] };
// Story Mode invocation cost per bound being, by tier: Last-Stand (WEAK) cards are free, every other card must cost at least 1.
const soulBands = { OP: [4, 6], POWERFUL: [2, 4], NORMAL: [1, 2], WEAK: [0, 0] };
const required = ['id','character','form','title','description','power','rank','powerGroup','series','category','rarity','image'];
const errors = [];
const characterCards = cards.filter(card => card.type === 'CHARACTER');
const wildcardCards = cards.filter(card => card.type === 'WILDCARD');
const crazyCards = cards.filter(card => card.type === 'CRAZY_ROUND');
const gmCards = cards.filter(card => card.type === 'GM_POWER');
const ids = new Set(), powers = new Set(), ranks = new Set();

if (characterCards.length !== 60) errors.push(`Expected 60 character cards, found ${characterCards.length}`);
if (wildcardCards.length !== 8 || crazyCards.length !== 7 || gmCards.length !== 8) errors.push(`Expected pools WILDCARD=8, CRAZY_ROUND=7, GM_POWER=8; found ${wildcardCards.length}/${crazyCards.length}/${gmCards.length}`);
for (const [i, card] of cards.entries()) {
  for (const key of required) if (!(key in card)) errors.push(`Card ${i} missing ${key}`);
  if (ids.has(card.id)) errors.push(`Duplicate id: ${card.id}`); ids.add(card.id);
  if (!['CHARACTER','WILDCARD','CRAZY_ROUND','GM_POWER'].includes(card.type)) errors.push(`Invalid type: ${card.id}`);
  if (card.type === 'CHARACTER') {
    if (powers.has(card.power)) errors.push(`Duplicate power: ${card.power}`); powers.add(card.power);
    if (ranks.has(card.rank)) errors.push(`Duplicate rank: ${card.rank}`); ranks.add(card.rank);
    if (card.tier !== card.powerGroup) errors.push(`tier/powerGroup mismatch: ${card.id}`);
    const band = soulBands[card.tier];
    if (!Number.isInteger(card.soulCost) || card.soulCost < 0) errors.push(`soulCost must be a non-negative integer: ${card.id} (${card.soulCost})`);
    else if (!band || card.soulCost < band[0] || card.soulCost > band[1]) errors.push(`soulCost ${card.soulCost} outside the ${card.tier} band ${band?.join('-')}: ${card.id}`);
    const range = ranges[card.tier];
    if (!range || card.power < range[0] || card.power > range[1]) errors.push(`Invalid power group/range: ${card.id}`);
  } else if (!card.effectId) errors.push(`Special card missing effectId: ${card.id}`);
}
for (let rank = 1; rank <= 60; rank++) if (!ranks.has(rank)) errors.push(`Missing rank: ${rank}`);

const weak = characterCards.filter(c => c.tier === 'WEAK').length;
if (weak < 4) errors.push(`Need >= 4 WEAK (Last-Stand) cards; the dealer binds the weakest NORMAL beings when a 4-player deal needs more. Found ${weak}`);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`PASS: ${cards.length}-record unified registry; ${characterCards.length} characters, ${wildcardCards.length} Wildcards, ${crazyCards.length} Crazy Rounds, ${gmCards.length} GM Powers; unique IDs and valid character stats.`);
