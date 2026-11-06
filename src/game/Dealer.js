import { GAME_CONFIG } from '../config/gameConfig.js';
// Opening-hand dealer. Pure function: no engine state, seeded through `random`.
// Hand = 12 cards: 2 Last-Stand (Weak) cards, 1 strong-Power + 1 strong-Rank star (one per seat, drawn from the top ~10, so the very best cards are not always dealt) + 1 more Powerful(or OP), 1–2 Wildcards, rest random non-Weak characters.
// Weak-tier cards not dealt as Last-Stand cards are left out of the game so nobody can find a free card outside the rule.
// The Curse is always dealt to one random opening hand. With 4 players 6 of the 8 Wildcards are dealt
// (the other 2 stay in the shared reserve so the 30% Wildcard draw can happen); with 2 players 4 are dealt.
export function dealOpeningHands({ characters, wildcards, playerCount, random, tierOf, handSize = GAME_CONFIG.survival.openingHand }) {
  const shuffle = (items) => { const a = [...items]; for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let charPool = shuffle(characters);
  const wilds = shuffle(wildcards);
  const curseIndex = wilds.findIndex((c) => c.effectId === 'CURSE');
  const curse = curseIndex >= 0 ? wilds.splice(curseIndex, 1)[0] : null;
  const curseHolderIndex = curse ? Math.floor(random() * playerCount) : -1;
  const extraSet = new Set(shuffle([...Array(playerCount).keys()]).slice(0, 2));
  const isPowerful = (c) => ['POWERFUL', 'OP'].includes(tierOf(c));
  const isWeak = (c) => tierOf(c) === 'WEAK';
  const weakPool = charPool.filter(isWeak); charPool = charPool.filter((c) => !isWeak(c));
  // Everyone must hold the same number of Last-Stand cards. If the roster has too few Weak (Elusive) beings for that, the weakest
  // NORMAL beings are bound as Last Stands instead (tier WEAK: free, playable only at 0 Soul) so the seats stay equal.
  const need = playerCount * GAME_CONFIG.lastStand.cards - weakPool.length;
  if (need > 0) {
    const lowest = charPool.filter((c) => tierOf(c) === 'NORMAL').sort((a, b) => a.power - b.power).slice(0, need);
    for (const c of lowest) weakPool.push({ ...c, tier: 'WEAK', powerGroup: 'WEAK' });
    charPool = charPool.filter((c) => !lowest.includes(c));
  }
  const pick = (pred, k) => { const out = []; for (const c of charPool) { if (out.length >= k) break; if (pred(c)) out.push(c); } charPool = charPool.filter((c) => !out.includes(c)); return out; };
  // Fair stars: every seat gets exactly one top-Power card and one top-Rank card (the best numbers go one per seat, shuffled), so nobody
  // opens without a real Power or Rank threat and nobody opens with two of them.
  // The star comes from a wider pool of strong cards (not always the single best one), so the top Power / Rank 1 card only turns up now and then.
  const takeTop = (cmp) => { const pool = [...charPool].sort(cmp).slice(0, Math.max(playerCount * 4, 10)); const top = shuffle(pool).slice(0, playerCount); charPool = charPool.filter((c) => !top.includes(c)); return top; };
  const topPower = takeTop((a, b) => b.power - a.power);
  const topRank = takeTop((a, b) => a.rank - b.rank);
  const hands = [];
  for (let i = 0; i < playerCount; i += 1) {
    const wc = [];
    if (i === curseHolderIndex) wc.push(curse); else if (wilds.length) wc.push(wilds.shift());
    if (extraSet.has(i) && wilds.length) wc.push(wilds.shift());
    const lastStand = weakPool.splice(0, GAME_CONFIG.lastStand.cards).map((c) => ({ ...c, lastStand: true }));
    const stars = [topPower[i], topRank[i]].filter(Boolean);
    const chars = [...stars, ...pick(isPowerful, Math.max(0, 3 - stars.filter(isPowerful).length)), ...lastStand];
    chars.push(...pick(() => true, handSize - wc.length - chars.length));
    hands.push(shuffle([...chars, ...wc]).map((c) => ({ ...c })));
  }
  const reserve = shuffle([...charPool, ...wilds]);
  return { hands, reserve, curseHolderIndex };
}