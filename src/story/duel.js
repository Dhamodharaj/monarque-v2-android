// Builds a story duel on the REAL Battle engine: a 2-player match, same cards, same rules.
// The only differences: fighters carry their power cards as Powers, and Monarque may grant Edicts.
import { GameEngine } from '../game/GameEngine.js';
import { GM_POWERS, CRAZY_ROUNDS } from '../game/SpecialCards.js';
import { powerCard, gmWildHand, BERSERK_BOOST, BERSERK_SURGE } from './powers.js';
import { monarqueStart } from './progression.js';

export const GM_BOUTS = [
  { label: 'Bout I: Contact', wild: ['SENZU', 'FINAL_ATONEMENT', 'OTHER_WORLD', 'SOLAR_FLARE', 'SCOUTER', 'SHENRON_WISH'] },
  { label: 'Bout II: Pressure', wild: ['SENZU', 'FINAL_ATONEMENT', 'OTHER_WORLD', 'SOLAR_FLARE', 'SCOUTER'] },
  { label: 'Bout III: Fading', wild: ['SENZU', 'OTHER_WORLD', 'SOLAR_FLARE', 'SCOUTER'] },
];

/** Monarque's own deck for the final fight: his 23 cards (8 Edicts, 8 Whims, 7 Omens; the 4 that need a third fighter or a Curse are skipped in a duel); he holds 10 of them at random. Whims and Omens are
 *  played from his hand like Wildcards (before the round), so everything that happens in this fight is something he chose to play. */
export const MONARQUE_HAND_SIZE = 10;
const whimCard = (w) => ({ id: `gm-whim-${w.id}`, type: 'WILDCARD', category: 'WILDCARD', rarity: 'SPECIAL', series: 'STORY', form: 'Whim', power: null, rank: null, unique: false, character: w.name, title: w.name, description: '', effectId: w.effectId, monarqueKind: 'WHIM', image: w.image, story: null });
const omenCard = (o) => ({ id: `gm-omen-${o.id}`, type: 'WILDCARD', category: 'WILDCARD', rarity: 'SPECIAL', series: 'STORY', form: 'Omen', power: null, rank: null, unique: false, character: o.name, title: o.name, description: '', effectId: o.effectId, monarqueKind: 'OMEN', image: o.image, story: null });
// Cards that cannot work in a 1-vs-1 duel (they need a third fighter, or a Curse in play) are left out of the draw so he never holds a dead card.
const NEEDS_THREE = new Set(['CURSE', 'MAFUBA', 'BOUNTY_HUNT', 'CURSE_INJECTION']);
export function monarqueHand(random = Math.random, size = MONARQUE_HAND_SIZE) {
  const all = [...gmWildHand(), ...GM_POWERS.map(whimCard), ...CRAZY_ROUNDS.map(omenCard)].filter((c) => !NEEDS_THREE.has(c.effectId));
  for (let i = all.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all.slice(0, size);
}

/** cfg: { cards, human:{name,powers:[fighterId],step,boosted?:[fighterId],surged?:[fighterId] (power restores 40% max HP and Soul when played),gifts?}, foe:{name,powers:[fighterId],monarquePower?:effectId,step,boost?,start?:{hp,ki}} | {name,gmBout:0..2}, random }
 *  `boosted` / `boost` apply the berserk surge (+50% effect) to named powers / all of the foe's powers; `start` overrides opening HP / Soul and their caps ({hp, ki, maxHp, maxKi}); `human.start` does the same for the player. */
export function createStoryEngine(cards, cfg) {
  const { human, foe } = cfg;
  const powers = { 'player-1': [...human.powers.map((f) => powerCard(f, human.step, 'p1', (human.boosted ?? []).includes(f) ? BERSERK_BOOST : 1, (human.surged ?? []).includes(f) ? BERSERK_SURGE : 0)), ...gmWildHand().filter((c) => (human.gifts ?? []).includes(c.effectId)).map((c) => ({ ...c, id: `gift-${c.id}` }))] };
  const start = {};
  if (human.start) start['player-1'] = { ...human.start };
  if (foe.gmBout != null) {
    powers['player-2'] = monarqueHand(cfg.random ?? Math.random);
    start['player-2'] = foe.start ? { ...foe.start } : monarqueStart(foe.gmBout);
  } else {
    powers['player-2'] = [...foe.powers.map((f) => powerCard(f, foe.step, 'p2', foe.boost ?? 1)), ...(foe.monarquePower ? gmWildHand().filter((c) => c.effectId === foe.monarquePower).map((c) => ({ ...c, id: `berserk-${c.id}` })) : [])];
    if (foe.start) start['player-2'] = { ...foe.start };
  }
  const engine = new GameEngine(cards, { random: cfg.random, twist: cfg.twist ?? null, drama: Boolean(cfg.drama), story: { powers, start, pace: cfg.pace ?? 1, ...(foe.gmBout != null ? { gm: { from: 99999, every: 99999, max: 0 }, noEvents: true } : { gm: { from: 3, every: 3, max: 3 } }) } });
  engine.createMatch(2, [human.name, foe.name]);
  engine.startMatch();
  return engine;
}
