// Executable, allow-listed special-card/event definitions, derived from the supplied Monarque data.
// `effectId` is the ENGINE id (unchanged from v12 so every handler and test still dispatches). The supplied id is kept as `monarqueEffectId`.
// Descriptions are display-only.
import { EDICTS, WHIMS, OMENS, ENGINE_EFFECT } from '../data/monarque.generated.js';

const engineId = (id) => { const e = ENGINE_EFFECT[id]; if (!e) throw new Error(`Unmapped Monarque effect: ${id}`); return e; };

export const WILDCARD_CARDS = Object.freeze(EDICTS.map((c) => Object.freeze({
  id: c.id, character: c.title, form: 'Edict', title: c.form, description: c.description, type: 'WILDCARD', category: 'WILDCARD',
  effectId: engineId(c.effectId), monarqueEffectId: c.effectId, power: null, rank: null, rarity: 'SPECIAL', image: c.image, unique: true,
})));
export const CRAZY_ROUNDS = Object.freeze(OMENS.map((c) => Object.freeze({
  id: c.id, name: c.title, duration: c.duration, effectId: engineId(c.effectId), monarqueEffectId: c.effectId, weight: c.weight, image: c.image,
})));
export const GM_POWERS = Object.freeze(WHIMS.map((c) => Object.freeze({
  id: c.id, name: c.title, effectId: engineId(c.effectId), monarqueEffectId: c.effectId, weight: c.weight, telegraph: c.telegraph, image: c.image,
})));
