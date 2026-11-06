export const SHOP_PRICES = Object.freeze({
  COMMON: 5,
  RARE: 10,
  EPIC: 20,
  LEGENDARY: 40
});

export const SPECIAL_REFERENCE_PRICES = Object.freeze({
  WILDCARD: 25,
  CRAZY_ROUND: 35,
  GM_POWER: 50
});

export function getCardPrice(card) {
  const type = String(card?.shopKind || card?.type || '').toUpperCase();
  if (SPECIAL_REFERENCE_PRICES[type]) return SPECIAL_REFERENCE_PRICES[type];
  return SHOP_PRICES[card?.rarity] ?? SHOP_PRICES.COMMON;
}
