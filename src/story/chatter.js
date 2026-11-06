// Table talk for Battle Mode. Every AI seat is a contender and speaks as one: its own lines first, its temperament's second.
// Lines never reveal hidden information (no cards, no calls). `{you}` is replaced by the human's seat name.
import { lineFor } from './reactions.js';
import { fighterByName } from '../utils/portrait.js';
import { emojiFor } from './emotes.js';
import { answerEmote, readTable } from './emoteReply.js';
import { isMocking, mockLine, paybackLine, sourLine } from './mockery.js';
import { EXTRA_C, fresh } from './voiceBank.js';

// [table-talk, hurt, taunt, power]  — short, specific to the being.
const VOICE = {
  apep: ['The night is long. I am longer.', 'Struck. The serpent remembers.', '{you}, the sun-boat is far from here.', 'Coil and crush.'],
  mictlantecuhtli: ['Nine levels, {you}. Take your time on the stairs.', 'A bone chipped. I have plenty.', 'I have your name on a cold shelf.', 'Descend.'],
  coatlicue: ['Mind the skirt of serpents.', 'Even mothers bleed, {you}.', 'Come closer. I carry room for one more.', 'Born of me, and sent to you.'],
  kali: ['Dance with me, {you}.', 'Blood on my tongue. Good.', 'You mistake patience for mercy.', 'The garland grows.'],
  'baron-samedi': ['Rum, a cigar, and a crossroads. Deal.', 'Ha. The dead are laughing at me. Rude.', '{you}, I will save you a seat below.', 'A door opens. Do not walk through it.'],
  balor: ['I will open the eye when it counts.', 'The lid slips. Only for a moment.', 'You were foretold, {you}. So was this.', 'Look. If you dare.'],
  'the-cailleach': ['Winter does not hurry.', 'A crack in the ice. It will freeze over.', 'The frost has your hands already, {you}.', 'Hold still. Snow settles.'],
  surtr: ['The sword is warm. Be glad it is not drawn.', 'Ash on my sleeve. I will wear it.', 'Everything ends in fire, {you}.', 'Let it burn.'],
  asmodeus: ['Three heads, one wager.', 'That was the left head’s idea.', 'We three agree: you will lose, {you}.', 'A bet is a promise.'],
  baphomet: ['As above, so below. Deal.', 'A cut on a paradox. It heals both ways.', 'You stand on the wrong side of the mirror, {you}.', 'The torch turns.'],
  samael: ['Quiet. I am listening to your heartbeat.', 'Blind, and still it hurts.', 'The venom is patient, {you}.', 'Judgment, by the poisoned hand.'],
  ravana: ['Ten minds on one table.', 'One head ached. Nine did not.', 'Ten plans, {you}. Which one are you in?', 'A crown for each hand.'],
  'azi-dahaka': ['The chain holds. Barely.', 'The mountain shook. Not from me.', 'One day I am loosed, {you}. Remember this table.', 'Three mouths. One hunger.'],
  'jeoseung-saja': ['Your name is written, {you}. I only deliver.', 'A name smudged. I will rewrite it.', 'Hurry. The list is long and I am punctual.', 'By the register.'],
  perchta: ['Idle hands do not eat tonight.', 'A stitch snaps. I will sew it.', '{you}, did you finish your work?', 'The shears are sharp.'],
  camazotz: ['The dark is quiet. Why are you so loud?', 'Light. Hide me from it.', 'I hear your pulse, {you}. Fast.', 'Down from the ceiling.'],
  briareus: ['A hundred hands, all of them patient.', 'A hand lost. I will count the rest.', 'You cannot hold what I can throw, {you}.', 'Let fly.'],
  chiyou: ['Bronze and horn. Come at me.', 'Cracked. I have been cracked by gods.', 'I invented war, {you}. You are still learning it.', 'The drums, now.'],
  hecate: ['Three roads. Choose, {you}.', 'The torch gutters. I carry another.', 'You stand at my crossing. Careful.', 'The hounds are called.'],
  'baba-yaga': ['Come, come, little {you}. The pot is warm.', 'My hut kicked me. It is in a mood.', 'Wrong answer, again, little one.', 'Pestle and mortar, now.'],
  izanami: ['A thousand a day, {you}. You will be one.', 'The living bite harder than I recall.', 'Do not turn around.', 'Come below.'],
  'shuten-doji': ['Drink, {you}! A cup for the guest!', 'Ha! A good one. Pour another.', 'You fight like a sober man.', 'Sake and steel!'],
  typhon: ['The mountain stirs. That is me.', 'A hundred heads, and that one hurt.', 'Flee if you like, {you}. I am the weather.', 'Break the sky.'],
  tiamat: ['The sea remembers everything, {you}.', 'Salt closes the wound.', 'You are a drop. I am the deep.', 'Rise, my children.'],
  lucifer: ['Kneel, {you}. It costs nothing.', 'A flaw in the light. I will correct it.', 'You are very brave. It will not matter.', 'Let there be less.'],
  beelzebub: ['Listen. Do you hear them? They are hungry.', 'A wing torn. There are more.', 'You smell sweet, {you}.', 'Rise, little ones.'],
  nyx: ['Night was here first.', 'A star fell. Another opens.', 'Sleep, {you}. I will mind the dark.', 'Close your eyes.'],
  thanatos: ['I am never late, {you}.', 'A delay. Nothing more.', 'Gently. It is easier if you do not argue.', 'Quietly, now.'],
  hades: ['Everyone arrives at my table eventually.', 'A debt noted.', 'You will be counted, {you}. All are.', 'By the king below.'],
  'the-reaper': ['The glass is running, {you}.', 'The scythe is dull today. Not for long.', 'I have not once been refused.', 'Reap.'],
  hel: ['Cold in here, {you}? You will adjust.', 'Half of me is dead. The other half is annoyed.', 'Everyone comes to my hall.', 'Open the gate.'],
  osiris: ['I have been weighed. Have you?', 'Torn again. I am used to it.', 'Your heart, {you}. Is it lighter than a feather?', 'The scales will speak.'],
};

const pick = (arr, rand = Math.random) => arr[Math.floor(rand() * arr.length)];
const TEMPS = ['SOVEREIGN', 'DECEIVER', 'DEVOURER', 'ANCIENT'];
const FALLBACK_TEMP = (name = '') => TEMPS[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % 4];

export class BattleChatter {
  constructor({ players, humanId, rand = Math.random }) {
    this.rand = rand; this.humanId = humanId; this.round = 0; this.said = {}; this.lastSpoke = {}; this.lastReplyAt = {}; this.mockedBy = {}; this.mockedYou = {}; this.streakHuman = 0; this.lastSeq = 0; this.you = players.find((p) => p.id === humanId)?.name ?? 'mortal';
    this.seats = Object.fromEntries(players.filter((p) => p.id !== humanId).map((p) => { const f = fighterByName(p.name); return [p.id, { id: p.id, name: p.name, fighterId: f?.id ?? null, temperament: f?.temperament ?? FALLBACK_TEMP(p.name) }]; }));
  }
  /** Temperament of every AI seat, for the AI's playstyle. */
  temperaments() { return Object.fromEntries(Object.values(this.seats).map((s) => [s.id, s.temperament])); }
  #line(seat, kind) {
    if (kind === 'mock' || kind === 'payback' || kind === 'sour') return ({ mock: mockLine, payback: paybackLine, sour: sourLine })[kind](seat, this.rand).replaceAll('{you}', this.you);
    const v = seat.fighterId && VOICE[seat.fighterId];
    const idx = { talk: 0, hurt: 1, taunt: 2, power: 3 }[kind];
    if (v && idx != null && (kind !== 'talk' || this.rand() < 0.75)) return fresh(`${seat.fighterId}:voice:${kind}`, [v[idx], ...(EXTRA_C[seat.fighterId]?.[kind] ?? [])], this.rand).replaceAll('{you}', this.you);
    const k = { talk: 'intro', hurt: 'lose', taunt: 'taunt', power: 'cry' }[kind] ?? kind;
    return lineFor(seat.fighterId ?? seat.temperament.toLowerCase(), k, this.rand, 'MIDDLE').replaceAll('{you}', this.you);
  }
  #say(out, seat, mood, text, key, { force = false, gap = 2 } = {}) {
    if (!seat || this.said[key] || out.some((o) => o.playerId === seat.id)) return false;
    if (!force && this.round - (this.lastSpoke[seat.id] ?? -9) < gap) return false;
    this.said[key] = true; this.lastSpoke[seat.id] = this.round; out.push({ playerId: seat.id, mood, text, emoji: emojiFor(seat, mood, this.rand), id: `${key}-${Math.random().toString(36).slice(2, 6)}` }); return true;
  }
  /** The player tapped a bubble and sent `emote`. The rival answers from what is actually happening at the table (who took the last round,
   *  the Health it cost, who leads, who is cornered), not from a fixed reply. It may take a moment to answer again, and never answers from a dead seat. */
  react(seatId, emote, next) {
    const seat = this.seats[seatId]; const p = next?.players?.find((x) => x.id === seatId); if (!seat || !p || p.hp <= 0) return [];
    if (isMocking(emote)) this.mockedBy[seatId] = this.round; // it remembers a jeer, even if it says nothing now
    const now = Date.now(); const prev = this.sent?.[seatId]; this.sent = { ...(this.sent ?? {}), [seatId]: { e: emote, at: now, n: prev && prev.e === emote && now - prev.at < 30000 ? prev.n + 1 : 1 } };
    if (now - (this.lastReplyAt[seatId] ?? 0) < 3500) return []; this.lastReplyAt[seatId] = now;
    const me = next.players.find((x) => x.id === this.humanId); const lr = next.lastRound; const ranked = (lr?.placements ?? []).filter((x) => !x.card?.isPass);
    const table = readTable({
      round: lr?.round ?? 0, seatPlace: ranked.find((x) => x.playerId === seatId)?.place, mePlace: ranked.find((x) => x.playerId === this.humanId)?.place,
      dFoe: lr?.deltas?.[seatId]?.hp ?? 0, dMe: lr?.deltas?.[this.humanId]?.hp ?? 0, foeHp: p.hp, foeMax: p.maxHp ?? 100, meHp: me?.hp ?? 100, meMax: me?.maxHp ?? 100,
    });
    const r = answerEmote({ who: seat, emote, table, you: this.you, repeats: this.sent[seatId].n, rand: this.rand }); if (!r) return [];
    this.lastSpoke[seat.id] = this.round;
    return [{ playerId: seat.id, mood: r.mood, text: r.text, emoji: r.emoji, reply: true, id: `re-${Math.random().toString(36).slice(2, 7)}` }];
  }
  alive(next) { return next.players.filter((p) => this.seats[p.id] && p.hp > 0).map((p) => this.seats[p.id]); }
  intro(next) {
    const out = []; const seats = this.alive(next); if (!seats.length) return out;
    const a = pick(seats, this.rand); this.#say(out, a, 'confident', this.#line(a, 'talk'), 'intro-a', { force: true });
    return out;
  }
  observe(prev, next) {
    const out = []; if (!next?.players) return out;
    const R = () => this.rand();
    const lr = next.lastRound;
    if (lr && lr.round !== this.round && lr.placements?.length) {
      this.round = lr.round;
      const ranked = lr.placements.filter((p) => !p.card?.isPass); const top = ranked.find((p) => p.place === 1); const last = ranked.at(-1);
      const dHp = (id) => lr.deltas?.[id]?.hp ?? 0;
      if (top?.playerId === this.humanId) this.streakHuman += 1; else this.streakHuman = 0;
      if (top?.playerId === this.humanId) { // you won: a rival that jeered at you last round is sour about it
        for (const s of this.alive(next)) if (lr.round - (this.mockedYou[s.id] ?? -9) <= 1 && R() < 0.85) { this.#say(out, s, 'angry', this.#line(s, 'sour'), `sr-${lr.round}`, { gap: 0 }); delete this.mockedYou[s.id]; break; }
      }
      if (top && this.seats[top.playerId]) { // an AI took the round: it mocks you, or pays you back for an earlier jibe
        const s = this.seats[top.playerId]; const hurtYou = last?.playerId === this.humanId && dHp(this.humanId) <= -10;
        const owed = this.round - (this.mockedBy[s.id] ?? -9) <= 3;
        if (owed && R() < 0.9) { if (this.#say(out, s, 'joy', this.#line(s, 'payback'), `pb-${lr.round}`, { gap: 0 })) { delete this.mockedBy[s.id]; this.mockedYou[s.id] = lr.round; } }
        else if (R() < (hurtYou ? 0.92 : 0.8)) {
          const jeer = R() < 0.65; const text = jeer ? this.#line(s, 'mock') : hurtYou ? this.#line(s, 'taunt') : lineFor(s.fighterId ?? s.temperament.toLowerCase(), 'win', this.rand, 'MIDDLE').replaceAll('{you}', this.you);
          if (this.#say(out, s, jeer || hurtYou ? 'smug' : 'joy', text, `tw-${lr.round}`, { gap: 1 }) && jeer) this.mockedYou[s.id] = lr.round;
        }
      }
      if (last && this.seats[last.playerId] && dHp(last.playerId) <= -10 && R() < 0.7) { const s = this.seats[last.playerId]; this.#say(out, s, 'frustrated', this.#line(s, 'hurt'), `h-${lr.round}`, { gap: 1 }); }
      if (top?.playerId === this.humanId && this.streakHuman >= 2) { const s = pick(this.alive(next), this.rand); if (s && R() < 0.7) this.#say(out, s, 'angry', this.#line(s, 'taunt'), `st-${lr.round}`); }
      else if (top?.playerId === this.humanId && R() < 0.35) { const s = pick(this.alive(next), this.rand); if (s) this.#say(out, s, 'frustrated', lineFor(s.fighterId ?? s.temperament.toLowerCase(), 'lose', this.rand, 'MIDDLE'), `l-${lr.round}`); }
      else if (R() < 0.22) { const s = pick(this.alive(next), this.rand); if (s) this.#say(out, s, 'confident', this.#line(s, 'talk'), `t-${lr.round}`); }
    }
    for (const p of next.players) { // HP thresholds, once each
      const s = this.seats[p.id]; if (!s) continue; const pp = prev?.players?.find((x) => x.id === p.id);
      if (p.hp <= 0 && (pp?.hp ?? 1) > 0) { this.#say(out, s, 'defeated', lineFor(s.fighterId ?? s.temperament.toLowerCase(), 'defeat', this.rand, 'MIDDLE'), `ko-${p.id}`, { force: true }); const o = pick(this.alive(next), this.rand); if (o) this.#say(out, o, 'smug', lineFor(o.fighterId ?? o.temperament.toLowerCase(), 'gloat', this.rand, 'MIDDLE'), `gl-${p.id}`, { gap: 0 }); continue; }
      if (p.hp <= 14) this.#say(out, s, 'desperate', lineFor(s.fighterId ?? s.temperament.toLowerCase(), 'desperate', this.rand, 'MIDDLE'), `d-${p.id}`, { gap: 1 });
      else if (p.hp <= 30) this.#say(out, s, 'fear', lineFor(s.fighterId ?? s.temperament.toLowerCase(), 'fear', this.rand, 'MIDDLE'), `f-${p.id}`, { gap: 1 });
      else if (p.hp <= 55) this.#say(out, s, 'worried', this.#line(s, 'hurt'), `wr-${p.id}`, { gap: 3 });
    }
    const me = next.players.find((p) => p.id === this.humanId);
    if (me && me.hp <= 25 && me.hp > 0) { const s = pick(this.alive(next), this.rand); if (s) this.#say(out, s, 'smug', lineFor(s.fighterId ?? s.temperament.toLowerCase(), 'gloat', this.rand, 'MIDDLE'), 'pred', { gap: 1 }); }
    for (const ev of next.eventLog ?? []) { // Edicts: they announce their own, and comment on yours
      if (ev.seq <= this.lastSeq) continue; this.lastSeq = Math.max(this.lastSeq, ev.seq);
      if (ev.type === 'WILDCARD_USED') {
        if (this.seats[ev.playerId]) this.#say(out, this.seats[ev.playerId], 'angry', this.#line(this.seats[ev.playerId], 'power'), `p-${ev.seq}`, { force: true });
        else if (ev.playerId === this.humanId && R() < 0.6) { const s = pick(this.alive(next), this.rand); if (s) this.#say(out, s, 'shock', lineFor(s.fighterId ?? s.temperament.toLowerCase(), 'power', this.rand, 'MIDDLE'), `hp-${ev.seq}`, { gap: 1 }); }
      }
    }
    if (next.phase === 'MATCH_COMPLETE' && !this.said.end) {
      this.said.end = true; for (const s of Object.values(this.seats)) { const won = next.winner === s.id; const o = []; this.#say(o, s, won ? 'smug' : 'defeated', lineFor(s.fighterId ?? s.temperament.toLowerCase(), won ? 'gloat' : 'defeat', this.rand, 'MIDDLE'), `end-${s.id}`, { force: true }); out.push(...o); }
    }
    return out.slice(0, 2);
  }
}
export const VOICE_IDS = Object.keys(VOICE);
