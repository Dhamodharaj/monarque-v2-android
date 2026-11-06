import { ROSTER } from '../story/roster.js';
const BY_NAME = Object.fromEntries(ROSTER.flatMap((f) => [[f.name.toLowerCase(), f], [f.short.toLowerCase(), f]]));
/** Contender portrait for a player name (Battle seats use contender names), or null. */
export const portraitFor = (name) => { if (String(name ?? '').toLowerCase() === 'monarque') return '/ui/monarque.webp'; const f = BY_NAME[String(name ?? '').toLowerCase()]; return f ? `/story/fighters/${f.id}.webp` : null; };
/** The contender record for a seat name (Battle seats are named after contenders), or null. */
export const fighterByName = (name) => BY_NAME[String(name ?? '').toLowerCase()] ?? null;
