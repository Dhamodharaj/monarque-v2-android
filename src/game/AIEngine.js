import { CALLS, TOTAL, compareCards } from './Rules.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { getCardCost } from './CardTiers.js';

const HUMAN_MEMORY_CARD_LIMIT = 6;
const HUMAN_MEMORY_CALL_LIMIT = 4;

// ---- Player adaptation (opt-in, see setAdapt). The AI keeps a short, recency-weighted picture of the HUMAN seat from public
// information only: which stat they call when they lead, how strong the cards they play are on each stat, how often they use
// powers, and whether they look strained (low HP, few cards, expensive plays). Every effect below is a small nudge on a
// decision the AI already makes; none of it touches a rule, a cost or a cap, and it fades as the player changes their habits.
const ADAPT_WINDOW = 8;
//   read    how well it turns the player's call habit into a guess at their hidden call
//   exploit how hard it leans on the stat the player has been weaker at
//   steady  how much calmer (less random) it plays once it has a read
//   press   how much it presses when the player looks strained
//   thrift  >0 hoards Soul and waits until the player is strained; <0 spends more freely
const ADAPT_TRAITS = {
  SOVEREIGN: { read: 1.0, exploit: 0.5, steady: 0.5, press: 0.3, thrift: 0 },
  DECEIVER: { read: 0.8, exploit: 1.2, steady: 0, press: 0.4, thrift: 0 },
  DEVOURER: { read: 0.5, exploit: 0.8, steady: 0, press: 1.0, thrift: -0.5 },
  ANCIENT: { read: 0.7, exploit: 0.4, steady: 0.3, press: 0.5, thrift: 1.0 },
};
const NEUTRAL_TRAITS = { read: 0.6, exploit: 0.6, steady: 0, press: 0.4, thrift: 0 };
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Strategic AI.
 *
 * The AI only uses information a player could know:
 * - its own hand
 * - the current public trick
 * - a small, recent memory of cards thrown at the table
 * - public player/card counts
 * - its own coins/draw usage
 *
 * It never inspects another player's hand or the reserve contents.
 */
export class AIEngine {
  constructor(cards = [], random = Math.random) {
    if (typeof cards === 'function') { random = cards; cards = []; }
    // The AI knows the public card definitions, but not hidden hands/reserve.
    // Global stat percentiles keep POWER and RANK comparable instead of letting
    // the much larger-looking POWER numbers dominate its decisions.
    this.cards = Array.isArray(cards) && cards.length ? cards.filter(card => !card.type || card.type === 'CHARACTER') : [];
    this.random = random;
    this.seenStates = new Map();
    this.salt = Math.floor(random() * 1e9); this.byId = new Map(); this._memo = null; this._decoy = null; this.fuzz = 0; this.noiseMul = 1; // noiseMul (difficulty): scales how often it plays a deliberately worse card; fuzz (the game sets 1; simulations keep exact reads): how blurry its read of a hidden played card is (0 = exact)
    this._inv = false; // Domain Inversion / Backwards Tournament active for the decision being made
    this.callHistory = new Map();
    this.lastCall = new Map();    // playerId -> the stat that seat called last (story trials: habits and reversals)
    this.publicMemory = new Map();
    this.W = { lead: 0.9, resp: 0.8, call: 0.35, cheap: 0.03, hp: 0.5, kiv: 0.5 };
    this.skill = 1;               // 0 = the original heuristics only (kept for A/B simulations)
    this.personas = new Map();    // playerId -> temperament lens
    this.stances = new Map();     // playerId -> current stance multipliers (rival personalities, tactics.js)
    this.playedIds = new Map();   // matchId -> every card id seen on the table (public information)
    this.adapt = 0;               // 0 = does not model the human seat at all (default; simulations and tests). setAdapt(0..1) turns it on
    this.humanIds = new Set();    // seats treated as the human (falls back to Player.type === 'HUMAN' in the view)
    this.temper = new Map();      // playerId -> temperament name, only used to flavour adaptation
    this.humans = new Map();      // matchId -> Map(playerId -> habit model)
    this._last = null; this._readCache = undefined;
    this.powerMin = this.cards.length ? Math.min(...this.cards.map((card) => card.power)) : 0;
    this.powerMax = this.cards.length ? Math.max(...this.cards.map((card) => card.power)) : 1000;
    this.rankMax = this.cards.length ? Math.max(...this.cards.map((card) => card.rank)) : GAME_CONFIG.rankMax;
    for (const card of this.cards) this.byId.set(card.id, card);
  }

  reset() {
    this.seenStates.clear();
    this.callHistory.clear();
    this.lastCall.clear();
    this.publicMemory.clear();
    this.playedIds.clear();
    this.humans.clear();
    this._last = null; this._readCache = undefined; this._memo = null; this._decoy = null;
  }

  /** A fighter plays like the being it is: temperament leans aggression, Soul thrift, unpredictability and call-switching. */
  setPersona(playerId, temperament) {
    const T = { SOVEREIGN: { aggr: 1.1, ki: 1, noise: 0.08, flip: 0.05 }, DECEIVER: { aggr: 1.0, ki: 1, noise: 0.2, flip: 0.2 }, DEVOURER: { aggr: 1.25, ki: 0.6, noise: 0.1, flip: 0.05 }, ANCIENT: { aggr: 0.92, ki: 1.3, noise: 0.06, flip: 0.04 } };
    this.personas.set(playerId, T[temperament] ?? null);
    this.temper.set(playerId, temperament ?? null);
  }

  // ------------------------------------------------------------------ adapting to the human seat
  /** 0..1: how much this AI adapts to the player. 0 turns it off. Callers scale it by difficulty (story round, retries). */
  setAdapt(level) { this.adapt = Math.max(0, Math.min(1, Number(level) || 0)); this._readCache = undefined; }
  setHuman(playerId) { if (playerId) this.humanIds.add(playerId); }
  /** Tell the AI which temperament a seat has, for adaptation only (setPersona does this too; story foes use this alone so their tuned numbers stay put). */
  setTemperament(playerId, name) { if (playerId) this.temper.set(playerId, name ?? null); }
  #traits(id) { return ADAPT_TRAITS[this.temper.get(id)] ?? NEUTRAL_TRAITS; }
  /** This seat's effective adaptation. Each seat pays a little more or less attention (0.85..1.15) so no two opponents adapt identically. */
  #adaptK(id) {
    if (!this.adapt || id == null) return 0;
    let h = 0; const key = `${id}|${this.temper.get(id) ?? ''}`;
    for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return this.adapt * (0.85 + (h % 31) / 100);
  }
  #humanIds(state) {
    if (this.humanIds.size) return [...this.humanIds];
    return (state?.players ?? []).filter((p) => p.type === 'HUMAN').map((p) => p.id);
  }
  #modelFor(state, pid) {
    const matchId = state?.matchId ?? 'default';
    let all = this.humans.get(matchId); if (!all) { all = new Map(); this.humans.set(matchId, all); }
    let m = all.get(pid);
    if (!m) { m = { calls: [], plays: [], uses: [], effects: {}, spend: [], bluffs: [], leaderOf: new Map(), lastRound: -1, lastSeq: 0 }; all.set(pid, m); }
    return m;
  }
  /** Learn from the public table: who led and what they called (revealed when the round ends), the card they played, and any power they used. */
  #learn(state) {
    if (!this.adapt || !state) return;
    for (const id of this.#humanIds(state)) {
      const m = this.#modelFor(state, id);
      if (state.currentTrick?.leaderId && state.roundNumber != null) m.leaderOf.set(state.roundNumber, state.currentTrick.leaderId);
      const lr = state.lastRound;
      if (lr && lr.round > m.lastRound) {
        m.lastRound = lr.round;
        if (!lr.cancelled && (lr.call === CALLS.POWER || lr.call === CALLS.RANK)) {
          if (m.leaderOf.get(lr.round) === id) m.calls = [...m.calls, lr.call].slice(-ADAPT_WINDOW);
          const mine = (lr.placements ?? []).find((pl) => pl.playerId === id && pl.card && !pl.card.isPass);
          if (mine && !lr.inverted) {
            const full = mine.card.power != null ? mine.card : this.#known(mine.card);
            m.plays = [...m.plays, { call: lr.call, str: this.#rawStrength(full, lr.call) }].slice(-ADAPT_WINDOW);
            m.spend = [...m.spend, this.#invokeCost(this.#known(mine.card), mine.card)].slice(-4);
            // Did the card they led with point at the stat they actually called? A leader whose card says one thing and whose call says the other is bluffing.
            if (m.leaderOf.get(lr.round) === id) {
              const ps = this.#rawStrength(full, CALLS.POWER), rs = this.#rawStrength(full, CALLS.RANK);
              if (Math.abs(ps - rs) > 0.12) m.bluffs = [...m.bluffs, (ps >= rs ? CALLS.POWER : CALLS.RANK) !== lr.call ? 1 : 0].slice(-8);
            }
          }
        }
        for (const k of [...m.leaderOf.keys()]) if (k < lr.round - 2) m.leaderOf.delete(k);
      }
      for (const ev of state.eventLog ?? []) {
        if (ev.seq <= m.lastSeq) continue;
        m.lastSeq = ev.seq;
        if (ev.type === 'WILDCARD_USED' && ev.playerId === id) { m.uses.push(ev.round ?? state.roundNumber ?? 0); m.effects[ev.effectId] = (m.effects[ev.effectId] ?? 0) + 1; }
      }
    }
  }
  /** -1..1 (POWER positive): the player's recent call habit, newer calls weigh more; needs three calls before it says anything. */
  #callLean(m) {
    const n = m.calls.length; if (n < 3) return 0;
    let num = 0, den = 0;
    m.calls.forEach((c, i) => { const w = 0.9 ** (n - 1 - i); num += w * (c === CALLS.POWER ? 1 : -1); den += w; });
    return (num / den) * clamp01((n - 2) / 4);
  }
  /** The stat the player's played cards have been weaker on (needs two samples of each), with a 0..1 size. */
  #weakStat(m) {
    const avg = (call) => { const xs = m.plays.filter((p) => p.call === call).map((p) => p.str); return xs.length >= 2 ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
    const p = avg(CALLS.POWER), r = avg(CALLS.RANK); if (p == null || r == null) return null;
    const d = r - p; if (Math.abs(d) < 0.1) return null;
    return { stat: d > 0 ? CALLS.POWER : CALLS.RANK, mag: clamp01((Math.abs(d) - 0.1) / 0.3) };
  }
  /** 0..1: does the player look short of resources? HP, cards left and how pricey their recent plays were (their Soul itself is hidden). */
  #strain(m, pl) {
    if (!pl) return 0;
    const hp = clamp01((0.6 - pl.hp / (pl.maxHp ?? 100)) / 0.4) * 0.5;
    const hand = (pl.hand?.length ?? 99) <= 4 ? 0.2 : 0;
    const avg = m.spend.length ? m.spend.reduce((a, b) => a + b, 0) / m.spend.length : 0;
    return clamp01(hp + hand + clamp01((avg - 2) / 2) * 0.3);
  }
  /** What the AI currently believes about the human seat, or null when adaptation is off. `k` is the strength for `forId`. */
  humanRead(forId = null) {
    const state = this._last; if (!this.adapt || !state) return null;
    if (this._readCache === undefined) {
      const id = this.#humanIds(state)[0]; if (!id) { this._readCache = null; return null; }
      const m = this.#modelFor(state, id);
      const round = Math.max(1, state.roundNumber ?? 1);
      this._readCache = {
        id, lean: this.#callLean(m), weak: this.#weakStat(m), strain: this.#strain(m, state.players.find((p) => p.id === id)),
        bluff: m.bluffs.length ? (m.bluffs.reduce((a, b) => a + b, 0) + 0.4) / (m.bluffs.length + 1.6) : null, bluffN: m.bluffs.length,
        uses: m.uses.length, powerRate: m.uses.filter((r) => r > round - 6).length / Math.min(6, round), repeats: Math.max(0, ...Object.values(m.effects)) >= 2,
      };
    }
    return this._readCache ? { ...this._readCache, k: forId ? this.#adaptK(forId) : this.adapt } : null;
  }
  /** Softer randomness for seats that value consistency, once they have something to be consistent about. */
  #calm(id) { const k = this.#adaptK(id); return k ? 1 - clamp01(this.#traits(id).steady * k) : 1; }
  /** Story trials: layer an encounter's tendencies over a seat's persona. `t` may set aggr / ki / noise / flip (as the persona does), reserve (Soul it tries to keep: higher = hoards, lower = spends itself dry) and
   *  stick (chance to repeat the previous call), bluff (chance to call the other stat), shift {at, p} (from round `at`, alternate the call). null clears it. */
  setTrial(playerId, t) {
    const base = { ...(this.personas.get(playerId) ?? { aggr: 1, ki: 1, noise: 0.1, flip: 0.18 }) }; delete base.trial;
    this.personas.set(playerId, t ? { ...base, ...t, trial: t } : base);
  }
  #trialCall(id, state, chosen, tr) {
    const last = this.lastCall.get(id); const round = state?.roundNumber ?? 0; let out = chosen;
    if (tr.shift && round >= tr.shift.at) { if (last && this.random() < tr.shift.p) out = last === CALLS.POWER ? CALLS.RANK : CALLS.POWER; }
    else if (tr.stick && last && this.random() < tr.stick) out = last;
    else if (tr.bluff && this.random() < tr.bluff) out = chosen === CALLS.POWER ? CALLS.RANK : CALLS.POWER;
    this.lastCall.set(id, out);
    return out;
  }
  /** Rival personalities (tactics.js): a temporary multiplier layer over a seat's persona. No stance = the persona exactly as before. */
  setStance(playerId, stance) { if (stance) this.stances.set(playerId, stance); else this.stances.delete(playerId); }
  #persona(playerId) {
    const base = this.personas.get(playerId) ?? { aggr: 1, ki: 1, noise: 0.1, flip: 0.18 }; const st = this.stances.get(playerId);
    return st ? { ...base, aggr: base.aggr * st.aggr, ki: base.ki * st.ki, noise: base.noise * st.noise, flip: base.flip * st.flip, reserve: (base.reserve ?? 6) + st.reserve } : base;
  }

  /** Public card counting: every card that has reached the table is known to everyone. */
  #fullSeen(state) {
    const id = state?.matchId ?? 'default'; let set = this.playedIds.get(id);
    if (!set) { set = new Set(); this.playedIds.set(id, set); }
    return set;
  }
  /** What it REMEMBERS having been played: the highest Power cards and best Rank cards seen, plus the last few cards. The rest is forgotten, like a person at a table. */
  #seenSet(state) {
    const full = this.#fullSeen(state); const key = state?.matchId ?? 'default';
    if (this._memo && this._memo.key === key && this._memo.size === full.size) return this._memo.set;
    const cards = [...full].map((cid) => this.byId.get(cid)).filter(Boolean);
    const keep = new Set([...cards].sort((a, b) => b.power - a.power).slice(0, 3).map((c) => c.id));
    for (const c of [...cards].sort((a, b) => a.rank - b.rank).slice(0, 3)) keep.add(c.id);
    for (const cid of [...full].slice(-6)) keep.add(cid);
    this._memo = { key, size: full.size, set: keep };
    return keep;
  }
  #countTable(state) {
    if (!state) return;
    const set = this.#fullSeen(state);
    for (const pl of state.publicHistory ?? []) if (pl?.card?.id) set.add(pl.card.id);
    for (const pl of state.currentTrick?.plays ?? []) if (pl?.card?.id && !pl.card.isPass) set.add(pl.card.id);
    for (const pl of state.lastRound?.placements ?? []) if (pl?.card?.id && !pl.card.isPass) set.add(pl.card.id);
  }

  /** Expected HP (plus the Soul it brings, at a discount) of finishing with this card, from the table so far and the unseen cards. */
  #expectedPlacement(card, call, state, me) {
    const table = GAME_CONFIG.placements; const trick = state?.currentTrick;
    const plays = (trick?.plays ?? []).filter(pl => !pl.card.isPass).map(pl => this.#perceive(pl.card, state));
    const beats = (a, b) => { const v = compareCards(a, b, call); return this._inv ? -v : v; };
    const above = plays.filter(c => beats(c, card) > 0).length;
    const played = new Set((trick?.plays ?? []).map(pl => pl.playerId));
    const m = (state?.players ?? []).filter(p => p.id !== me?.id && p.hp > 0 && !played.has(p.id) && (!trick?.participantIds || trick.participantIds.includes(p.id))).length;
    const n = plays.length + 1 + m; if (n < 2) return 0;
    const seen = this.#seenSet(state); const mine = new Set((me?.hand ?? []).map(c => c.id));
    const pool = this.cards.filter(c => !seen.has(c.id) && !mine.has(c.id)); if (pool.length < 2) return 0;
    const pAbove = pool.filter(c => beats(c, card) > 0).length / pool.length;
    const rows = n >= 4 ? table.FOUR_PLAYER : n === 3 ? table.THREE_RANKED : table.TWO_PLAYER;
    let dist = [1]; for (let i = 0; i < m; i += 1) { const nx = new Array(dist.length + 1).fill(0); dist.forEach((pr, k) => { nx[k] += pr * (1 - pAbove); nx[k + 1] += pr * pAbove; }); dist = nx; }
    let e = 0; dist.forEach((pr, k) => { const row = rows[Math.min(rows.length - 1, above + k)]; e += pr * (row.hp + (row.ki ?? 0) * this.W.kiv); });
    return e;
  }

  /** Chance this card beats everyone still to play, from the unseen cards and the opponents' hand sizes. */
  #winChance(card, call, state, me) {
    if (!this.skill || !card || !state) return 0.5;
    const seen = this.#seenSet(state); const mine = new Set((me?.hand ?? []).map(c => c.id));
    const pool = this.cards.filter(c => !seen.has(c.id) && !mine.has(c.id));
    const U = pool.length; if (U < 2) return 0.5;
    let k = 0; for (const c of pool) { const v = compareCards(c, card, call); if ((this._inv ? -v : v) > 0) k += 1; }
    k *= 0.85; // some of those answers are unaffordable or locked
    const trick = state.currentTrick; const played = new Set((trick?.plays ?? []).map(pl => pl.playerId));
    const rest = (state.players ?? []).filter(p => p.id !== me?.id && p.hp > 0 && !played.has(p.id) && (!trick?.participantIds || trick.participantIds.includes(p.id)));
    let win = 1;
    for (const p of rest) {
      const n = Math.min(Math.max(0, (p.hand ?? []).filter(c => c.type !== 'WILDCARD').length), U);
      let none = 1; for (let j = 0; j < n; j += 1) none *= Math.max(0, (U - k - j) / (U - j));
      win *= none;
    }
    return win;
  }

  observe(state) {
    this.#rememberPublicState(state);
    if (this.adapt && state) { this._last = state; this._readCache = undefined; this.#learn(state); }
    this.#countTable(state);
    const signature = this.#stateSignature(state);
    const count = (this.seenStates.get(signature) ?? 0) + 1;
    this.seenStates.set(signature, count);
    return count;
  }

  /** Voluntary Ki charge (responders only). The AI banks Ki when it is about to starve, instead of burning a Last-Stand card. */
  shouldCharge(player, state) {
    this._inv = false;
    const c = GAME_CONFIG.charge;
    if (!state || state.phase !== 'PLAYING_CARD' || !state.currentTrick || state.currentTrick.leaderId === player.id) return false;
    if (player.hp <= c.minHp + 5 || (state.roundNumber - (player.lastChargeRound ?? -99)) < c.cooldownRounds || state.solarFlareLeader) return false;
    const ki = player.ki ?? 0;
    const lastStandLeft = player.hand.filter(card => card.lastStand).length;
    const regular = this.#legalHand(player, state).filter(card => !card.lastStand);
    const bestStrength = regular.length ? Math.max(...regular.map(card => (card.power / 999 + (GAME_CONFIG.rankMax + 1 - card.rank) / GAME_CONFIG.rankMax) / 2)) : 0;
    if (ki === 0 && lastStandLeft <= 2) return this.random() < 0.85;      // dying: refuel rather than spend a Last-Stand card
    if (ki <= 2 && bestStrength < 0.45) return this.random() < 0.55;        // nothing good I can afford
    return false;
  }

  shouldDraw(player, state) {
    this._inv = false;
    if (!state || (state.phase !== 'CALLING_STAT' && state.phase !== 'PLAYING_CARD')) return false;
    if (state.drawnThisRound?.includes(player.id) || player.hand.length >= GAME_CONFIG.survival.maxHand) return false;
    if (!state.reserveDeck.length || player.coins < GAME_CONFIG.draw.cost) return false;
    if (player.hand.filter(c => c.type === 'WILDCARD').length >= GAME_CONFIG.survival.maxWildcards) return false;
    if (player.drawsUsed >= GAME_CONFIG.draw.maxDrawsPerPlayerPerMatch) return false;

    const phase = this.#gamePhase(player, state);
    const quality = this.#handQuality(player.hand);
    const remaining = player.hand.length;
    const coinAfter = player.coins - GAME_CONFIG.draw.cost;

    let score = 0;
    if (quality.power < 0.38) score += 0.28;
    if (quality.rank < 0.38) score += 0.28;
    if (remaining <= 8) score += 0.22;
    if (remaining <= 4) score += 0.12;
    if (phase === 'END') score += 0.18;
    if (phase === 'EARLY') score -= 0.08;
    if (coinAfter < GAME_CONFIG.draw.cost && remaining > 5) score -= 0.20;
    if (player.drawsUsed >= 2) score -= 0.10;

    return score > 0.52 || (score > 0.35 && this.random() < 0.45) || (player.coins >= 3 && this.random() < 0.2);
  }

  chooseWildcard(player, state) {
    this._inv = false;
    if (!player?.hand || state?.wildcardLockout || state?.finalAtonement || state?.wildcardUsedThisRound?.includes(player.id)) return null;
    if (state.solarFlareLeader && state.solarFlareLeader !== player.id) return null;
    const wc = (effectId) => player.hand.find(c => c.type === 'WILDCARD' && c.effectId === effectId);
    const phase = state.phase;
    const opponents = (state.players ?? []).filter(p => p.id !== player.id && p.hp > 0);
    const plays = (state.currentTrick?.plays ?? []).filter(pl => !pl.card.isPass);
    const pick = (effectId, options = {}) => ({ cardId: wc(effectId).id, options });
    const r = () => this.random();

    // Survival first.
    if (wc('SENZU') && (player.hp <= 55 || (player.ki <= 3 && player.hp <= 80))) return pick('SENZU');
    if (wc('SHENRON_WISH') && !state.shenronUsed && player.ki >= 4 && player.hp <= 40) return pick('SHENRON_WISH', { wish: 'IMMORTALITY' });
    if (wc('FINAL_ATONEMENT') && player.hp > 15) {
      const killable = opponents.filter(p => p.hp <= 17).length;
      if (killable >= 1 && (opponents.length <= 2 || killable >= 2)) return pick('FINAL_ATONEMENT');
    }
    // The Curse: attempting is how it gets destroyed or passed on.
    if (wc('CURSE') && state.curse?.ownerId === player.id && state.roundNumber >= (state.curse.lockedUntilRound ?? 0) && player.hp > 20) {
      const hand = this.#legalHand(player, state);
      const best = Math.max(0, ...hand.map(c => Math.max(this.#globalStrength(c, CALLS.POWER), this.#globalStrength(c, CALLS.RANK))));
      if (best >= 0.8 || r() < 0.55) return pick('CURSE');
    }
    if (wc('MAFUBA') && phase === 'PLAYING_CARD' && plays.length && opponents.length >= 2 && player.ki >= 3) {
      const call = this.#inferCall(state, player.id);
      const inv = state.domainInversionRounds > 0;
      const bestPlay = plays.map(pl => ({ pl, card: this.#perceive(pl.card, state) })).sort((a, b) => this.#cmp(b.card, a.card, call, inv))[0];
      const mine = this.#legalHand(player, state);
      const canBeat = mine.some(c => this.#cmp(c, bestPlay.card, call, inv) > 0);
      if (!canBeat && this.#invokeCost(bestPlay.card, bestPlay.pl.card) >= 3 && r() < 0.6) return pick('MAFUBA', { targetCardId: bestPlay.pl.card.id });
    }
    if (wc('SHENRON_WISH') && !state.shenronUsed && player.ki >= 4 && phase === 'PLAYING_CARD' && plays.length && player.hp <= 75) {
      const call = this.#inferCall(state, player.id);
      const inv = state.domainInversionRounds > 0;
      const best = plays.map(pl => this.#perceive(pl.card, state)).sort((a, b) => this.#cmp(b, a, call, inv))[0];
      const mine = this.#legalHand(player, state);
      if (mine.length && !mine.some(c => this.#cmp(c, best, call, inv) > 0) && !inv) return pick('SHENRON_WISH', { wish: 'ABSOLUTE_POWER', stat: call === CALLS.RANK ? 'RANK' : 'POWER' });
    }
    if (wc('SHENRON_WISH') && !state.shenronUsed && player.ki >= 4 && state.roundNumber >= 8 && player.hp >= 50 && r() < 0.15) return pick('SHENRON_WISH', { wish: 'DIVINE_DESTRUCTION' });
    if (wc('SOLAR_FLARE') && phase === 'CALLING_STAT' && r() < 0.14) return pick('SOLAR_FLARE');
    if (wc('OTHER_WORLD') && phase === 'CALLING_STAT' && !state.domainInversionRounds && !state.activeEffects?.totalMight) {
      // Only worth it when a cheap, weak-in-some-stat card would beat the field once the lower stat wins.
      const hand = this.#legalHand(player, state).filter(c => !c.lastStand);
      const inv = Math.max(0, ...hand.map(c => Math.max(1 - this.#globalStrength(c, CALLS.POWER), 1 - this.#globalStrength(c, CALLS.RANK))));
      const normal = Math.max(0, ...hand.map(c => Math.max(this.#globalStrength(c, CALLS.POWER), this.#globalStrength(c, CALLS.RANK))));
      if (inv >= 0.85 && inv > normal + 0.12 && r() < 0.8) return pick('OTHER_WORLD');
    }
    if (wc('SCOUTER') && opponents.length && player.ki >= 4 && r() < 0.12) {
      const target = [...opponents].sort((a, b) => b.hp - a.hp)[0];
      return pick('SCOUTER', { targetId: target.id });
    }
    // Monarque's own deck: Whims and Omens are spoken before the round. He tries them in a random order until one takes (some cannot apply right now).
    const spoken = player.hand.filter(c => c.type === 'WILDCARD' && c.monarqueKind);
    if (spoken.length && phase === 'CALLING_STAT' && r() < 0.6) {
      const order = [...spoken].sort(() => r() - 0.5);
      return { cardId: order[0].id, options: {}, alternates: order.slice(1, 5).map(c => c.id) };
    }
    return null;
  }

  /** Answers a Game Master decree (draft pick, auction bid, training, Shenron's gift). Always returns a legal choice. */
  chooseDecree(player, state, opts) {
    this._inv = false;
    if (!opts) return {};
    const r = () => this.random();
    const d = state.decree;
    if (opts.kind === 'DRAFT') {
      const hpNeed = (100 - player.hp) / 100;
      const scored = (d?.pool ?? []).filter(c => opts.cards.includes(c.id)).map(c => {
        let sc;
        if (c.type === 'WILDCARD') sc = 0.5 + (c.effectId === 'SENZU' ? hpNeed * 0.6 : 0) + (c.effectId === 'MAFUBA' || c.effectId === 'SHENRON_WISH' ? 0.15 : 0);
        else { const full = this.#known(c); sc = Math.max(this.#rawStrength(full, CALLS.POWER), this.#rawStrength(full, CALLS.RANK)) * 0.8 + (this.#invokeCost(full, c) <= 1 ? 0.12 : 0); }
        return { id: c.id, sc: sc + r() * 0.08 };
      }).sort((a, b) => b.sc - a.sc);
      return { cardId: scored[0]?.id ?? opts.cards[0] ?? null };
    }
    if (opts.kind === 'AUCTION') {
      const spare = player.ki - 3;
      if (spare < 1) return { bid: 0 };
      let bid = Math.round((100 - player.hp) / 100 * 4 + r() * 1.6);
      if (player.hp > 85) bid = Math.min(bid, 1);
      return { bid: Math.max(0, Math.min(opts.maxBid, spare, bid)) };
    }
    if (opts.kind === 'TRAINING') {
      const cands = player.hand.filter(c => opts.cards.includes(c.id)).map(c => {
        const p = this.#rawStrength(c, CALLS.POWER), k = this.#rawStrength(c, CALLS.RANK);
        return { c, best: Math.max(p, k), stat: p >= k ? 'POWER' : 'RANK', cheap: this.#invokeCost(this.#known(c), c) <= 3 };
      }).filter(x => (x.stat === 'POWER' ? x.c.power < 999 : x.c.rank > 1)).sort((a, b) => (b.best + (b.cheap ? 0.2 : 0)) - (a.best + (a.cheap ? 0.2 : 0)));
      const pick = cands[0];
      return pick ? { cardId: pick.c.id, stat: pick.stat } : { cardId: opts.cards[0], stat: 'POWER' };
    }
    if (opts.kind === 'WISH') {
      const can = w => opts.wishes.includes(w);
      if (player.hp <= 55) return { wish: 'HEAL' };
      if (player.ki <= 4) return { wish: 'KI' };
      if (can('THIEF') && r() < 0.6) return { wish: 'THIEF' };
      if ((player.lockedCardIds?.length ?? 0) >= 3) return { wish: 'RECALL' };
      return { wish: player.hp < 90 ? 'HEAL' : 'KI' };
    }
    return {};
  }

  /** Infer the leader's hidden call from the visible leader card (never reads the real call unless Public Forecast). Most likely call only. */
  #inferCall(state, meId = null) {
    const pr = this.#callProbs(state, meId);
    return pr.certain ? pr.call : pr.power >= 0.5 ? CALLS.POWER : CALLS.RANK;
  }
  /** P(the hidden call is POWER). A card that looks Rank-ish usually means a RANK call, but leaders bluff: the weaker the leader's record of honest leads, the less it trusts the card's shape. */
  #callProbs(state, meId = null) {
    if (state.currentCall === TOTAL) return { certain: true, call: TOTAL, power: 0.5 };
    if (state.activeEffects?.publicForecast || state.activeEffects?.PUBLIC_FORECAST) return { certain: true, call: state.currentCall ?? CALLS.POWER, power: state.currentCall === CALLS.RANK ? 0 : 1 };
    const lead = state.currentTrick?.plays?.find(pl => !pl.card.isPass);
    if (!lead) return { certain: true, call: CALLS.POWER, power: 1 };
    const card = this.#perceive(lead.card, state);
    const p = this.#globalStrength(card, CALLS.POWER), rk = this.#globalStrength(card, CALLS.RANK);
    const hist = this.callHistory.get(state.currentTrick.leaderId) ?? { power: 0, rank: 0 };
    let bias = (hist.power - hist.rank) * 0.03;
    const k = meId ? this.#adaptK(meId) : 0;   // the player's own call habit, once they have shown one
    let bluff = 0.08;                           // anyone might bluff now and then
    if (k && this.#humanIds(state).includes(state.currentTrick.leaderId)) {
      const h = this.humanRead(meId);
      if (h) {
        bias += h.lean * 0.12 * k * this.#traits(meId).read;
        if (h.bluff != null) bluff = Math.max(0.05, Math.min(0.62, 0.08 + (h.bluff - 0.08) * Math.min(1, k * 2.2))); // learns the player's bluffing, capped so it never turns paranoid
      }
    }
    const shape = 1 / (1 + Math.exp(-(p + bias - rk) * 7));   // how strongly the card's shape points at POWER
    // Against a human the AI never fully trusts a card's shape: it keeps a floor of suspicion, raises it when the player bluffed recently,
    // and on some rounds (drawn from a hidden roll, so it can't be predicted) it commits to "this is a bluff" and reads the opposite call.
    const lid = state.currentTrick.leaderId;
    if (this.#humanIds(state).includes(lid)) {
      const m = this.#modelFor(state, lid); const recent = m.bluffs.slice(-3).reduce((a, b) => a + b, 0);
      bluff = Math.min(0.7, Math.max(bluff, 0.2) + recent * 0.1);
      let h = (this.salt ^ Math.imul((state.roundNumber ?? 0) + 7, 2654435761) ^ Math.imul(String(lid).length + 13, 40503)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h ^= h >>> 13;
      const roll = (h % 1000) / 1000;
      if (roll < bluff * 1.1) { const power = 0.72 * (1 - shape) + 0.28 * shape; return { certain: false, call: power >= 0.5 ? CALLS.POWER : CALLS.RANK, power }; }
    }
    const power = (1 - bluff) * shape + bluff * (1 - shape);
    return { certain: false, call: power >= 0.5 ? CALLS.POWER : CALLS.RANK, power };
  }
  #shapeCall(card) { return this.#rawStrength(card, CALLS.POWER) >= this.#rawStrength(card, CALLS.RANK) ? CALLS.POWER : CALLS.RANK; }

  #known(card) { return this.byId.get(card.id) ?? card; }
  /** What it believes about a card another seat has played face-down: a blurry read (fixed per card, so it does not flicker), not the exact numbers. */
  #perceive(card, state) {
    const k = this.#known(card);
    if (!this.fuzz || !k || k.power == null) return k;
    if (card.power != null && card.rank != null) return card; // numbers are public (Public Forecast, or the card is mine)
    let h = 2166136261; const key = `${this.salt}|${card.id}`;
    for (let i = 0; i < key.length; i += 1) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const u1 = (h % 1000) / 1000 - 0.5, u2 = ((h >>> 10) % 1000) / 1000 - 0.5;
    const wp = 0.07 * (this.powerMax - this.powerMin) * this.fuzz, wr = 0.07 * (this.rankMax - 1) * this.fuzz;
    return { ...k, power: Math.max(this.powerMin, Math.min(this.powerMax, Math.round(k.power + u1 * 2 * wp))), rank: Math.max(1, Math.min(this.rankMax, Math.round(k.rank + u2 * 2 * wr))) };
  }
  // The registry copy carries no cost mode; Story Mode's cards in hand and on the table do, so the cost follows the card the engine dealt.
  #invokeCost(card, from = card) { const mode = from?.costMode ?? card?.costMode; return getCardCost(mode && card?.costMode !== mode ? { ...card, costMode: mode } : card, this.cards); }

  #cmp(a, b, call, inverted) { const v = compareCards(a, b, call); return inverted ? -v : v; }

  #legalHand(player, state) {
    const locked = new Set(player.lockedCardIds ?? []);
    const sealed = new Set(Object.keys(state?.sealedCards ?? {}));
    const blocked = new Set(state?.noApexBlocked?.[player.id] ?? []);
    const cost = (card) => (state?.activeEffects?.worldOfVoid ? 0 : (state?.activeEffects?.kiSurge || state?.activeEffects?.KI_SURGE) ? Math.max(0, this.#invokeCost(card) - 1) : this.#invokeCost(card));
    return player.hand.filter(card => card.type !== 'WILDCARD' && !locked.has(card.id) && !sealed.has(card.id) && !blocked.has(card.id) && cost(card) <= (player.ki ?? 20) && (!card.lastStand || (player.ki ?? 20) === 0));
  }

  chooseCall(player, state = null) {
    this._inv = (state?.domainInversionRounds ?? 0) > 0;
    if (state?.activeEffects?.totalMight) return CALLS.POWER; // engine turns it into TOTAL
    const allChars = (player?.hand ?? []).filter(card => card.type !== 'WILDCARD');
    const legalNow = state ? this.#legalHand(player, state) : allChars;
    const characterHand = legalNow.length ? legalNow : allChars;
    if (!characterHand.length) return CALLS.POWER;

    this.observe(state);
    const phase = this.#gamePhase(player, state);
    const history = this.callHistory.get(player.id) ?? { power: 0, rank: 0 };

    let powerScore = this.#callScore(characterHand, CALLS.POWER, state, phase);
    let rankScore = this.#callScore(characterHand, CALLS.RANK, state, phase);
    if (this.skill) { // call the stat where my best two cards are most likely to hold the table
      const top = (call) => { const w = characterHand.map(c => this.#winChance(c, call, state, player)).sort((a, b) => b - a); return ((w[0] ?? 0) + (w[1] ?? w[0] ?? 0) * 0.5) / 1.5; };
      powerScore += top(CALLS.POWER) * this.W.call; rankScore += top(CALLS.RANK) * this.W.call;
    }

    const ak = this._inv ? 0 : this.#adaptK(player.id);
    if (ak) { // lean (a little) on the stat the player has been weaker at; capped, and never enough to override a clear specialist
      const h = this.humanRead(player.id);
      if (h?.weak) { const bonus = Math.min(0.06, 0.015 + 0.07 * h.weak.mag) * ak * this.#traits(player.id).exploit; if (h.weak.stat === CALLS.POWER) powerScore += bonus; else rankScore += bonus; }
    }
    const difference = powerScore - rankScore;
    const confidence = Math.abs(difference);

    // Choose the stat that actually gives this hand the better expected chance.
    // There is deliberately NO "force RANK after N POWER calls" rule.
    // A strong POWER specialist should keep calling POWER, while a rank-heavy
    // hand should naturally switch to RANK. Small noise only prevents identical
    // hands from always making exactly the same decision.
    let chosen;
    if (confidence < 0.025) {
      chosen = this.random() < 0.5 ? CALLS.POWER : CALLS.RANK;
    } else {
      chosen = difference > 0 ? CALLS.POWER : CALLS.RANK;

      // When the scores are close, remember the previous calls and vary slightly
      // instead of mechanically repeating the same stat forever.
      if (confidence < 0.08 && this.random() < this.#persona(player.id).flip * this.#calm(player.id)) {
        chosen = chosen === CALLS.POWER ? CALLS.RANK : CALLS.POWER;
      }
    }

    // A clear specialist is never overridden by call-history balancing.
    const bestPower = Math.max(...characterHand.map(c => c.power));
    const bestRank = Math.min(...characterHand.map(c => c.rank));
    const powerSpecialist = bestPower >= 900 && (GAME_CONFIG.rankMax + 1 - bestRank) < 0.58 * GAME_CONFIG.rankMax;
    const rankSpecialist = bestRank <= 22 && bestPower < 900;
    if (!this._inv && powerSpecialist && powerScore > rankScore + 0.08) chosen = CALLS.POWER;
    if (!this._inv && rankSpecialist && rankScore > powerScore + 0.08) chosen = CALLS.RANK;

    // A bluff now and then: lead a card that LOOKS like it is strong at one stat, but call the other stat it is also good at. Only when the card can still really win it.
    this._decoy = null;
    if (!this._inv && this.skill && state && (state.roundNumber ?? 0) >= 2 && !state.activeEffects?.publicForecast) {
      const pb = Math.max(0.14, Math.min(0.36, 0.14 + this.#persona(player.id).flip * 0.7)) * (phase === 'END' ? 0.5 : 1);
      if (this.random() < pb) {
        const honest = Math.max(0, ...characterHand.map(c => this.#winChance(c, chosen, state, player)));
        let best = null;
        for (const call of [CALLS.POWER, CALLS.RANK]) for (const c of characterHand) {
          if (c.lastStand || this.#shapeCall(c) === call) continue;        // a decoy's shape points at the OTHER stat
          if ((player.ki ?? 0) - this.#cost(c, state) < (this.#persona(player.id).reserve ?? 6)) continue; // a bluff never spends the Soul it wants to keep
          if (this.#globalStrength(c, call) < 0.52) continue;               // ...but it must still be good at the stat it calls
          const wc = this.#winChance(c, call, state, player); if (wc < Math.max(0.35, honest - 0.2)) continue;
          if (!best || wc > best.wc) best = { c, call, wc };
        }
        if (best) { chosen = best.call; this._decoy = { pid: player.id, round: state.roundNumber, call: best.call, cardId: best.c.id }; }
      }
    }

    const trial = this.#persona(player.id).trial;
    if (trial && !this._inv && !this._decoy) chosen = this.#trialCall(player.id, state, chosen, trial);
    history[chosen === CALLS.POWER ? 'power' : 'rank'] += 1;
    this.callHistory.set(player.id, history);
    return chosen;
  }

  chooseCard(player, state) {
    this._inv = (state?.domainInversionRounds ?? 0) > 0;
    const observationCount = this.observe(state);
    const hand = this.#legalHand(player, state);
    if (!hand.length) return null;

    const inverted = (state.domainInversionRounds ?? 0) > 0;
    const isLeader = !state.currentTrick?.plays?.length;
    const call = isLeader ? (state.currentCall ?? state.currentTrick?.call ?? this.chooseCall(player, state)) : this.#inferCall(state, player.id);
    const plays = (state.currentTrick?.plays ?? []).filter(play => !play.card.isPass).map(play => ({ ...play, card: this.#perceive(play.card, state) }));
    const phase = this.#gamePhase(player, state);
    const repeated = observationCount > 1;

    if (plays.length === 0) {
      const d = this._decoy; this._decoy = null;
      if (d && d.pid === player.id && d.round === state.roundNumber && d.call === state.currentCall && hand.some(c => c.id === d.cardId)) return d.cardId; // the bluff chooseCall set up
      return this.#scoreLead(hand, call, phase, repeated, state, player).pick.id;
    }
    return this.#respond(player, state, hand, plays, phase, repeated, inverted).pick.id;
  }

  /** The next-best plays (never the one already chosen): what a slightly distracted player might do instead of the best move, instead of a random card. */
  alternatives(player, state, excludeId, n = 2) {
    this._inv = (state?.domainInversionRounds ?? 0) > 0;
    const hand = this.#legalHand(player, state); if (!hand.length) return [];
    const inverted = this._inv; const plays = (state.currentTrick?.plays ?? []).filter(play => !play.card.isPass).map(play => ({ ...play, card: this.#perceive(play.card, state) }));
    const phase = this.#gamePhase(player, state);
    const call = plays.length ? this.#inferCall(state, player.id) : (state.currentCall ?? state.currentTrick?.call ?? CALLS.POWER);
    const scored = (plays.length ? this.#respond(player, state, hand, plays, phase, false, inverted) : this.#scoreLead(hand, call, phase, false, state, player)).scored;
    return scored.filter(x => x.card.id !== excludeId).slice(0, n).map(x => x.card.id);
  }

  /** Responder: weigh every playable card against BOTH possible calls, by how likely each call is. */
  #respond(player, state, hand, plays, phase, repeated, inverted) {
    const probs = this.#callProbs(state, player.id);
    const calls = probs.certain ? [[probs.call, 1]] : probs.power >= 0.85 ? [[CALLS.POWER, 1]] : probs.power <= 0.15 ? [[CALLS.RANK, 1]] : [[CALLS.POWER, probs.power], [CALLS.RANK, 1 - probs.power]];
    const trick = state.currentTrick;
    const playersAfter = Math.max(0, (trick?.participantIds?.length ?? 4) - (trick?.plays?.length ?? 0) - 1);
    const total = new Map(hand.map(c => [c.id, 0]));
    for (const [call, w] of calls) {
      const currentBest = plays.reduce((best, play) => (this.#cmp(play.card, best.card, call, inverted) > 0 ? play : best)).card;
      const winning = hand.filter(card => this.#cmp(card, currentBest, call, inverted) > 0);
      const ctx = { me: player, playersAfter, bestGlobal: this.#globalStrength(currentBest, call) };
      for (const card of hand) {
        const canWinNow = winning.some(x => x.id === card.id);
        // When some card can win under this call, a card that cannot is a plain loss; otherwise every card is a sacrifice and the cheapest wins out.
        const sc = winning.length && !canWinNow ? -0.6 : this.#responseScore(card, hand, call, phase, winning.length > 0, state, ctx);
        total.set(card.id, total.get(card.id) + sc * w);
      }
    }
    const scored = hand.map(card => ({ card, score: total.get(card.id) })).sort((a, b) => b.score - a.score);
    return { scored, pick: this.#pickWithNoise(scored, repeated || this.random() < 0.12 * this.noiseMul).card };
  }

  /** Cap-safe boost: never exceeds the combined budget, Ki, 999 Power or Rank 1. */
  chooseBoost(player, cardId, state, knownCall = null) {
    this._inv = false;
    const card = player?.hand?.find(c => c.id === cardId && c.type !== 'WILDCARD');
    if (!card) return { powerKi: 0, rankKi: 0 };
    const cost = (state?.activeEffects?.worldOfVoid ? 0 : (state?.activeEffects?.kiSurge || state?.activeEffects?.KI_SURGE) ? Math.max(0, this.#invokeCost(card) - 1) : this.#invokeCost(card));
    const tier = this.#invokeCost(card);
    const tierName = tier >= 5 ? 'OP' : tier >= 3 ? 'POWERFUL' : tier === 0 ? 'WEAK' : 'NORMAL';
    const budget = Math.min({ WEAK: 3, NORMAL: 2, POWERFUL: 1, OP: 0 }[tierName], Math.max(0, player.ki - cost - 2));
    if (budget < 1) return { powerKi: 0, rankKi: 0 };
    const plays = (state.currentTrick?.plays ?? []).filter(pl => !pl.card.isPass);
    const inverted = (state.domainInversionRounds ?? 0) > 0;
    const call = plays.length ? this.#inferCall(state, player.id) : (knownCall ?? state.currentCall ?? CALLS.POWER);
    if (inverted || state?.activeEffects?.kiSeal || state?.activeEffects?.KI_SEAL) return { powerKi: 0, rankKi: 0 };
    const maxPower = Math.max(0, Math.min(budget, Math.floor((999 - card.power) / 25)));
    const maxRank = Math.max(0, Math.min(budget, Math.floor((card.rank - 1) / 3)));
    let need = 0;
    if (plays.length) {
      const best = plays.map(pl => this.#perceive(pl.card, state)).reduce((a, b) => (compareCards(a, b, call) > 0 ? a : b));
      if (call === CALLS.POWER && card.power <= best.power) need = Math.ceil((best.power + 1 - card.power) / 25);
      if (call === CALLS.RANK && card.rank >= best.rank) need = Math.ceil((card.rank - best.rank + 1) / 3);
    } else if (player.ki >= 8 && this.random() < 0.25) {
      const strength = this.#globalStrength(card, call);
      if (strength > 0.45 && strength < 0.85) need = 1;
    }
    if (need < 1) return { powerKi: 0, rankKi: 0 };
    const bk = this.#adaptK(player.id);
    if (bk && this.#traits(player.id).thrift > 0 && this.random() < 0.3 * bk * this.#traits(player.id).thrift * (1 - (this.humanRead(player.id)?.strain ?? 0))) return { powerKi: 0, rankKi: 0 }; // waits for a better moment
    const cap = call === CALLS.POWER ? maxPower : maxRank;
    if (need > cap) return { powerKi: 0, rankKi: 0 };
    return call === CALLS.POWER ? { powerKi: need, rankKi: 0 } : { powerKi: 0, rankKi: need };
  }

  /** Ki cost the engine will charge for this card right now (mirrors the engine's rules). */
  #cost(card, state) {
    if (state?.activeEffects?.worldOfVoid) return 0;
    const base = this.#invokeCost(card);
    return (state?.activeEffects?.kiSurge || state?.activeEffects?.KI_SURGE) ? Math.max(0, base - 1) : base;
  }

  /** Penalty for leaving too little Ki behind (Ki 0 forces the Last-Stand cards and ends in elimination). */
  #kiPenalty(card, state, me, strength) {
    const left = (me?.ki ?? 20) - this.#cost(card, state);
    let reserve = this.skill ? this.#persona(me?.id).reserve ?? 6 : 6; // story trials: how much Soul this fighter tries to keep in hand
    const rk = this.#adaptK(me?.id);
    if (rk) { const t = this.#traits(me.id).thrift; reserve += t * rk * 1.5 * (t > 0 ? 1 - (this.humanRead(me.id)?.strain ?? 0) : 1); } // hoarders hoard until the player is strained
    if (left >= reserve) return 0;
    const base = (left <= 0 ? 0.55 : left <= 2 ? 0.3 : 0.12) * (this.skill ? this.#persona(me?.id).ki : 1);
    return strength > 0.88 ? base * 0.5 : base; // a decisive card is worth a little more risk
  }

  #scoreLead(hand, call, phase, repeated, state, me = null) {
    const memory = this.#memoryFor(state);
    let aggression = (this.aggression ?? 1) * this.#persona(me?.id).aggr;
    const pk = this.#adaptK(me?.id);
    if (pk) aggression *= 1 + 0.15 * pk * this.#traits(me.id).press * (this.humanRead(me.id)?.strain ?? 0); // press a strained player
    const scored = hand.map(card => {
      const strength = this.#relativeStrength(card, call, hand);
      const global = this.#globalStrength(card, call);
      const publicPressure = this.#publicPressure(card, call, memory);
      // Leaders see nobody else's card yet: lead with real strength, not an "average" card.
      let score = 0.30 + (strength * 0.75 + global * 0.55) * aggression;
      if (phase === 'EARLY') score -= 0.08;           // a little patience at the start
      if (phase === 'END') score += strength * 0.3;
      score += publicPressure * 0.2;
      score -= this.#kiPenalty(card, state, me ?? { ki: 20 }, global);
      if (this.skill) { score += this.#expectedPlacement(card, call, state, me) * this.W.hp; const wp = this.#winChance(card, call, state, me); score += wp * this.W.lead - (wp > 0.75 ? this.#cost(card, state) * this.W.cheap : 0); }
      if (strength < 0.2 && phase !== 'END') score -= 0.25; // leading a throw-away card hands the round away
      return { card, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return { scored, pick: this.#pickWithNoise(scored, repeated || this.random() < (this.skill ? this.#persona(me?.id).noise * 0.55 * this.#calm(me?.id) : 0.06) * this.noiseMul).card };
  }

  #responseScore(card, hand, call, phase, canWin, state, ctx = {}) {
    const strength = this.#relativeStrength(card, call, hand);
    const global = this.#globalStrength(card, call);
    const handAfter = hand.filter(c => c.id !== card.id);
    const future = handAfter.length ? this.#handQuality(handAfter) : { power: 0, rank: 0 };
    const memory = this.#memoryFor(state);
    const me = ctx.me ?? { ki: 20 };
    const behind = ctx.playersAfter ?? 0;          // fighters still to play after me: they can beat a thin win
    let score = 0;

    if (canWin) {
      // Win with a safety margin when others can still answer; with nobody left, win as cheaply as possible.
      const margin = global - (ctx.bestGlobal ?? 0);
      if (behind > 0) score = 0.9 + Math.min(margin, 0.35) * 1.4 + strength * 0.25 - Math.max(0, margin - 0.4) * 0.8 + (this.skill ? this.#winChance(card, call, state, me) * this.W.resp : 0);
      else score = 1.2 - strength;
      if (phase === 'END') score += strength * 0.45;
      if (hand.length <= 4) score += strength * 0.35;
      score += Math.max(future.power, future.rank) * 0.12;
      score -= this.#publicPressure(card, call, memory) * 0.10;
    } else {
      // Cannot win: a cheap sacrifice that keeps the strong cards (and Ki) for later — but never a lone throw-away at 3rd/4th if a mid card avoids the bottom.
      score = 1.1 - strength + Math.max(future.power, future.rank) * 0.30 - this.#cost(card, state) * 0.06;
      if (phase === 'END') score += (1 - strength) * 0.3;
    }
    if (this.skill) score += this.#expectedPlacement(card, call, state, me) * this.W.hp;
    score -= this.#kiPenalty(card, state, me, global) * (canWin ? 0.7 : 1);
    const opponentCounts = (state?.players ?? []).filter(p => p.id !== state?.currentPlayer && p.hp > 0).map(p => p.hand.length);
    if (opponentCounts.some(n => n <= 2) && canWin) score += 0.3;
    return score;
  }

  #callScore(hand, call, state, phase) {
    // Evaluate the stat on the full card scale. This is deliberately not
    // based only on the current hand, so a hand containing one huge POWER card
    // does not automatically make POWER the best call when it has several
    // genuinely strong RANK cards as well.
    const strengths = hand.map((card) => this.#globalStrength(card, call)).sort((a, b) => b - a);
    const sample = strengths.slice(0, Math.min(7, strengths.length));
    const topAverage = sample.reduce((sum, value) => sum + value, 0) / sample.length;
    const best = strengths[0] ?? 0;
    const second = strengths[1] ?? best;
    const coverage = strengths.filter((value) => value >= 0.72).length / Math.max(1, strengths.length);

    let score = best * 0.30 + topAverage * 0.38 + coverage * 0.20 + second * 0.12;

    const memory = this.#memoryFor(state);
    const publicAdvantage = this.#publicAdvantage(hand, call, memory);
    score += publicAdvantage * 0.12;

    // A stat whose best cards were just seen on the table becomes slightly less
    // attractive. This is a small human-memory effect, not card counting.
    score -= this.#recentStatPressure(call, memory) * 0.08;

    if (phase === 'END') score += best * 0.16;

    // Give a meaningful but modest bonus for depth, not merely one superstar.
    const strongCount = strengths.filter((value) => value >= 0.78).length;
    if (strongCount >= 3) score += 0.05;
    if (strongCount >= 5) score += 0.04;

    return score;
  }

  #globalStrength(card, call) {
    if (!card || card.type === 'WILDCARD') return 0.5;
    const raw = this.#rawStrength(card, call);
    return this._inv ? 1 - raw : raw; // under Domain Inversion the LOWER stat wins, so "strong" means weak
  }
  #rawStrength(card, call) {
    if (call === TOTAL) return (this.#rawStrength(card, CALLS.POWER) + this.#rawStrength(card, CALLS.RANK)) / 2;
    if (call === CALLS.POWER) {
      const span = Math.max(1, this.powerMax - this.powerMin);
      return (card.power - this.powerMin) / span;
    }
    return 1 - ((card.rank - 1) / Math.max(1, this.rankMax - 1));
  }

  #recentStatPressure(call, memory) {
    if (!memory.cards.length) return 0;
    const threshold = 0.78;
    const strongRecent = memory.cards.filter((card) => this.#globalStrength(card, call) >= threshold).length;
    return strongRecent / memory.cards.length;
  }

  #publicAdvantage(hand, call, memory) {
    if (!memory.cards.length) return 0;
    const publicCards = memory.cards;
    let total = 0;

    for (const card of hand) {
      const strongerPublic = publicCards.filter(other => this.#cmp(other, card, call, this._inv) > 0).length;
      const weakerPublic = publicCards.filter(other => this.#cmp(card, other, call, this._inv) > 0).length;
      total += weakerPublic / Math.max(1, publicCards.length);
      total -= strongerPublic / Math.max(1, publicCards.length) * 0.45;
    }

    return Math.max(-1, Math.min(1, total / Math.max(1, hand.length)));
  }

  #publicPressure(card, call, memory) {
    if (!memory.cards.length) return 0;
    const stronger = memory.cards.filter(other => this.#cmp(other, card, call, this._inv) > 0).length;
    const weaker = memory.cards.filter(other => this.#cmp(card, other, call, this._inv) > 0).length;
    return Math.max(-1, Math.min(1, (stronger - weaker * 0.35) / memory.cards.length));
  }

  #memoryFor(state) {
    const matchId = state?.matchId ?? 'default';
    const memory = this.publicMemory.get(matchId) ?? { cards: [], byPlayer: new Map(), calls: [] };
    this.publicMemory.set(matchId, memory);
    return memory;
  }

  #rememberPublicState(state) {
    if (!state) return;
    const memory = this.#memoryFor(state);

    // Human-like memory: do NOT retain the complete match history. Keep only
    // the most recent few public cards, roughly one or two recent tricks in a
    // four-player match. Older cards naturally fade from the AI's memory.
    const recentPlays = [
      ...(state.publicHistory ?? []).slice(-HUMAN_MEMORY_CARD_LIMIT),
      ...(state.currentTrick?.plays ?? [])
    ];

    const latestById = new Map();
    for (const play of recentPlays) {
      if (play?.card?.id) latestById.set(play.card.id, play);
    }
    const recent = [...latestById.values()].slice(-HUMAN_MEMORY_CARD_LIMIT);

    memory.cards = recent.map(play => play.card);
    memory.byPlayer = new Map();
    for (const play of recent) {
      if (!memory.byPlayer.has(play.playerId)) memory.byPlayer.set(play.playerId, []);
      memory.byPlayer.get(play.playerId).push(play.card);
    }

    if (state.currentCall && state.currentPlayer) {
      const lastCall = memory.calls[memory.calls.length - 1];
      if (!lastCall || lastCall.turnNumber !== state.turnNumber) {
        memory.calls.push({ turnNumber: state.turnNumber, playerId: state.currentPlayer, call: state.currentCall });
      }
      memory.calls = memory.calls.slice(-HUMAN_MEMORY_CALL_LIMIT);
    }
  }

  #pickWithNoise(items, noisy) {
    if (!items.length) return null;
    if (!noisy) return items[0];
    const pool = items.slice(0, Math.min(3, items.length));
    return pool[Math.floor(this.random() * pool.length)];
  }

  #relativeStrength(card, call, hand) {
    const val = c => call === CALLS.POWER ? c.power : call === TOTAL ? c.power / 999 * 100 + (GAME_CONFIG.rankMax + 1 - c.rank) / GAME_CONFIG.rankMax * 100 : GAME_CONFIG.rankMax + 1 - c.rank;
    const values = hand.map(val);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const rel = max === min ? 0.5 : (val(card) - min) / (max - min);
    return this._inv ? 1 - rel : rel;
  }

  #handQuality(hand) {
    hand = hand.filter(card => card.type !== 'WILDCARD');
    if (!hand.length) return { power: 0, rank: 0 };
    const power = hand.map((card) => this.#globalStrength(card, CALLS.POWER)).sort((a, b) => b - a);
    const rank = hand.map((card) => this.#globalStrength(card, CALLS.RANK)).sort((a, b) => b - a);
    const sample = Math.max(1, Math.ceil(hand.length * 0.30));
    const avg = values => values.slice(0, sample).reduce((s, v) => s + v, 0) / sample;
    return { power: avg(power), rank: avg(rank) };
  }

  #gamePhase(player, state) {
    const own = player?.hand?.length ?? 0;
    const active = state?.players?.reduce((sum, p) => sum + p.hand.length, 0) ?? 0;
    if (own <= Math.max(3, Math.ceil(active * 0.05))) return 'END';
    if (own <= Math.max(10, Math.ceil(active * 0.22))) return 'MID';
    return 'EARLY';
  }

  #stateSignature(state) {
    const hands = (state?.players ?? []).map(p => p.id === state.currentPlayer
      ? `${p.id}:${p.hand.map(c => c.id).sort().join(',')}`
      : `${p.id}:${p.hand.length}`).join('|');
    const trick = state?.currentTrick?.plays?.map(play => `${play.playerId}:${play.card.id}`).join(',') ?? '';
    return `${state?.currentPlayer}|${state?.direction}|${state?.phase}|${state?.currentCall}|${hands}|${trick}`;
  }
}
