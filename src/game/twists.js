// Match twists: one rule modifier that shapes a whole match, so no two duels play alike.
// A twist only tunes numbers the engine already has (HP loss, Soul gain, cooldowns, Soul at round start) or schedules the existing
// Domain Inversion; it never adds a card or breaks a rule, so the AI and every existing system keep working unchanged.
//   lossMult     multiplies every HP loss from placements
//   kiGainMul    multiplies Soul gained from placements (rounded down)
//   cooldownAdd  extra rounds a played card stays locked
//   kiPerRound   Soul every living fighter gains at the start of each round
//   invertEvery  every Nth round the order is reversed (lower stat wins), via the existing Domain Inversion
export const TWISTS = Object.freeze({
  BLOOD_MOON: Object.freeze({ id: 'BLOOD_MOON', name: 'Blood Moon', icon: '☾', blurb: 'Every wound cuts deeper: all HP losses are 30% larger. Matches end fast.', lossMult: 1.3 }),
  IRON_VEIL: Object.freeze({ id: 'IRON_VEIL', name: 'Iron Veil', icon: '◈', blurb: 'The air thickens: all HP losses are 25% smaller. A long game of patience and positioning.', lossMult: 0.75 }),
  SOUL_TIDE: Object.freeze({ id: 'SOUL_TIDE', name: 'Soul Tide', icon: '≈', blurb: 'Soul floods the hall: every fighter gains +1 Soul at the start of each round. Big plays come early.', kiPerRound: 1 }),
  DRY_VEINS: Object.freeze({ id: 'DRY_VEINS', name: 'Dry Veins', icon: '∅', blurb: 'Soul is scarce: Soul won from rounds is halved. Spend it where it counts.', kiGainMul: 0.5 }),
  MIRROR_ROUNDS: Object.freeze({ id: 'MIRROR_ROUNDS', name: 'Mirror Rounds', icon: '⇄', blurb: 'Every 4th round the order reverses: the lower stat wins. Keep a weak card in reserve.', invertEvery: 4 }),
  HEAVY_HANDS: Object.freeze({ id: 'HEAVY_HANDS', name: 'Heavy Hands', icon: '▣', blurb: 'Played cards stay locked 1 round longer. Rotate your hand; you cannot lean on one card.', cooldownAdd: 1 }),
});
export const TWIST_IDS = Object.freeze(Object.keys(TWISTS));
export const twistOf = (id) => (typeof id === 'string' && Object.hasOwn(TWISTS, id) ? TWISTS[id] : null);

/** Picks a twist from `random` (a 0..1 function). `none` is the chance of a plain match. */
export function pickTwist(random = Math.random, none = 0) {
  if (random() < none) return null;
  return TWISTS[TWIST_IDS[Math.floor(random() * TWIST_IDS.length)]].id;
}
