// The 32 contenders: captive mythological beings. Display data comes from the supplied contender_cards_32.json.
// A contender is a fighter, not a playable card: it has no Power/Rank/tier. Its combat identity is its signature power (powers.js) plus the bound-being deck it plays. No contender is a "hero" or a "villain": each carries a TEMPERAMENT (a behavioural lens).
import { CONTENDERS } from '../data/monarque.generated.js';
import { TEMPERAMENTS } from '../game/lexicon.js';

export const GROUPS = TEMPERAMENTS; // temperament registry (kept under the old export name for the screens that group the roster)
export const TEMPERAMENT_ORDER = ['SOVEREIGN', 'DECEIVER', 'DEVOURER', 'ANCIENT'];

export const ROSTER = CONTENDERS.map((c) => ({
  id: c.id, name: c.character, short: c.character, form: c.form, type: c.form, epithet: c.title, desc: c.description, personality: c.personality,
  temperament: c.temperament, category: c.category, rarity: c.rarity, image: c.image, powerImage: c.powerImage,
}));
export const FIGHTER_BY_ID = Object.fromEntries(ROSTER.map((f) => [f.id, f]));
// Cold, desaturated tones only: teal for most, dried-blood for the hungry ones. Never a bright hue.
const TONE = { SOVEREIGN: 186, DECEIVER: 170, DEVOURER: 354, ANCIENT: 178 };
export const hueOf = (f) => TONE[f?.temperament] ?? 180;
export const initialsOf = (name = '') => name.replace(/[^\p{L}\s/-]/gu, '').split(/[\s/-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
