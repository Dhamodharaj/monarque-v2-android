// Difficulty for Battle and Story. EASY is the original game nudged up slightly (it is also what saves from before the selector load as);
// the raw engine defaults used by simulations and tests are unchanged. All levels only sharpen the opponent's decision-making and (in Story) its starting strength.
// They never change rules, costs or caps.
//   fuzz       how blurry the AI's read of a hidden played card is (lower = sees more clearly)
//   adaptMul   multiplies how much the AI learns your habits (result is capped at 1)
//   aggrAdd    added to how hard the AI leads with its strongest cards
//   noiseMul   multiplies how often the AI plays a slightly worse card on purpose (lower = steadier)
//   mistakeMul multiplies Story's early-round blunder chance (0 = never blunders)
//   foeHpMul / foeKiMul   Story opponent's starting HP / Soul (and their caps)
//   eagerMul   how readily a Story opponent reaches for its powers
//   coinMul    multiplies coins won from Battle matches and Story first clears (harder = richer)
//   tactics    how far a rival's mid-match stance shifts push its play (1 = as written)
//   rivalHp / rivalKi   Battle only: bonus starting HP / Soul (and caps) for every AI rival
export const DIFFICULTIES = Object.freeze({
  // Not selectable: the authored baseline with every multiplier neutral. Used by tests and balance simulations that assert the raw progression numbers.
  baseline: Object.freeze({ id: 'baseline', label: 'Baseline', blurb: '', fuzz: 0.6, adaptMul: 1, aggrAdd: 0, noiseMul: 1, mistakeMul: 1, foeHpMul: 1, foeKiMul: 1, eagerMul: 1, rivalHp: 0, rivalKi: 0, tactics: 1, coinMul: 1 }),
  easy: Object.freeze({ id: 'easy', label: 'Easy', blurb: 'A fair fight. Rivals still misread hidden cards and slip now and then, but start a little stronger than before.', fuzz: 0.5, adaptMul: 1.15, aggrAdd: 0.05, noiseMul: 0.85, mistakeMul: 0.8, foeHpMul: 1.08, foeKiMul: 1.05, eagerMul: 1.05, rivalHp: 5, rivalKi: 1, tactics: 0.8, coinMul: 1 }),
  normal: Object.freeze({ id: 'normal', label: 'Normal', blurb: 'Sharper reads, rare slips, and rivals that start stronger and learn your habits.', fuzz: 0.25, adaptMul: 1.6, aggrAdd: 0.2, noiseMul: 0.5, mistakeMul: 0.3, foeHpMul: 1.25, foeKiMul: 1.2, eagerMul: 1.15, rivalHp: 10, rivalKi: 2, tactics: 1, coinMul: 1.5 }),
  hard: Object.freeze({ id: 'hard', label: 'Hard', blurb: 'Exact reads, almost no slips, relentless pressure. Opponents start with far more HP and Soul.', fuzz: 0, adaptMul: 2.2, aggrAdd: 0.45, noiseMul: 0.15, mistakeMul: 0, foeHpMul: 1.5, foeKiMul: 1.4, eagerMul: 1.4, rivalHp: 30, rivalKi: 4, tactics: 1.3, coinMul: 2 }),
});
export const DIFFICULTY_ORDER = Object.freeze(['easy', 'normal', 'hard']);
export const DEFAULT_DIFFICULTY = 'easy';

export const normalizeDifficulty = (id) => (typeof id === 'string' && Object.hasOwn(DIFFICULTIES, id) ? id : DEFAULT_DIFFICULTY);
export const difficultyOf = (id) => DIFFICULTIES[normalizeDifficulty(id)];

const KEY = 'monarque.difficulty.v1';
const ls = () => { try { return window.localStorage; } catch { return null; } };
/** Remembers the last pick per mode ('battle' | 'story') so the selector opens where the player left it. */
export function loadDifficulty(mode) {
  try { return normalizeDifficulty(JSON.parse(ls()?.getItem(KEY) ?? '{}')?.[mode]); } catch { return DEFAULT_DIFFICULTY; }
}
export function saveDifficulty(mode, id) {
  const value = normalizeDifficulty(id);
  try { const all = JSON.parse(ls()?.getItem(KEY) ?? '{}') || {}; ls()?.setItem(KEY, JSON.stringify({ ...all, [mode]: value })); } catch { /* not persisted */ }
  return value;
}

/** Applies a difficulty to an AIEngine's perception and steadiness. EASY leaves the engine exactly as it was. */
export function applyDifficultyToAI(ai, id) {
  const d = difficultyOf(id);
  ai.fuzz = d.fuzz; ai.noiseMul = d.noiseMul;
  return ai;
}
export const scaleAdapt = (adapt, id) => Math.min(1, Math.round(adapt * difficultyOf(id).adaptMul * 100) / 100);

/** Battle: gives every AI rival the difficulty's starting HP / Soul bonus (caps rise with it, so healing can reach it).  */
export function applyRivalBonus(engine, id) {
  const d = difficultyOf(id);
  if (!d.rivalHp && !d.rivalKi) return;
  for (const p of engine.state.players) {
    if (p.type !== 'AI') continue;
    p.maxHp = (p.maxHp ?? p.hp) + d.rivalHp; p.hp += d.rivalHp;
    p.maxKi = (p.maxKi ?? 20) + d.rivalKi; p.ki += d.rivalKi;
  }
}
