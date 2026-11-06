// Encounter trials: every duel tests a different skill, with no new characters and no new combat rules.
//
// A trial only turns knobs that already exist: how the opponent's AI calls POWER/RANK, how thrifty or reckless it is with Soul,
// how it times its powers, and a small HP/Soul tilt on top of the progression table (src/story/progression.js).
// The same fighter can therefore be a different kind of problem in a different round.
//
//   ai      -> AIEngine.setTrial(): { aggr, ki, reserve, noise, flip, stick, bluff, shift }  (see the AIEngine for what each does)
//   picker  -> makePowerPicker(..., style):  { hold:{round,foeHpFrac,heroHpFrac}, burst, eagerMul, reckless }
//   stats   -> added to the opponent's opening HP / Soul (and their caps)
//   tests   -> the skill the player is being asked to show; `hint` is the plain-language counter shown in the briefing and HUD.

export const SKILLS = ['ADAPTATION', 'RESOURCES', 'PREDICTION', 'TIMING', 'RISK', 'SELECTION'];

export const TRIALS = {
  // Round 1: an opponent with a clear habit. The gentlest way to learn that opponents have tendencies you can use.
  HABIT: {
    id: 'HABIT', tests: 'ADAPTATION', label: 'Creature of habit', short: 'Adapt',
    blurb: 'Keeps calling the same stat round after round.',
    hint: 'They repeat their last call again and again. Notice which stat it is, then keep the cards that beat it for when they lead.',
    ai: { stick: 0.8, noise: 0.08 }, picker: {}, stats: { hp: 4, soul: 1 },
  },
  // Round 2: a war of attrition. Whoever runs out of Soul first loses.
  ENDURANCE: {
    id: 'ENDURANCE', tests: 'RESOURCES', label: 'War of attrition', short: 'Soul',
    blurb: 'Hoards Soul and wins slowly with cheap cards.',
    hint: 'They save Soul and grind you down. Do not burn yours on early rounds: pick your fights, and gather Soul before you run dry.',
    ai: { aggr: 0.9, ki: 1.7, reserve: 10 }, picker: { eagerMul: 0.7 }, stats: { hp: 0, soul: 3 },
  },
  // Round 3: unreadable calls. Do not plan around the next call.
  READER: {
    id: 'READER', tests: 'PREDICTION', label: 'Unreadable', short: 'Predict',
    blurb: 'Switches between POWER and RANK without warning.',
    hint: 'They change stats without a pattern. Keep a spread of strong POWER and strong RANK cards instead of spending one kind first.',
    ai: { bluff: 0.35, flip: 0.4, noise: 0.18 }, picker: {}, stats: { hp: 0, soul: 0 },
  },
  // Round 4: powers held back, then unleashed together.
  PATIENT: {
    id: 'PATIENT', tests: 'TIMING', label: 'The patient blade', short: 'Timing',
    blurb: 'Holds its powers, then unleashes them in a burst.',
    hint: 'They hold their powers until the duel turns, then use one every round. Keep a heal or Soul in reserve for the moment the window opens.',
    ai: { aggr: 1.05 }, picker: { hold: { round: 9, heroHpFrac: 0.68, foeHpFrac: 0.5 }, burst: 1.5 }, stats: { hp: 0, soul: 0 },
  },
  // Round 5: all-in. High variance: survive the first burst, then punish.
  GAMBLER: {
    id: 'GAMBLER', tests: 'RISK', label: 'All in', short: 'Risk',
    blurb: 'Spends Soul and HP freely for fast, heavy hits.',
    hint: 'They go all in and run themselves dry. Weather the first burst, protect your HP, and punish them once their Soul is gone.',
    ai: { aggr: 1.3, ki: 0.4, reserve: 2, noise: 0.14 }, picker: { burst: 1.3, reckless: true }, stats: { hp: -7, soul: 0 },
  },
  // Round 6 (the Berserker): flawless card play. Every wasted card is a lost round.
  PRECISION: {
    id: 'PRECISION', tests: 'SELECTION', label: 'No slips', short: 'Cards',
    blurb: 'Plays the right card almost every time.',
    hint: 'They almost never misplay. Match your strongest cards to the stat they call and do not waste a good card on a lost round.',
    ai: { aggr: 1.3, ki: 0.6, noise: 0, flip: 0.02 }, picker: { burst: 1.3 }, noMistakes: true, stats: { hp: 0, soul: 0 },
  },
  // Final bouts (Monarque): he is failing, and every bout asks something different.
  ADAPTIVE: {
    id: 'ADAPTIVE', tests: 'ADAPTATION', label: 'He learns', short: 'Adapt',
    blurb: 'Settles into a habit, then abruptly reverses it.',
    hint: 'He repeats his calls, then at round 8 starts alternating POWER and RANK. Notice the change and adjust your hand.',
    ai: { stick: 0.8, shift: { at: 8, p: 0.85 }, noise: 0.06 }, picker: {}, noMistakes: true, stats: { hp: 0, soul: 0 },
  },
  PRESSURE: {
    id: 'PRESSURE', tests: 'RESOURCES', label: 'Crushing pressure', short: 'Soul',
    blurb: 'A huge reserve of Soul and no wasted spending.',
    hint: 'He outlasts anyone who burns Soul early. Spend where it wins a round, gather before you run empty.',
    ai: { aggr: 1.0, ki: 1.5, noise: 0.04 }, picker: {}, noMistakes: true, stats: { hp: 0, soul: 1 },
  },
  DESPERATE: {
    id: 'DESPERATE', tests: 'RISK', label: 'Nothing to lose', short: 'Risk',
    blurb: 'Fading, he throws everything he has left.',
    hint: 'He gambles his own HP for the kill. Stay out of range of his big hits and strike when he is spent.',
    ai: { aggr: 1.2, ki: 0.5, noise: 0.08 }, picker: { burst: 1.3, reckless: true }, noMistakes: true, stats: { hp: 0, soul: 0 },
  },
};

/** Which trial each encounter carries. Rounds 1..6, then Monarque's three bouts. */
export const TRIAL_BY_ROUND = [null, 'HABIT', 'ENDURANCE', 'READER', 'PATIENT', 'GAMBLER', 'PRECISION'];
export const TRIAL_BY_BOUT = ['ADAPTIVE', 'PRESSURE', 'DESPERATE'];

export const trialFor = (round, bout = 0) => TRIALS[round >= 7 ? TRIAL_BY_BOUT[Math.max(0, Math.min(2, bout))] : TRIAL_BY_ROUND[Math.max(1, Math.min(6, round))]];

/** The opponent's opening stats with the trial's tilt applied (caps follow). */
export const tiltStart = (start, trial) => {
  const t = trial?.stats ?? { hp: 0, soul: 0 };
  return { ...start, hp: start.hp + t.hp, maxHp: start.maxHp + t.hp, ki: start.ki + t.soul, maxKi: start.maxKi + t.soul };
};

/** Short player-facing description for the HUD / briefing. */
export const trialCard = (trial) => (trial ? { id: trial.id, tests: trial.tests, label: trial.label, short: trial.short, blurb: trial.blurb, hint: trial.hint } : null);

/** One place that wires a trial into the opponent's AI: used by the app and by every simulation. */
export function configureFoeAI(ai, cfg, foeId = 'player-2', humanId = 'player-1') {
  ai.aggression = cfg.aggression ?? 1;
  ai.setTrial?.(foeId, cfg.trial?.ai ?? null);
  // Adapting to the player: how much (cfg.adapt, 0 = not at all) and in which temperament's way. Both are optional, so simulations and tests are unchanged.
  ai.setHuman?.(humanId); ai.setTemperament?.(foeId, cfg.foe?.temperament); ai.setAdapt?.(cfg.adapt ?? 0);
  return ai;
}
