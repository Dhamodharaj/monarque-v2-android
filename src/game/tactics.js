// Rival personalities: a rival's STANCE changes as the match unfolds, so it does not play the same way from the first round to the last.
// Each temperament has its own habit of shifting (a Sovereign reads you first and then executes; a Deceiver hides behind misdirection until it is
// cornered; a Devourer smells blood and goes berserk when hurt; an Ancient waits, then strikes). A stance only scales knobs the AI already has
// (aggression, Soul thrift, noise, call-switching/bluffing, Soul reserve), so it never changes a rule. Rivals announce a shift in their own words.
export const STANCES = Object.freeze({
  STEADY: Object.freeze({ aggr: 1, ki: 1, noise: 1, flip: 1, reserve: 0 }),
  PRESS: Object.freeze({ aggr: 1.25, ki: 0.8, noise: 0.8, flip: 0.8, reserve: -2 }),      // going for the kill
  GUARD: Object.freeze({ aggr: 0.8, ki: 1.3, noise: 0.9, flip: 1, reserve: 2 }),          // reading, conserving, waiting
  TRICKSTER: Object.freeze({ aggr: 1, ki: 1, noise: 1.2, flip: 2, reserve: 0 }),          // bluffs and switches calls far more
  FRENZY: Object.freeze({ aggr: 1.4, ki: 0.6, noise: 1.5, flip: 1, reserve: -4 }),        // cornered: all-in, and a little sloppy
});
export const STANCE_NAMES = Object.freeze(Object.keys(STANCES));

const LINES = {
  PRESS: ['Enough waiting. I end this now.', 'You are bleeding. I can smell it.', 'No more games. Hold on.'],
  GUARD: ['Show me what you have. I am patient.', 'I am watching your hands.', 'Take your time. It will not save you.'],
  TRICKSTER: ['Are you certain you know what I hold?', 'Watch the left hand. Or the right.', 'Guess again.'],
  FRENZY: ['I will not fall here! Not here!', 'Everything I have. Everything!', 'You hurt me. Now I show you why that was a mistake.'],
};

/** How a temperament chooses its stance this round. `x` = { r (round), m / f (my / foe HP fraction), win / lose (consecutive rounds I won / did not win) }. */
const RULES = {
  SOVEREIGN: ({ r, m, f, win }) => (r <= 3 ? 'GUARD' : f <= 0.5 || win >= 2 ? 'PRESS' : m + 0.25 < f ? 'GUARD' : 'STEADY'),
  DECEIVER: ({ r, lose, win }) => (lose >= 2 ? 'PRESS' : r <= 4 || win >= 1 ? 'TRICKSTER' : 'STEADY'),
  DEVOURER: ({ m, f }) => (m <= 0.35 ? 'FRENZY' : f <= 0.6 ? 'PRESS' : 'STEADY'),
  ANCIENT: ({ r, m, f }) => (r < 6 && f > 0.45 ? 'GUARD' : m > f + 0.3 ? 'GUARD' : 'PRESS'),
};

const scale = (stance, k) => Object.fromEntries(Object.entries(stance).map(([key, v]) => [key, key === 'reserve' ? Math.round(v * k) : 1 + (v - 1) * k]));

export class TacticsDirector {
  /** temperaments: { playerId: 'SOVEREIGN' | ... }. Only these seats get a stance. */
  constructor({ temperaments = {}, humanId = 'player-1', random = Math.random } = {}) {
    this.temperaments = temperaments; this.humanId = humanId; this.random = random; this.mem = new Map();
  }
  stanceOf(id) { return this.mem.get(id)?.stance ?? 'STEADY'; }
  /** Call before an AI seat acts. Re-reads the table once per round. Returns { stance, changed, line } when the stance was re-evaluated, else null.
   *  `intensity` scales how far a stance pushes the AI (difficulty): 1 = as written, 0 = no stances at all. */
  update(state, playerId, ai, { intensity = 1 } = {}) {
    const temper = this.temperaments[playerId]; const rule = RULES[temper];
    if (!rule || !state?.players || !ai?.setStance) return null;
    const me = state.players.find((p) => p.id === playerId); if (!me || me.hp <= 0) return null;
    let mem = this.mem.get(playerId); if (!mem) { mem = { stance: 'STEADY', since: -9, seen: 0, evaluated: -1, win: 0, lose: 0, spoke: -9 }; this.mem.set(playerId, mem); }
    const lr = state.lastRound; // fold each finished round into my streaks once
    if (lr && lr.round > mem.seen) { mem.seen = lr.round; const first = lr.placements?.[0]?.playerId === playerId; mem.win = first ? mem.win + 1 : 0; mem.lose = first ? 0 : mem.lose + 1; }
    const r = state.roundNumber ?? 0; if (r === mem.evaluated) return null; mem.evaluated = r;
    const foe = state.players.find((p) => p.id === this.humanId && p.hp > 0) ?? state.players.filter((p) => p.id !== playerId && p.hp > 0).sort((a, b) => b.hp - a.hp)[0];
    if (!foe) return null;
    const frac = (p) => p.hp / Math.max(1, p.maxHp ?? 100);
    let next = rule({ r, m: frac(me), f: frac(foe), win: mem.win, lose: mem.lose });
    if (next !== mem.stance && r - mem.since < 2 && next !== 'FRENZY') next = mem.stance; // hold a stance for two rounds so it reads as intent, not noise
    const changed = next !== mem.stance;
    if (changed) { mem.stance = next; mem.since = r; }
    ai.setStance(playerId, intensity === 1 ? STANCES[next] : scale(STANCES[next], intensity));
    let line = null;
    if (changed && next !== 'STEADY' && r - mem.spoke >= 3 && this.random() < 0.75) { mem.spoke = r; const bank = LINES[next]; line = { playerId, mood: next === 'FRENZY' ? 'angry' : next === 'PRESS' ? 'angry' : 'confident', text: bank[Math.floor(this.random() * bank.length)], id: `stance-${next}-${r}-${Math.random().toString(36).slice(2, 6)}` }; }
    return { stance: next, changed, line };
  }
}
