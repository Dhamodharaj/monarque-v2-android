// Emotes: one small, fixed vocabulary shared by the player and every rival, chosen to fit a dark myth of bound beings.
// Each contender expresses itself through a STYLE read from its own card (`personality`, falling back to its temperament):
//   feral  - hungry, savage: emoji on nearly every line, doubled when the feeling is intense
//   sly    - jovial, cunning, watchful: knowing little faces and eyes
//   regal  - proud, exacting, grave: crowns and blades, used sparingly
//   still  - silent, cold, unhurried: rarely emotes at all, and then only with an eye or a skull
import { FIGHTER_BY_ID } from './roster.js';

export const E = {
  kiss: '😘', disdain: '😒', confused: '😕', refuse: '🙂‍↔️', rage: '🤬', dread: '😨', thumbsdown: '👎', insult: '🖕', frustrated: '🙎‍♂️',
  shock: '💥', crown: '👑', mock: '🤣', skull: '☠️', warn: '❗', question: '❓', blade: '⚔️', blood: '🩸',
};
/** The fixed palette, in tray order: the player's and every rival's. */
export const EMOTES = [
  { e: E.kiss, label: 'Mock affection · taunt' }, { e: E.disdain, label: 'Disdain · contempt' }, { e: E.confused, label: 'Confusion' },
  { e: E.refuse, label: 'Refusal · disagreement' }, { e: E.rage, label: 'Extreme anger' }, { e: E.dread, label: 'Fear · dread' },
  { e: E.thumbsdown, label: 'Disapproval' }, { e: E.insult, label: 'Insult · absolute disrespect' }, { e: E.frustrated, label: 'Frustration · displeasure' },
  { e: E.shock, label: 'Shock' }, { e: E.crown, label: 'Superiority · dominance' }, { e: E.mock, label: 'Mockery · ridicule' },
  { e: E.skull, label: 'Death threat · lethal intent' }, { e: E.warn, label: 'Warning' }, { e: E.question, label: 'Question · disbelief' },
  { e: E.blade, label: 'Challenge · ready to fight' }, { e: E.blood, label: 'Blood' },
];

// What each mood can look like, before the contender's style narrows it.
const POOL = {
  confident: [E.blade, E.crown, E.warn], joy: [E.mock, E.kiss, E.crown], smug: [E.kiss, E.disdain, E.mock, E.thumbsdown, E.crown, E.skull],
  frustrated: [E.frustrated, E.refuse, E.rage, E.blood], angry: [E.rage, E.warn, E.blade, E.insult], shock: [E.shock, E.question, E.dread],
  worried: [E.confused, E.dread, E.question], fear: [E.dread, E.shock], desperate: [E.dread, E.rage, E.blood], defeated: [E.skull, E.blood, E.refuse], awed: [E.shock, E.question],
};
const INTENSE = new Set(['angry', 'desperate', 'joy', 'frustrated']);
const STYLES = {
  feral: { chance: 0.97, reply: 0.8, double: true, prefer: [E.rage, E.insult, E.skull, E.blood, E.shock, E.warn, E.blade, E.mock] },
  sly: { chance: 0.92, reply: 0.85, double: false, prefer: [E.kiss, E.mock, E.disdain, E.confused, E.question] },
  regal: { chance: 0.8, reply: 0.65, double: false, prefer: [E.crown, E.disdain, E.blade, E.thumbsdown, E.warn, E.skull] },
  still: { chance: 0.62, reply: 0.45, double: false, prefer: [E.disdain, E.skull, E.question, E.refuse] },
};
const WORDS = {
  feral: ['ravenous', 'wild', 'devouring', 'uncontained', 'brutal', 'feral', 'bloody', 'savage', 'raging', 'punishing', 'cruel', 'gluttonous', 'tireless', 'terrible', 'incandescent', 'defiant', 'hungry'],
  sly: ['jovial', 'lewd', 'genial', 'seductive', 'cunning', 'grotesque', 'paradoxical', 'watchful', 'secretive', 'liminal', 'feasting'],
  regal: ['proud', 'austere', 'exacting', 'immaculate', 'grave', 'just', 'restored', 'ordered', 'courteous', 'unyielding', 'brilliant'],
  still: ['silent', 'quiet', 'cold', 'gentle', 'unhurried', 'indifferent', 'hollow', 'impartial', 'vast', 'grieving'],
};
const BY_TEMPERAMENT = { SOVEREIGN: 'regal', DECEIVER: 'sly', DEVOURER: 'feral', ANCIENT: 'still' };

/** `who` = { fighterId?, temperament?, isGm? }. Monarque speaks as a regal being. */
export function styleOf(who = {}) {
  if (who.isGm || who.fighterId === 'monarque') return 'regal';
  const f = FIGHTER_BY_ID[who.fighterId]; const text = String(f?.personality ?? '').toLowerCase();
  const fallback = BY_TEMPERAMENT[who.temperament ?? f?.temperament] ?? 'regal';
  const score = Object.fromEntries(Object.entries(WORDS).map(([k, ws]) => [k, ws.filter((w) => text.includes(w)).length]));
  const best = Math.max(...Object.values(score)); if (best === 0) return fallback;
  const top = Object.keys(score).filter((k) => score[k] === best); return top.includes(fallback) ? fallback : top[0];
}

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
const narrow = (list, style) => { const pref = list.filter((e) => STYLES[style].prefer.includes(e)); return pref.length ? pref : list; };
const flavour = (e, style, mood, rand) => (STYLES[style].double && INTENSE.has(mood) && rand() < 0.6 ? e + e : e);

/** The emoji this being attaches to a line of `mood`, or '' (a still being often says nothing extra). */
export function emojiFor(who, mood, rand = Math.random, force = false) {
  const style = styleOf(who); if (!force && rand() > STYLES[style].chance) return '';
  return flavour(pick(narrow(POOL[mood] ?? POOL.confident, style), rand), style, mood, rand);
}
