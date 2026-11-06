import cards from '../data/cards.json' with { type: 'json' };
import { GAME_CONFIG } from '../config/gameConfig.js';

const REQUIRED_FIELDS = [
  'id', 'character', 'form', 'title', 'description', 'power', 'rank',
  'powerGroup', 'series', 'category', 'rarity', 'image'
];

const POWER_RANGES = {
  OP: [990, 999],
  POWERFUL: [880, 989],
  NORMAL: [100, 879],
  WEAK: [1, 99]
};

export function validateCardData(cardList = cards) {
  const errors = [];
  const characters = cardList.filter(card => !card.type || card.type === 'CHARACTER');
  const ids = new Set(), powers = new Set(), ranks = new Set();
  if (characters.length !== GAME_CONFIG.deckSize) errors.push(`Expected ${GAME_CONFIG.deckSize} character cards, found ${characters.length}.`);
  cardList.forEach((card, index) => {
    if (!card.id) errors.push(`Card ${index}: missing id.`);
    if (ids.has(card.id)) errors.push(`Duplicate card id: ${card.id}.`); ids.add(card.id);
    if (card.type && !['CHARACTER','WILDCARD','CRAZY_ROUND','GM_POWER'].includes(card.type)) errors.push(`Card ${card.id}: invalid type ${card.type}.`);
    if (card.type && card.type !== 'CHARACTER') { if (!card.effectId) errors.push(`Special card ${card.id}: missing effectId.`); return; }
    REQUIRED_FIELDS.forEach((field) => { if (!(field in card)) errors.push(`Card ${index}: missing ${field}.`); });
    if (powers.has(card.power)) errors.push(`Duplicate power: ${card.power}.`); powers.add(card.power);
    if (ranks.has(card.rank)) errors.push(`Duplicate rank: ${card.rank}.`); ranks.add(card.rank);
    const range = POWER_RANGES[card.powerGroup];
    if (!range) errors.push(`Card ${card.id}: invalid powerGroup ${card.powerGroup}.`);
    else if (card.power < range[0] || card.power > range[1]) errors.push(`Card ${card.id}: power ${card.power} is outside ${card.powerGroup} range.`);
  });
  if (ranks.size === GAME_CONFIG.deckSize) for (let rank = 1; rank <= GAME_CONFIG.deckSize; rank += 1) if (!ranks.has(rank)) errors.push(`Missing rank ${rank}.`);
  return { valid: errors.length === 0, errors };
}

export { cards };
