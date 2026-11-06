// Presentation vocabulary. The combat engine keeps its original identifiers and messages; everything the player can read
// goes through here. Two modes share the engine:
//   story  -> the resource is Soul, the action is Gather Soul, wild cards are the champion's Powers.
//   battle -> the same Soul vocabulary; wild cards are Monarque's Edicts. (No mode shows the old resource name.)
// Nothing here changes a rule, a cost or a cap.
import { EDICTS, WHIMS, OMENS, ENGINE_EFFECT } from '../data/monarque.generated.js';

let mode = 'battle';
export const setLexMode = (m) => { mode = m === 'story' ? 'story' : 'battle'; };
export const lexMode = () => mode;
export const isStory = () => mode === 'story';
/** The reserve's display name in the current mode. */
export const SOUL = () => 'Soul';
export const GATHER = () => 'Gather Soul';

// engine effect id -> display name (Edicts, Whims, Omens)
export const EFFECT_NAME = Object.fromEntries([...EDICTS, ...WHIMS, ...OMENS].map((c) => [ENGINE_EFFECT[c.effectId], c.title]));
export const EFFECT_NAME_PLAIN = EFFECT_NAME;

// Ordered rewrites for engine-originated strings (error messages, event log lines). Longest phrases first.
const ENGINE_TEXT = [
  [/The Game Master[’']s Boon/g, 'Monarque’s Boon'],
  [/The Game Master/g, 'Monarque'], [/Game Master/g, 'Monarque'],
  [/Shenron[’']s Wish/g, 'Monarque’s Boon'], [/Shenron wish/gi, 'boon'], [/Shenron/g, 'Monarque’s Boon'],
  [/Dragon Ball Draft/g, 'The Culling Draft'], [/Sacred Auction/g, 'The Silent Tithe'], [/King Kai[’']s Training/g, 'Rite of the Whetstone'],
  [/Bounty on the Champion/g, 'The Debt Called'], [/Zeno[’']s Side Quest/g, 'A Trial Is Set'], [/Hyperbolic Time Chamber/g, 'The Hollow Hour'],
  [/Divine Swap/g, 'Rite of Exchange'], [/Curse Injection/g, 'The Unraveling Laid Upon'],
  [/Senzu Bean/g, 'The Last Draught'], [/Final Atonement/g, 'The Reckoning'], [/The Other World/g, 'The Inverted Realm'],
  [/Tien[’']s Solar Flare/g, 'The Blinding Eclipse'], [/Scouter Lock-On/g, 'The Oracle’s Gaze'], [/Mafuba/g, 'The Binding Seal'],
  [/Domain Inversion/g, 'The Inverted Realm'], [/The Curse/g, 'The Unraveling'], [/\bCurse\b/g, 'Unraveling'],
  [/Crazy Rounds?/g, 'Omen'], [/Zenkai Rush/g, 'Desperate Surge'], [/Total Might/g, 'The Weighing'], [/Backwards Tournament/g, 'The Reversed Hour'],
  [/\bdecrees?\b/gi, (m) => (/^D/.test(m) ? 'Whim' : 'whim')],
  [/Wildcard Lockout/g, 'Edict Lockout'],
];
const SOUL_TEXT = [
  [/\bWEAK\b/g, 'ELUSIVE'], [/\bWeak\b/g, 'Elusive'],

  [/Charged:/g, 'Gathered:'], [/\bCHARGE KI\b/g, 'GATHER SOUL'], [/\bCHARGE \(/g, 'GATHER SOUL ('], [/Charge Ki/gi, 'Gather Soul'], [/\bcharged Ki\b/gi, 'gathered Soul'], [/\bcharges Ki\b/gi, 'gathers Soul'], [/\bKI\b/g, 'SOUL'], [/\bKi\b/g, 'Soul'],
];
const MODE_TEXT = {
  story: [...SOUL_TEXT, [/Wild ?[Cc]ards?/g, (m) => (/s$/.test(m) ? 'Powers' : 'Power')]],
  battle: [...SOUL_TEXT, [/Wild ?[Cc]ards?/g, (m) => (/s$/.test(m) ? 'Edicts' : 'Edict')]],
};

/** Rewrites engine / data copy for the current mode. Safe to call on any string; non-strings pass through. */
export function L(text) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  for (const [re, to] of ENGINE_TEXT) out = out.replace(re, to);
  for (const [re, to] of MODE_TEXT[mode]) out = out.replace(re, to);
  return out;
}

/** Display names for Monarque's temperaments and the four behavioural lenses. Never moral labels. */
export const TEMPERAMENTS = {
  SOVEREIGN: { id: 'SOVEREIGN', label: 'Sovereign', plural: 'Sovereigns', blurb: 'Proud, contemptuous, accustomed to obedience.' },
  DECEIVER: { id: 'DECEIVER', label: 'Deceiver', plural: 'Deceivers', blurb: 'Patient, unreadable, predatory through uncertainty.' },
  DEVOURER: { id: 'DEVOURER', label: 'Devourer', plural: 'Devourers', blurb: 'Hungry, reactive, drawn to weakness.' },
  ANCIENT: { id: 'ANCIENT', label: 'The Ancient and Patient', plural: 'The Ancient and Patient', blurb: 'Indifferent, inexhaustibly old, almost geological.' },
};
