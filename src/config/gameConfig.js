/** Author credit shown on the main menu, the ending and the credits. */
export const AUTHOR = 'dhamo ss';
/** Soundtrack credit (required by the track's licence): shown on the main menu and the ending. See docs/CREDITS.md. */
export const MUSIC_CREDIT = { title: 'Unsolved Investigation', composer: 'isaiah658' };

export const GAME_CONFIG = Object.freeze({
  deckSize: 60, rankMax: 60, registrySize:83, playableDeckSize:60,
  survival: Object.freeze({ startingHp:100, maxHp:100, startingKi:14, maxKi:20, openingHand:12, maxHand:18, maxWildcards:3, maxRounds:200 }),
  modes: Object.freeze({
    TWO_PLAYER: Object.freeze({ players:2, cardsPerPlayer:12 }),
    FOUR_PLAYER: Object.freeze({ players:4, cardsPerPlayer:12 })
  }),
  draw: Object.freeze({ maxDrawsPerPlayerPerMatch:3, cost:3, wildcardChance:.30, perRound:1 }),
  coins: Object.freeze({ initial:2, roundWinReward:2, matchWinReward:0 }),
  tiers: Object.freeze({ WEAK:0, NORMAL:1, POWERFUL:3, OP:5 }),
  boosts: Object.freeze({ powerPerKi:25, rankPlacesPerKi:3, maxPower:999, minRank:1 }),
  // Placement tables are chosen by the number of RANKED cards in the round (passes / Mafuba-voided players excluded).
  placements: Object.freeze({
    FOUR_PLAYER: Object.freeze([{hp:3,ki:0,coins:2},{hp:1,ki:1,coins:1},{hp:-10,ki:2,coins:0},{hp:-15,ki:3,coins:0}]),
    THREE_RANKED: Object.freeze([{hp:3,ki:0,coins:2},{hp:-8,ki:2,coins:0},{hp:-20,ki:3,coins:0}]),
    TWO_PLAYER: Object.freeze([{hp:3,ki:0,coins:2},{hp:-10,ki:3,coins:0}]),      // 2-player mode
    DUEL_ENDGAME: Object.freeze([{hp:3,ki:0,coins:2},{hp:-15,ki:3,coins:0}]),    // last two survivors of a 4-player match
    MAFUBA_TWO: Object.freeze([{hp:3,ki:0,coins:2},{hp:-5,ki:3,coins:0}])        // Mafuba round: two ranked cards
  }),
  // Arena Pressure: HP losses are multiplied as the match drags on.
  arenaPressure: Object.freeze([{fromRound:18,mult:2},{fromRound:14,mult:1.5},{fromRound:10,mult:1.25}]),
  maxRoundHpLoss: -40,
  passHpLoss: 3,
  // Voluntary CHARGE (responders only): skip the round to bank Soul. Not allowed at low HP; short cooldown.
  charge: Object.freeze({ hp:11, ki:4, minHp:20, cooldownRounds:3 }),
  // Spent rule: Soul gone, no Last-Stand card, nothing in hand within reach, and too little HP to Gather = eliminated (no dead-end turns).
  exhaustion: Object.freeze({ enabled:true }),
  kiRegen: 0,
  cooldowns: Object.freeze({ top:2, bottom:1, tierExtra:{ WEAK:0, NORMAL:0, POWERFUL:1, OP:2 } }),
  secondWind: Object.freeze({ atKi:-1, gain:1 }), // round start: a fighter at <= atKi Soul recovers `gain` (keeps Soul-0 spirals rare)
  mafubaSealRounds: 10,
  // Each fighter holds exactly two Last-Stand (Weak) cards: free, playable only at 0 Soul, spent when played; both gone = eliminated.
  lastStand: Object.freeze({ cards:2, kiBonus:3, shield:true, eliminateWhenSpent:false }),
  mafubaKi: Object.freeze({ WEAK:1, NORMAL:2, POWERFUL:3, OP:3 }),
  // A WEAK/NORMAL card that wins a round (3+ fighters) against a card two tiers above it earns a bonus.
  giantSlayer: Object.freeze({ gapTiers: 2, hp: 6, ki: 2 }),
  events: Object.freeze({
    gm: Object.freeze({ from:4, every:4, max:3 }),
    crazy: Object.freeze({ from:3, chance:.5, max:4, pityRounds:3 }),
    auction: Object.freeze({ maxBid:3, heal:15, kiBack:2 }),
    training: Object.freeze({ power:40, rank:5 }),
    bounty: Object.freeze({ hp:8, ki:2, lastPenalty:10 }),
    sideQuest: Object.freeze({ hp:12, ki:2 }),
    timeChamber: Object.freeze({ ki:3, rounds:2, lossMult:1.5 }),
    wish: Object.freeze({ heal:20, ki:6 }),
    highStakes: Object.freeze({ lossMult:2, gainMult:2 })
  }),
  turnDirections:['CLOCKWISE','COUNTER_CLOCKWISE'],
  calls:['POWER','RANK']
});
