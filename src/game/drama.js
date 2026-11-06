// Tension and comebacks. Opt-in per engine (options.drama), so rules tests and balance simulations are untouched.
//   Last Breath      Once per fighter per match, the first time they fall to 25% HP: +4 Soul and the next round's HP loss is halved. A trailing fighter always has one real swing left.
//   Final Reckoning  When exactly two fighters remain and both are at 35% HP or less, HP losses are x1.5 until it ends. The finish is decisive.
//   Clutch rewards   Battle only: a win at 20% HP or less pays +2 coins, and a win after a Last Breath pays +3 coins.
export const DRAMA = Object.freeze({ breathAt: 0.25, breathKi: 4, breathCut: 0.5, reckoningAt: 0.35, reckoningMult: 1.5, clutchAt: 0.2, clutchCoins: 2, comebackCoins: 3 });

/** Coins and reasons for how the human won. `state` is the final match view. */
export function clutchBonus(state) {
  const none = { coins: 0, reasons: [], clutch: false, comeback: false };
  if (!state?.drama || !state.winner) return none;
  const me = state.players?.[0]; if (!me || state.winner !== me.id) return none;
  const reasons = []; let coins = 0; let clutch = false, comeback = false;
  if (me.hp <= (me.maxHp ?? 100) * DRAMA.clutchAt) { coins += DRAMA.clutchCoins; clutch = true; reasons.push(`Clutch win (+${DRAMA.clutchCoins})`); }
  if (me.breathUsed) { coins += DRAMA.comebackCoins; comeback = true; reasons.push(`Comeback (+${DRAMA.comebackCoins})`); }
  return { coins, reasons, clutch, comeback };
}
