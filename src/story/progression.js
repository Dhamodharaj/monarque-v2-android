// Story Mode stat progression: HP and Soul grow as the tournament goes on. Plain numbers, no tricks.
//
//   * The player starts a little frailer than the old flat 100 HP / 14 Soul and grows after every win.
//   * Every opponent is a step above the player, and the gap widens toward the end, so each round is a bit harder than the last.
//   * Round 6 (the Berserker) is the peak the player is climbing toward: 150 HP / 21 Soul (cap 30).
//   * The final: the player keeps the round-6 body; the Berserker's power restores 40% of max HP and Soul when played. Monarque is still higher, but fading.
//
// Index = round number (0 unused). Each entry is [HP, Soul]. Soul is also the *opening* Soul; the cap is Soul + headroom.
// Everything balance-related lives here so it can be tuned (and simulated: `PROG='{...}' node scripts/sim-story.mjs 200`) in one place.
/** The Berserker's power is an ordinary collected power; when played it restores 40% of max HP and Soul (see powers.js BERSERK_SURGE). */
export const BERSERK_STAT_BOOST = 1.4;
const PLAYER_R6 = [110, 15];
export const PROGRESSION = {
  player: [null, [90, 13], [94, 13], [98, 14], [102, 14], [106, 15], PLAYER_R6],
  foe: [null, [96, 14], [104, 15], [110, 16], [122, 17], [132, 19], [150, 21]],
  /** The player in the final: the same body as round 6. The Berserker's power adds its +40% only when played. */
  playerFinal: PLAYER_R6,
  /** Monarque's three bouts. He stays the stronger one, but he is failing (his stats fade, his hand thins; see GM_BOUTS). */
  monarque: [[228, 31], [210, 28], [196, 26]],
  /** Pacing: a multiplier on every HP loss in the duel (both sides), so higher = shorter fight. Early encounters run a little shorter,
   *  late ones keep the full length. Index = round (1..6); `paceFinal` = Monarque's three bouts. */
  pace: [null, 1.3, 1.25, 1.12, 1.08, 1, 0.96],
  paceFinal: [1, 1, 1],
  /** Soul above the opening value that a fighter can bank. The old flat rules were 14 opening, 20 cap: +6. */
  headroom: 6,
  /** The Berserker's surge also lifts its Soul cap further (21 opening, 30 cap). */
  berserkerHeadroom: 9,
};

const pair = ([hp, soul], headroom = PROGRESSION.headroom) => ({ hp, ki: soul, maxHp: hp, maxKi: soul + headroom });

/** Engine start block for the player in round 1..6. */
export const playerStart = (round) => pair(PROGRESSION.player[Math.max(1, Math.min(6, round))]);
/** Engine start block for the player in the final (Berserker power). */
export const playerFinalStart = () => pair(PROGRESSION.playerFinal, PROGRESSION.berserkerHeadroom);
/** Engine start block for a regular foe in round 1..5 and the Berserker (round 6). */
export const foeStart = (round) => pair(PROGRESSION.foe[Math.max(1, Math.min(6, round))], round >= 6 ? PROGRESSION.berserkerHeadroom : PROGRESSION.headroom);
/** Engine start block for Monarque's bout 0..2. */
export const monarqueStart = (bout) => pair(PROGRESSION.monarque[Math.max(0, Math.min(2, bout))], PROGRESSION.berserkerHeadroom);

/** HP-loss multiplier for a story duel (see PROGRESSION.pace). */
export const paceFor = (round, bout = 0) => (round >= 7 ? PROGRESSION.paceFinal[Math.max(0, Math.min(2, bout))] : PROGRESSION.pace[Math.max(1, Math.min(6, round))]);
