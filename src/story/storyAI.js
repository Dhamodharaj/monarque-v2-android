// Gives story opponents sensible use of their powers on top of the Battle AI's own Edict logic.
// The Battle AI already handles the engine families by effect id; this adds the TEMPERAMENT that decides how and when a
// contender (or Monarque) reaches for a power. Temperament changes real decisions, never rules, costs or caps.
//   SOVEREIGN : controlled. Spends only for a clear gain, never gambles its own HP unless the kill is certain.
//   DECEIVER  : patient and noisy. Opens with blinding/sealing/foresight, and bluffs by delaying.
//   DEVOURER  : reactive. Presses hard when the foe is hurt, burns everything when it is dying.
//   ANCIENT   : conserves. Fires rarely, only high-value powers, and tends to wait out the early rounds.
import { GROUPS } from './roster.js';

export const PERSONA = {
  SOVEREIGN: { eager: 0.8, label: 'Controlled: spends only for a clear gain' },
  DECEIVER: { eager: 0.9, label: 'Patient: blinds, seals and bluffs before it strikes' },
  DEVOURER: { eager: 1.0, label: 'Hungry: presses hard when the foe is hurt' },
  ANCIENT: { eager: 0.6, label: 'Indifferent: conserves, fires only high-value powers' },
};
// Old group keys still used by the balance sims map onto a temperament so they keep running.
const LEGACY = { HEROES: 'SOVEREIGN', VILLAINS: 'DECEIVER', ANTIHEROES: 'DEVOURER', MONSTERS: 'DEVOURER' };
export const temperamentOf = (key) => (PERSONA[key] ? key : LEGACY[key] ?? 'SOVEREIGN');

/** `style` comes from a trial (trials.js): { hold:{round,heroHpFrac,foeHpFrac}, burst, eagerMul, reckless }. */
/** `read` (optional) returns what the AI has learned about the human's habits (AIEngine.humanRead), already scaled by difficulty. */
export function makePowerPicker(engine, temperamentKey, rand = Math.random, style = null, read = null) {
  const temperament = temperamentOf(temperamentKey);
  const eager = PERSONA[temperament].eager * (style?.eagerMul ?? 1);
  const pick = (me, st) => {
    if (!me || st.phase === 'MATCH_COMPLETE' || st.wildcardUsedThisRound?.includes(me.id)) return null;
    const foes = st.players.filter((p) => p.id !== me.id && p.hp > 0);
    const foe = foes[0];
    if (!foe) return null;
    const usable = engine.getWildcardCards(me.id).filter((c) => c.usable && c.story);
    if (!usable.length) return null;
    const rd = read ? read(me.id) : null;
    const plays = (st.currentTrick?.plays ?? []).filter((pl) => !pl.card.isPass && pl.playerId !== me.id);
    const calling = st.phase === 'CALLING_STAT';
    const late = st.roundNumber >= 9 ? 0.15 : 0;
    const inverted = (st.domainInversionRounds ?? 0) > 0; // lower stat wins this round: Absolute Measure would hurt, not help
    const lowHp = me.hp <= 50;
    // Blood in the water: the opponent presses when you are hurt, and burns everything when it is dying.
    const scent = foe.hp <= 40 ? (temperament === 'DEVOURER' ? 1.6 : 1.3) : foe.hp <= 60 ? (temperament === 'DEVOURER' ? 1.3 : 1.12) : 1;
    const cornered = me.hp <= 28 ? (temperament === 'SOVEREIGN' ? 1.15 : 1.35) : 1;
    const early = st.roundNumber <= 2;
    // Timing: a patient fighter keeps its powers until the duel turns (a late round, you hurt, or itself in danger), then fires every round.
    const H = style?.hold; const frac = (p) => p.hp / (p.maxHp ?? 100);
    const open = !H || st.roundNumber >= H.round || frac(foe) <= H.heroHpFrac || frac(me) <= H.foeHpFrac;
    if (!open && me.hp > 28) return null;
    const scored = usable.map((c) => {
      const R = c.story.rider ?? {};
      let s = 0;
      switch (c.effectId) {
        case 'SENZU': s = (me.hp <= 65 ? 0.7 : 0.05) + (me.ki <= 4 ? 0.25 : 0) + (R.cdClear && Object.keys(me.lockedUntilTurn ?? {}).length >= 3 ? 0.3 : 0) + (R.gamble ? 0.2 : 0); break;
        case 'FINAL_ATONEMENT': s = foe.hp <= (R.others ?? 17) + 4 && me.hp > (R.self ?? 15) + 8 ? 0.9 : (foe.hp - me.hp >= 25 ? 0.05 : 0); if (R.nextPower && me.hp > 45) s += 0.15; break;
        case 'OTHER_WORLD': s = calling ? 0.18 + (lowHp ? 0.15 : 0) : 0; break;
        case 'SOLAR_FLARE': s = calling ? 0.4 + (R.oppKi ? 0.1 : 0) : 0; if (R.oppDmg && foe.hp <= 30) s += 0.4; break;
        case 'SCOUTER': s = 0.28 + (R.nextPower || R.nextRank ? 0.25 : 0); break;
        case 'SHENRON_WISH':
          if (c.story.wish === 'IMMORTALITY') s = me.hp <= 45 ? 0.85 : 0.08;
          // Absolute Measure boosts ONE stat (fixed by the power). It does nothing unless this round is called on that stat, so wait for it.
          else if (c.story.wish === 'ABSOLUTE_POWER') s = !inverted && st.phase === 'PLAYING_CARD' && st.currentCall === (c.story.stat ?? 'POWER') ? 0.6 : 0;
          else s = st.phase === 'PLAYING_CARD' ? 0.45 : 0;
          break;
        case 'MAFUBA': s = st.phase === 'PLAYING_CARD' && plays.length ? 0.5 : 0; break;
        default: s = 0;
      }
      if (c.story.kiCost > me.ki - 2) s *= 0.4;
      if (temperament === 'DECEIVER' && ['SOLAR_FLARE', 'MAFUBA', 'SCOUTER'].includes(c.effectId)) s *= early ? 1.5 : 1.2;
      if (!style?.reckless && temperament === 'SOVEREIGN' && c.effectId === 'FINAL_ATONEMENT' && !(foe.hp <= (R.others ?? 17) + 4)) s = 0; // never gambles own HP without the kill
      if (temperament === 'ANCIENT') s = early ? 0 : s >= 0.5 ? s * 1.1 : s * 0.4;
      if (temperament === 'DEVOURER' && c.effectId === 'SENZU' && me.hp > 50) s *= 0.5;
      if (['FINAL_ATONEMENT', 'SOLAR_FLARE', 'MAFUBA'].includes(c.effectId)) s *= scent; // offensive powers: go for the kill
      if (rd && rd.k > 0) { // what it has learned about you (small, capped nudges)
        const offensive = ['FINAL_ATONEMENT', 'SOLAR_FLARE', 'MAFUBA'].includes(c.effectId);
        if (temperament === 'DECEIVER' && c.effectId === 'SOLAR_FLARE' && (rd.repeats || rd.powerRate >= 0.34)) s *= 1 + 0.3 * rd.k;        // you lean on powers: shut them off
        if (temperament === 'DEVOURER' && offensive) s *= 1 + 0.25 * rd.k * rd.strain;                                                       // you look strained: feed
        if (temperament === 'ANCIENT' && !early && (rd.uses >= 1 || rd.strain >= 0.5)) s *= 1 + 0.3 * rd.k;                                  // you have spent yourself: the moment it waited for
      }
      return { c, s: (s + late) * cornered };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    const top = scored[0];
    if (!top || rand() > Math.min(0.97, top.s * (0.6 + eager) * (open && H ? (style.burst ?? 1) : style?.reckless ? (style.burst ?? 1) : 1))) return null;
    const options = {};
    if (top.c.effectId === 'SCOUTER') options.targetId = foe.id;
    if (top.c.effectId === 'MAFUBA') options.targetCardId = plays[0]?.card.id;
    if (top.c.effectId === 'SHENRON_WISH') { options.wish = top.c.story.wish; options.stat = top.c.story.stat ?? 'POWER'; }
    return { cardId: top.c.id, options };
  };
  // As round leader, call the stat a held Absolute Measure boosts, so the power can land this round.
  pick.pickCall = (me, st) => {
    if (!me || st.phase !== 'CALLING_STAT' || st.wildcardUsedThisRound?.includes(me.id) || (st.domainInversionRounds ?? 0) > 0) return null; // never under inversion
    const w = me.hand.find((c) => c.story?.wish === 'ABSOLUTE_POWER' && c.story.kiCost <= me.ki - 2 && me.hp > (c.story.rider?.selfDmg ?? 0) + 25);
    return w && rand() < 0.8 * eager ? (w.story.stat ?? 'POWER') : null;
  };
  return pick;
}
export const groupOf = (fighter) => fighter?.temperament ?? 'SOVEREIGN';
void GROUPS;
