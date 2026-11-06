export const MODES = Object.freeze({ TWO_PLAYER: 2, FOUR_PLAYER: 4 });
export const DIRECTIONS = Object.freeze({ CLOCKWISE: 1, COUNTER_CLOCKWISE: -1 });
export const CALLS = Object.freeze({ POWER: 'POWER', RANK: 'RANK' });
export const TOTAL = 'TOTAL'; // Total Might crazy round: Power and Rank both count
const RANK_MAX = 60;
/** Comparable strength of a card for a call (higher = better). TOTAL = Power% + Rank%. */
export function statScore(card, call) {
  if (call === CALLS.POWER) return card.power;
  if (call === CALLS.RANK) return RANK_MAX + 1 - card.rank;
  if (call === TOTAL) return card.power / 999 * 100 + (RANK_MAX + 1 - card.rank) / RANK_MAX * 100;
  throw new Error(`Invalid call: ${call}`);
}
export const PHASES = Object.freeze({
  LOBBY: 'LOBBY',
  MODE_SELECTED: 'MODE_SELECTED',
  DEALING: 'DEALING',
  MATCH_READY: 'MATCH_READY',
  WAITING_FOR_PLAYER: 'WAITING_FOR_PLAYER',
  CALLING_STAT: 'CALLING_STAT',
  PLAYING_CARD: 'PLAYING_CARD',
  WAITING_FOR_AI: 'WAITING_FOR_AI',
  RESOLVING_TRICK: 'RESOLVING_TRICK',
  TRICK_COMPLETE: 'TRICK_COMPLETE',
  NEXT_TURN: 'NEXT_TURN',
  GM_DECREE: 'GM_DECREE',
  MATCH_COMPLETE: 'MATCH_COMPLETE'
});

export function compareCards(a, b, call) {
  return statScore(a, call) - statScore(b, call);
}

export function getNextPlayerIndex(currentIndex, playerCount, direction) {
  return (currentIndex + direction + playerCount) % playerCount;
}
