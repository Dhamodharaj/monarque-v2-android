// The opponent is a captive, not a bot: it speaks from appetite, pride, resignation or dread of being bound.
// Reactions derive from what the Battle engine reports (round results, HP, powers, Monarque's interventions).
// Writing rules: restrained, ancient, no catchphrases, no exclamation-heavy lines, silence is allowed.
// Monarque's speech depends on STAGE: EARLY (contempt) -> MIDDLE (unease) -> BERSERKER (hubris) -> BOUT_1/2/3 (fracturing).
import { FIGHTER_BY_ID } from './roster.js';
import { EDICTS, ENGINE_EFFECT } from '../data/monarque.generated.js';
import { emojiFor } from './emotes.js';
import { answerEmote, readTable, EMOTE_REPLY_LINES } from './emoteReply.js';
import { isMocking, mockLine, paybackLine, sourLine, MOCKERY_LINES } from './mockery.js';
import { EXTRA_G, EXTRA_C, EXTRA_MONARQUE, ALL_EXTRA_LINES, fresh } from './voiceBank.js';

// Text glyphs (not emoji) so the mood badge reads as an etched sigil.
export const MOODS = {
  confident: { icon: '⚔︎', tone: 'cool' }, joy: { icon: '✠︎', tone: 'hot' }, smug: { icon: '♛︎', tone: 'hot' },
  frustrated: { icon: '✖︎', tone: 'warn' }, angry: { icon: '⚡︎', tone: 'warn' }, shock: { icon: '✦︎', tone: 'warn' },
  worried: { icon: '☽︎', tone: 'cold' }, fear: { icon: '☾︎', tone: 'cold' }, desperate: { icon: '⌛︎', tone: 'cold' },
  defeated: { icon: '☠︎', tone: 'cold' }, awed: { icon: '✦︎', tone: 'cool' },
};

// One bank per temperament. A temperament is a lens on how a being wins, loses and fears the Binding, never a moral label.
const G = {
  SOVEREIGN: {
    intro: ['I was obeyed before your line had a name.', 'Kneel to the rite, or be cut from it.', 'A crown is not given. It is held.'],
    win: ['The order is kept.', 'As it should be.', 'You were permitted to stand. Now you are not.'],
    lose: ['Noted.', 'A single stone. The wall remains.', 'You will answer for that.'],
    fear: ['A sovereign does not become a card.', 'I will not be shelved among the lesser.', 'My name is not yours to bind.'],
    desperate: ['Then let the crown burn with me.', 'Leave me one breath of command.'],
    power: ['You wear a dead being’s authority. It does not fit.', 'Borrowed Essence. It shows.'],
    gloat: ['Rest. You served.', 'It is finished. Do not mistake it for mercy.'],
    cry: ['Witness.', 'By my name.', 'Be ordered.'],
    taunt: ['You hold nothing I did not once discard.', 'Look upon what you reach for.'],
    defeat: ['So the throne is taken from me.', 'Bind me, then. Do it quietly.'],
  },
  DECEIVER: {
    intro: ['Do sit. I have already read your hand.', 'Every door here opens inward. Mind the second one.', 'You will not know when the game began.'],
    win: ['Was it not obvious?', 'You chose well. I let you.', 'A small truth, offered at the right hour.'],
    lose: ['How careless of me. Or of you.', 'Let it stand. I prefer you hopeful.', 'You counted wrong. Count again.'],
    fear: ['A card cannot lie. That is the horror of it.', 'Do not seal me. I am more useful speaking.', 'Name your price. There is always a price.'],
    desperate: ['Every mask I own is failing.', 'One more turn of the story. Grant me that.'],
    power: ['A real power, or a convincing one?', 'You took it from the dead. They kept no secrets from you.'],
    gloat: ['I told you nothing false. That was the trick.', 'Sleep. The truth keeps.'],
    cry: ['Look away.', 'Here is the lie that is true.', 'Behind you.'],
    taunt: ['You are easy to read.', 'Do you trust your own hand?'],
    defeat: ['A story ends. How rude.', 'Even I did not foresee my silence.'],
  },
  DEVOURER: {
    intro: ['I have been hungry for longer than your gods.', 'You smell of marrow.', 'Closer. I will not ask twice.'],
    win: ['More.', 'It was not enough. It is never enough.', 'Bleed a little longer.'],
    lose: ['You taste of something. I will remember.', 'Hunger is patient. So am I.', 'That wound will be returned.'],
    fear: ['Do not bind me. Hunger does not end, it only sleeps.', 'I will not be small. I will not be small.', 'Do not close the seal.'],
    desperate: ['Then I devour the table and the hand upon it.', 'Everything I have left. Everything.'],
    power: ['I will have that power out of you.', 'You wear their bones. I know the taste.'],
    gloat: ['Fed. For an hour.', 'Another name, swallowed.'],
    cry: ['Open.', 'Feed me.', 'Break upon it.'],
    taunt: ['You are slowing.', 'I hear your heart. It is loud.'],
    defeat: ['Hunger. Only hunger. Now silence.', 'I was not made to be a card.'],
  },
  ANCIENT: {
    intro: ['I have watched kingdoms settle into dust. Begin.', 'You are brief. I am not.', 'There is no hurry. There never was.'],
    win: ['It was always going to be so.', 'The stone does not rejoice.', 'Noted. Continue.'],
    lose: ['A ripple. It will pass.', 'The river bends around you, then straightens.', 'So.'],
    fear: ['Even stone is bound, in time.', 'I have forgotten what it was to end.', 'I do not wish to be a name on a card.'],
    desperate: ['The patient thing wakes at last.', 'Spend it. Spend all of it.'],
    power: ['An old power, worn thin. I remember its owner.', 'You carry them well. For now.'],
    gloat: ['It is done. Time continues.', 'Sleep. I will keep the hour.'],
    cry: ['Remember this.', 'Let it fall as it fell before.', 'Be still.'],
    taunt: ['You will be dust by the next turning.', 'I have outlasted better.'],
    defeat: ['At last, something that ends me.', 'Let the name be spoken correctly, at least.'],
  },
};

// Signature lines [win, lose, fear, defeat] for each of the 32 contenders. Short, specific, no catchphrases.
const SIG = {
  apep: ['Swallowed once. Swallowed nightly.', 'Cut open again. I have done this before.', 'Not the sun-boat. Not this.', 'Let the night forget my name.'],
  mictlantecuhtli: ['Nine levels. You are on the first.', 'A cold stair, nothing more.', 'I keep the count. You are in it.', 'Down. Always down.'],
  coatlicue: ['The skirt is full. Come closer.', 'A serpent loosed. Another comes.', 'Even a mother is afraid of what she bears.', 'Bury me with the others.'],
  kali: ['Drink. Do not stop.', 'The garland loses a skull. It will gain two.', 'I have been called the end before.', 'Let the dance finish.'],
  'baron-samedi': ['A hat tipped. A door opened.', 'A bad hand. I have worse friends.', 'The crossroads keep my accounts.', 'Bury me standing.'],
  balor: ['The eye opens. Look away.', 'A lid half-closed. A mistake.', 'I was foretold. So were you.', 'The eye goes dark.'],
  'the-cailleach': ['Winter keeps its word.', 'A thaw. It will not last.', 'Spring is a rumour. I am the weather.', 'Let the frost have me.'],
  surtr: ['I carry the fire myself.', 'Ash on the blade. Fine.', 'The end is early. I am not ready.', 'Burn the world. I will light it.'],
  asmodeus: ['Three heads agree. That is rare.', 'One head wanted this.', 'All three of us are afraid.', 'Three mouths, one last word.'],
  baphomet: ['Above, below. You are below.', 'A paradox cut in half.', 'The torch gutters.', 'As above. As below. Finished.'],
  samael: ['The venom was patient.', 'Blind, and still I struck true.', 'I cannot see the end. I feel it.', 'Judge me, then.'],
  ravana: ['Ten plans. One of them was this.', 'Nine heads were not enough.', 'A head falls. Another sees it.', 'Ten crowns, and none of them mine.'],
  'azi-dahaka': ['The chain slackens, a little.', 'Tighter. Fine.', 'The mountain trembles.', 'Hold the chain. Do not let go.'],
  'jeoseung-saja': ['Your name is on the list.', 'A name crossed out. By whom?', 'The list is longer than I thought.', 'Close the book.'],
  perchta: ['Idle hands. Open belly.', 'A stitch comes loose.', 'Straw does not bleed. I do.', 'Fill me, then.'],
  camazotz: ['Quick. Quiet. Done.', 'A wing torn. It will heal in the dark.', 'Light. I hate the light.', 'The dark takes me back.'],
  briareus: ['A hundred hands. None missed.', 'One hand lost. Ninety-nine remain.', 'Every stone I threw returns.', 'Let the hundred rest.'],
  chiyou: ['Bronze does not bend.', 'A horn cracked. I invented war. I can take it.', 'Four eyes, and none saw this.', 'The helm comes off.'],
  hecate: ['Three roads. You took the wrong one.', 'A torch gutters. I carry another.', 'Do not lock the crossing. I live there.', 'The hounds will keep the road when I am gone.'],
  'baba-yaga': ['Wrong answer, little traveller.', 'The pot spits. I will stir it again.', 'Do not turn the hut to face the forest.', 'Even the old witch is eaten, in time.'],
  izanami: ['Come down to the dark with me.', 'The living are stubborn. Not for long.', 'Do not look at me. You once did, and it was your mistake.', 'A thousand a day, and one is enough to end me.'],
  'shuten-doji': ['A drink for the guest. A bone for the host.', 'Ha. A fine cup, spilled.', 'Not the poisoned wine again.', 'Well. The feast is over.'],
  typhon: ['The mountain shakes. That is me.', 'Wounded. A hundred heads, and one is bleeding.', 'Not Etna again. Not the weight.', 'Bury me. I will rise again. I always rise.'],
  tiamat: ['The sea does not forgive.', 'Cut. Salt closes the wound.', 'Do not split me for your sky.', 'Take the pieces. Make what you will of them.'],
  lucifer: ['I fell, and I rose. Kneel.', 'A flaw in the light. I will correct it.', 'Not the dark again. I have seen it.', 'It was pride. It was always pride. It was worth it.'],
  beelzebub: ['The flies know. They always know.', 'A wing torn. There are more.', 'Spray the fire. Spray the sky. They will return.', 'Let the swarm have what is left.'],
  nyx: ['Night. It was here first.', 'A star, struck out. Another opens.', 'Even I do not wish to be seen at dawn.', 'Sleep, then. My children will keep watch.'],
  thanatos: ['I am never late.', 'A delay. Only that.', 'I do not hurry, and still I am afraid.', 'Quietly, then.'],
  hades: ['Order is a mercy.', 'The scale tips and returns.', 'Even the unseen are counted.', 'Take the throne. It is heavy and unloved.'],
  'the-reaper': ['A name drawn. It was yours.', 'The glass runs. It was only ever running.', 'No one has refused me before. No one has needed to.', 'Put the scythe down. I am so tired of the harvest.'],
  hel: ['The dead keep better accounts.', 'Cold, yes. Not finished.', 'I am the place the dead go. Where does a place go?', 'The door was always mine to close. It closes.'],
  osiris: ['Pieced together. Still a king.', 'Torn again. I am used to it.', 'Put me back. Again.', 'The scales have the last word.'],
};

// Round 6: the Berserker. A sealed warrior with a third of Monarque's raw power forced into them: pure, ravenous rage.
const BERSERKER = {
  intro: ['Blood. I can smell it. I am so hungry.', 'Who are you? It does not matter. Break.'],
  win: ['MORE.', 'Break. Break. Break.'],
  lose: ['You bit me. I will bite back.', 'Pain. Good. More.'],
  fear: ['He put too much in me. It will not stop.', 'It is burning. Burning.'],
  desperate: ['Kill me or let me kill. Anything.', 'It is too much. TOO MUCH.'],
  power: ['Mine. All of it. Mine.', 'It answers. It roars.'],
  gloat: ['Did I do that? I do not remember.', 'Quiet now. Quiet.'],
  cry: ['AAARGH.', 'Burn.'],
  taunt: ['Come closer. I cannot stop.', 'Run, little thing.'],
  defeat: ['Thank you. It stops. It finally stops.', 'Take it. Take what he put in me.'],
};

// Monarque by stage. He is a proud, arrogant sovereign and the strongest being the Outburst ever made. He wants a champion, so he
// jeers at weakness, approves of growth with the pride of an owner, and never once admits doubt or fear. The Berserker stage is
// hubris. The final bouts are a king at full, ferocious pride; the Essence only shows as a flicker he immediately overrides.
const MONARQUE = {
  EARLY: {
    intro: ['Pathetic. Know your place.', 'Another insect who thinks it can stand before me.'],
    win: ['As expected.', 'Is that all you carry?'], lose: ['A scratch. Nothing more.', 'Luck. Do not mistake it for skill.'],
    fear: ['Fear is for lesser things.'], desperate: ['Show me more than this.'], power: ['A borrowed trick. Keep your toys.', 'Hmph. A bit of spark, at least.'],
    gloat: ['Rot, then.'], cry: ['Proceed.'], taunt: ['Is that all?', 'Stand up. I have not yet been entertained.'], defeat: ['Hmph. Another card for my Gallery.'],
    gift: ['Take it. I wish to see what a worm does with a gift.'], whim: ['A little variety, for my amusement.'], omen: ['The conditions change at my pleasure.'],
    playerWin: ['Adequate.'], playerLow: ['Do not fall yet. I am not finished with you.'],
  },
  MIDDLE: {
    intro: ['You grow. I permit it. Show me more.', 'Again. Prove the last round was no fluke.'],
    win: ['Naturally. I did not expect you to keep up.', 'You are better than before. You are still beneath me.'], lose: ['Good. That one landed. Do it again.', 'You are sharpening. I approve.'],
    fear: ['I fear nothing. Strike harder.'], desperate: ['Do not stop now. I want your best.'], power: ['That power is yours now. Make it count.', 'You wear it well. Do not let it dull.'],
    gloat: ['Stay as you are. Hungry.'], cry: ['Go on.'], taunt: ['Yield nothing. Become more.', 'Do not grow comfortable.'], defeat: ['Rise. I did not choose you to end here.'],
    gift: ['Take it. Grow stronger. That is an order.'], whim: ['A correction. Climb through it.'], omen: ['Be steady. Strength is forged under weight.'],
    playerWin: ['Yes. That is the shape of a champion.'], playerLow: ['Rise. This is not the end.'],
  },
  BERSERKER: {
    intro: ['Let us see how you handle this one.', 'Beat him, and your freedom is yours.'],
    win: ['That is what a third of me looks like.', 'Good. Tear at him.'], lose: ['Hold. He is mine, and he will hold.', 'He bleeds, but he does not break.'],
    fear: ['Only a third of my power, and look at him.'], desperate: ['Beast. Finish it.'], power: ['Borrowed strength. Mine to lend, mine to recall.'],
    gloat: ['If you survive this beast, I will gladly accept your challenge.'], cry: ['Rage.'], taunt: ['Survive him. I dare you.'], defeat: ['…Impressive. Do not let it go to your head.'],
    gift: ['Take it. See what it buys you.'], whim: ['Intended. All of it was intended.'], omen: ['The conditions turn. Watch.'],
    playerWin: ['Hm. Impressive. Do not let it go to your head.'], playerLow: ['Do not die on him. Not yet.'],
  },
  BOUT_1: {
    intro: ['You reached me. As I intended.', 'Come. Show me what I have made.'],
    win: ['Yes. As I willed.', 'Mine. All of it.'], lose: ['A scratch. Strike again.', 'Better. Again.'],
    fear: ['A creation cannot unmake its maker.'], desperate: ['Enough games. Kneel.'], power: ['A borrowed spark. I have lent stars.', 'Hm. Not entirely without merit.'],
    gloat: ['Rise. Try again.'], cry: ['Behold.'], taunt: ['Struggle. It only sweetens the harvest.'], defeat: ['Rise. I am not done with you.'],
    gift: ['Take it. I want you at your peak.'], whim: ['The table is set.'], omen: ['Let the conditions turn.'],
    playerWin: ['Good. You have the strength I demanded.'], playerLow: ['Get up. I did not bring you here to die.'],
  },
  BOUT_2: {
    intro: ['Again. Better. Show me.', 'You are stronger than the last time. Good.'],
    win: ['Mine. It was always mine.', 'Of course. Did you expect otherwise?'], lose: ['Who taught you that? I did. Well done.', 'You wound a god. Remember it.'],
    fear: ['I do not fear. I anticipate.'], desperate: ['Enough. Show me everything.'], power: ['I know that power. I gave you the chance to take it.', 'Whose? Mine, once. Now yours. Use it.'],
    gloat: ['Rise. I said rise.'], cry: ['Behold what you will become.'], taunt: ['You are very like me. That is why you will do.'], defeat: ['Again. I will not tire of this.'],
    gift: ['Take it. Do not die in my hands without it.'], whim: ['The table bends to me.'], omen: ['The hour turns. It turns for me.'],
    playerWin: ['Good. Exactly so.'], playerLow: ['Do not die. I have waited too long.'],
  },
  BOUT_3: {
    intro: ['This is the strength I wanted. Begin.', 'The last of you. Show me all of it.'],
    win: ['I am Monarque. I do not lose.', 'Mine. As it was always going to be.'], lose: ['You dare. Good. Again.', 'Hm. My focus slips. It will not slip twice.'],
    fear: ['What is the word you want, fear? I have no use for it.'], desperate: ['I will not be undone. Not by my own creation.'], power: ['Mine. It was mine. It is still mine.', 'Take it, then. I will take it back.'],
    gloat: ['I do not forget what I take.'], cry: ['Hold.'], taunt: ['Finish it. If you can.', 'You are my masterwork. Do not shame me.'], defeat: ['Impossible. I am the crown of the Outburst.'],
    gift: ['Take it. Show me everything.'], whim: ['Whose turn? Mine. It is always mine.'], omen: ['It turns. I turn it.'],
    playerWin: ['Yes. Yes. Be worthy of me.'], playerLow: ['Stay on your feet. I want you standing.'],
  },
};
// The old grouping name for the story-stage lookup used by the screens.
export const MONARQUE_STAGES = Object.keys(MONARQUE);

const pickOf = (arr, rand = Math.random) => arr[Math.floor(rand() * arr.length)];
const ENGINE_TO_EDICT = Object.fromEntries(EDICTS.map((e) => [ENGINE_EFFECT[e.effectId], e]));
const FRAYING = new Set(['BOUT_1', 'BOUT_2', 'BOUT_3']);

/** The supplied Edict line for the stage: `early` while he is composed, `fraying` once control is failing. */
export function edictLine(engineEffectId, stage) {
  const e = ENGINE_TO_EDICT[engineEffectId];
  if (!e?.monarqueLines) return null;
  return FRAYING.has(stage) ? e.monarqueLines.fraying : e.monarqueLines.early;
}

/** Monarque's own line for a situation at a stage. */
export function monarqueLine(kind, stage = 'EARLY', rand = Math.random) {
  const key = MONARQUE[stage] ? stage : 'EARLY'; const bank = MONARQUE[key]; const k = bank[kind] ? kind : 'intro';
  return fresh(`gm:${key}:${k}`, [...bank[k], ...(EXTRA_MONARQUE[key]?.[k] ?? [])], rand);
}

/** Line for a contender. `kind` in intro|win|lose|fear|desperate|power|gloat|cry|taunt|defeat. */
export function lineFor(fighterId, kind, rand = Math.random, stage = 'MIDDLE') {
  if (fighterId === 'monarque' || fighterId == null) return monarqueLine(kind, stage, rand);
  const f = FIGHTER_BY_ID[fighterId]; const grp = G[f?.temperament ?? 'SOVEREIGN'];
  if (stage === 'BERSERKER' && rand() < 0.6) return fresh(`bz:${kind}`, BERSERKER[kind] ?? BERSERKER.intro, rand);
  const sig = SIG[fighterId]; const idx = { win: 0, lose: 1, fear: 2, defeat: 3 }[kind];
  if (sig && idx != null && rand() < 0.6) return fresh(`${fighterId}:sig:${kind}`, [sig[idx], ...(EXTRA_C[fighterId]?.[kind] ?? [])], rand);
  const tmp = f?.temperament ?? 'SOVEREIGN'; const k = grp[kind] ? kind : 'intro';
  return fresh(`${tmp}:${k}`, [...grp[k], ...(EXTRA_G[tmp]?.[k] ?? [])], rand);
}
export const ALL_DIALOGUE = () => [
  ...Object.values(G).flatMap((g) => Object.values(g).flat()), ...Object.values(SIG).flat(),
  ...Object.values(BERSERKER).flat(), ...Object.values(MONARQUE).flatMap((s) => Object.values(s).flat()),
  ...ALL_EXTRA_LINES(), ...MOCKERY_LINES(), ...EMOTE_REPLY_LINES(),
];
export const SIG_IDS = Object.keys(SIG);

/** Stateful tracker. observe(prevView, nextView) -> reactions to show. One instance per duel. */
export class ReactionTracker {
  constructor({ fighterId, isGm = false, foeId = 'player-2', meId = 'player-1', rand = Math.random, stage = 'MIDDLE' }) {
    Object.assign(this, { fighterId, isGm, foeId, meId, rand, stage });
    this.mood = 'confident'; this.powersSeen = 0; this.said = {}; this.streak = { foe: 0, me: 0 }; this.round = 0; this.lastSpeak = -9;
  }
  #say(out, mood, text, key, force = false) {
    if (!force && this.said[key]) return; this.said[key] = true;
    this.lastSpeak = this.round; this.mood = mood; out.push({ mood, text, emoji: emojiFor({ fighterId: this.fighterId, isGm: this.isGm }, mood, this.rand), who: this.isGm ? 'gm' : 'foe', id: `${key}-${Math.random().toString(36).slice(2, 6)}` });
  }
  /** The player tapped the bubble and sent `emote`: the foe answers from what is actually happening in the duel (who took the last round,
   *  what it cost, who leads, who is cornered), some of the time silently ignoring it if it is a still being (null = ignored).
   *  `extra` = { foeHp, foeMax, meHp, meMax }, the Health already on screen. */
  react(emote, hpRatio = 1, extra = {}) {
    const who = { fighterId: this.fighterId, isGm: this.isGm };
    if (isMocking(emote)) this.mockedBy = this.round; // it remembers a jeer, even if it says nothing now
    const now = Date.now(); const prev = this.sentLast; this.sentLast = { e: emote, at: now, n: prev && prev.e === emote && now - prev.at < 30000 ? prev.n + 1 : 1 };
    if (now - (this.lastReplyAt ?? 0) < 3500) return null; this.lastReplyAt = now;
    const li = this.lastInfo ?? {}; const foeMax = extra.foeMax ?? 100, meMax = extra.meMax ?? 100;
    const table = readTable({ round: li.round ?? 0, seatPlace: li.seatPlace, mePlace: li.mePlace, dFoe: li.dFoe ?? 0, dMe: li.dMe ?? 0, foeHp: extra.foeHp ?? hpRatio * foeMax, foeMax, meHp: extra.meHp ?? meMax, meMax });
    const r = answerEmote({ who, emote, table, you: 'mortal', repeats: this.sentLast.n, rand: this.rand }); if (!r) return null;
    this.mood = r.mood; return { mood: r.mood, text: r.text, emoji: r.emoji, reply: true, who: this.isGm ? 'gm' : 'foe', id: `re-${Math.random().toString(36).slice(2, 7)}` };
  }
  intro() {
    const out = []; const t = this.isGm ? monarqueLine('intro', this.stage, this.rand) : lineFor(this.fighterId, 'intro', this.rand, this.stage);
    this.#say(out, 'confident', t, 'intro'); return out;
  }
  observe(prev, next) {
    const out = []; const foe = next.players.find((p) => p.id === this.foeId); const me = next.players.find((p) => p.id === this.meId);
    const pf = prev?.players?.find((p) => p.id === this.foeId); const pm = prev?.players?.find((p) => p.id === this.meId);
    if (!foe || !me) return out;
    const L = (kind) => (this.isGm ? monarqueLine(kind, this.stage, this.rand) : lineFor(this.fighterId, kind, this.rand, this.stage));
    const lr = next.lastRound;
    if (lr && lr.round !== this.round && lr.placements?.length) {
      this.round = lr.round; const top = lr.placements.find((p) => p.place === 1 && !p.card?.isPass);
      const pl = (id) => lr.placements.find((p) => p.playerId === id && !p.card?.isPass)?.place; this.lastInfo = { round: lr.round, seatPlace: pl(this.foeId), mePlace: pl(this.meId), dFoe: lr.deltas?.[this.foeId]?.hp ?? 0, dMe: lr.deltas?.[this.meId]?.hp ?? 0 };
      const dFoe = lr.deltas?.[this.foeId]?.hp ?? 0, dMe = lr.deltas?.[this.meId]?.hp ?? 0;
      const who = { fighterId: this.fighterId, isGm: this.isGm }; const you = (t) => t.replaceAll('{you}', 'mortal');
      if (top?.playerId === this.foeId) {
        this.streak.foe++; this.streak.me = 0;
        const big = dMe <= -10 || this.streak.foe >= 2; const owed = this.round - (this.mockedBy ?? -9) <= 3;
        if (owed && this.rand() < 0.9) { this.mockedBy = null; this.mockedYou = lr.round; this.#say(out, 'joy', you(paybackLine(who, this.rand)), `pb-${lr.round}`); }
        else if (big || (this.rand() < 0.85 && lr.round - this.lastSpeak >= 1)) {
          const jeer = this.rand() < 0.65; if (jeer) this.mockedYou = lr.round;
          this.#say(out, jeer || this.streak.foe >= 3 ? 'smug' : 'joy', jeer ? you(mockLine(who, this.rand, this.stage)) : this.streak.foe >= 3 && this.rand() < 0.5 ? L('taunt') : L('win'), `win-${lr.round}`);
        }
      } else if (top?.playerId === this.meId) {
        this.streak.me++; this.streak.foe = 0;
        const big = dFoe <= -10 || this.streak.me >= 2;
        if (lr.round - (this.mockedYou ?? -9) <= 1 && this.rand() < 0.85) { this.mockedYou = null; this.#say(out, 'angry', you(sourLine(who, this.rand)), `sour-${lr.round}`); }
        else if (big || (this.rand() < 0.7 && lr.round - this.lastSpeak >= 2)) this.#say(out, this.streak.me >= 3 ? 'angry' : 'frustrated', L('lose'), `lose-${lr.round}`);
        else this.mood = 'frustrated';
      }
    }
    // fear of becoming a card, as HP drains
    const hp = foe.hp;
    if (hp <= 50 && !this.said.worried && !this.isGm) this.#say(out, 'worried', L('lose'), 'worried');
    if (hp <= 30 && !this.said.fear) this.#say(out, 'fear', L('fear'), 'fear');
    if (hp <= 14 && !this.said.desperate) this.#say(out, 'desperate', L('desperate'), 'desperate');
    if (me.hp <= 25 && !this.said.predator) this.#say(out, 'smug', this.isGm ? monarqueLine('playerLow', this.stage, this.rand) : L('gloat'), 'predator');
    // powers and GM
    for (const ev of next.eventLog ?? []) {
      if (ev.seq <= (this.lastSeq ?? 0)) continue; this.lastSeq = Math.max(this.lastSeq ?? 0, ev.seq);
      if (ev.type === 'WILDCARD_USED' && ev.playerId === this.meId && (this.powersSeen++ === 0 || this.rand() < 0.6)) this.#say(out, 'shock', L('power'), `pow-${ev.seq}`);
      if (ev.type === 'WILDCARD_USED' && ev.playerId === this.foeId && ev.detail?.story?.name) {
        out.push({ kind: 'callout', mood: 'angry', text: ev.detail.story.name, id: `call-${ev.seq}` }); this.mood = 'angry';
        if (!this.isGm && this.rand() < 0.65) this.#say(out, 'angry', L('cry'), `cry-${ev.seq}`);
      }
      if (this.isGm && ev.type === 'WILDCARD_USED' && ev.playerId === this.foeId) {
        const el = edictLine(ev.effectId, this.stage); if (el) this.#say(out, FRAYING.has(this.stage) ? 'desperate' : 'confident', el, `edict-${ev.seq}`, true);
      }
      if (this.isGm && ev.type === 'GM_POWER') this.#say(out, 'confident', monarqueLine(ev.effectId === 'GM_GIFT' ? 'gift' : 'whim', this.stage, this.rand), `gm-${ev.seq}`);
      if (this.isGm && ev.type === 'CRAZY_ROUND') this.#say(out, 'confident', monarqueLine('omen', this.stage, this.rand), `omen-${ev.seq}`);
    }
    if (pf && pm && !out.length) { /* silent beat: mood only */ }
    if (next.phase === 'MATCH_COMPLETE') {
      this.said.fear = false; const foeWon = next.winner === this.foeId;
      this.#say(out, foeWon ? 'smug' : 'defeated', L(foeWon ? 'gloat' : 'defeat'), 'end', true);
    }
    return out;
  }
}
