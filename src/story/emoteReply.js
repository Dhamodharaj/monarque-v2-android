// Emoji replies that read the table. A rival answers the player's emoji from what is actually happening:
// who took the last round, how much Health it cost, who leads, who is cornered, and how often the same emoji has been sent.
// The emoji says WHAT the player means (a jeer, anger, fear, a question, a threat, shock); the situation decides HOW the rival takes it:
// a kiss sent at a rival that just won the round is answered as a gloat, never as the sourness of a rival that just lost.
// Nothing here reveals hidden information: only Health, placements and damage that are already on screen.
import { E, styleOf, emojiFor } from './emotes.js';

/** What the player means by each emoji. */
export const INTENT = {
  [E.kiss]: 'taunt', [E.disdain]: 'taunt', [E.thumbsdown]: 'taunt', [E.insult]: 'taunt', [E.mock]: 'taunt', [E.crown]: 'taunt',
  [E.rage]: 'anger', [E.frustrated]: 'anger', [E.refuse]: 'anger', [E.dread]: 'fear', [E.confused]: 'confusion', [E.question]: 'confusion',
  [E.skull]: 'threat', [E.blade]: 'threat', [E.warn]: 'threat', [E.blood]: 'threat', [E.shock]: 'shock',
};
/** How the emoji is named inside a reply ({g} lower case, {G} capitalised). */
const NAME = {
  [E.kiss]: 'a kiss', [E.disdain]: 'a sneer', [E.thumbsdown]: 'a thumbs down', [E.insult]: 'an insult', [E.mock]: 'laughter', [E.crown]: 'a boast',
  [E.rage]: 'fury', [E.frustrated]: 'sulking', [E.refuse]: 'a refusal', [E.dread]: 'fear', [E.confused]: 'confusion', [E.question]: 'a question',
  [E.skull]: 'a death threat', [E.blade]: 'a challenge', [E.warn]: 'a warning', [E.blood]: 'a thirst for blood', [E.shock]: 'shock',
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** The table as the rival sees it. All inputs are public: placements, Health and the Health the last round cost.
 *  seatPlace / mePlace: finishing place in the last decided round (1 = took it), or undefined if there has been no round (or it passed). */
export function readTable({ round = 0, seatPlace, mePlace, dFoe = 0, dMe = 0, foeHp = 100, foeMax = 100, meHp = 100, meMax = 100 } = {}) {
  const foeRatio = foeMax > 0 ? foeHp / foeMax : 1, meRatio = meMax > 0 ? meHp / meMax : 1;
  const sp = seatPlace ?? Infinity, mp = mePlace ?? Infinity;
  let last = 'none';
  if (round > 0 && (sp !== Infinity || mp !== Infinity)) last = sp === 1 ? 'won' : mp === 1 ? 'lost' : sp < mp ? 'above' : sp > mp ? 'below' : 'none';
  let side = last === 'won' || last === 'above' ? 'up' : last === 'lost' || last === 'below' ? 'down' : 'even';
  if (side === 'even') side = foeHp > meHp * 1.15 ? 'up' : meHp > foeHp * 1.15 ? 'down' : 'even'; // no round yet: fall back on who has more Health
  if (foeRatio <= 0.3) side = 'low'; // a cornered rival answers from the corner, whoever took the last round
  return { round, last, side, dFoe: Math.round(-Math.min(0, dFoe)), dMe: Math.round(-Math.min(0, dMe)), foeHp: Math.round(foeHp), meHp: Math.round(meHp), foeRatio, meRatio };
}

// intent -> side -> style. Lines are in the rival's own register. {g}/{G} = the emoji's name, {you} = the player.
const S = (feral, sly, regal, still) => ({ feral, sly, regal, still });
const STANCE = {
  taunt: {
    up: S('{G} from the one I am devouring?', '{G}, {you}? Sweet of you, with the score where it is.', '{G} from the beaten. I accept it as tribute.', 'You offer {g} from beneath me.'),
    even: S('{G} already? Bold. I like my meat bold.', '{G}? Nothing is decided and you are already showing off.', '{G} before the matter is settled. Premature.', '{G}. Nothing is settled yet.'),
    down: S('Send {g} while you can. I will collect it with teeth.', 'Enjoy it, {you}. That is {g} on credit, and I collect.', '{G} for a single round. Do not mistake it for the war.', 'You hold one round. {G} will not keep it.'),
    low: S('{G}, while I bleed? Come closer and say it.', '{G} at a wounded creature, {you}? Mind the teeth.', 'You mock a wounded sovereign. Rash.', '{G}, to something with little left to lose.'),
  },
  anger: {
    up: S('Shout all you like. I am still winning.', 'Temper, {you}. It does not suit the one who is losing.', '{G} will not change the count.', '{G} changes nothing here.'),
    even: S('Save the fury for the cards.', 'So heated, and nothing is decided.', 'Compose yourself. Nothing is settled.', 'Anger is early.'),
    down: S('Angry too? Then we agree. Make it count.', 'You are angry? I am the one who lost the last round. Be gracious.', 'You rage at a round I lost. It will not happen twice.', 'We are both displeased. Only one of us will act on it.'),
    low: S('You rage at me? I am the one bleeding.', 'Peace, {you}. I am the one bleeding.', 'Save your anger. I am the one wounded.', 'Your anger is cheap. I am the one bleeding.'),
  },
  fear: {
    up: S('Yes. That is the right face for you.', 'Afraid, {you}? You are right to be.', 'Good. Fear is the first sensible thing you have shown.', 'Fear is accurate.'),
    even: S('Afraid already? We have barely begun.', 'Afraid so soon? Nothing has even happened.', 'Fear before the first blow. Interesting.', 'Fear arrives early for you.'),
    down: S('Afraid, with the last round yours? Odd.', 'Afraid, after winning the last round? How modest.', 'You won the round and still tremble. Wise.', 'You took the round and still fear me. Accurate.'),
    low: S('You fear a dying beast? Dying beasts bite.', 'Afraid of me, wounded as I am? Flattering.', 'You fear a wounded king. Rightly.', 'A wounded thing is still a thing.'),
  },
  confusion: {
    up: S('Confused? The score is simple. I am winning.', 'Still working it out, {you}? I am winning.', 'The count is plain. I lead.', 'The count is simple. I lead.'),
    even: S('Nothing to explain. Play.', 'No riddle yet, {you}. Keep playing.', 'There is nothing to ask yet. Play.', 'Nothing is hidden. Play.'),
    down: S('Yes, you took the round. Do not look so puzzled.', 'Surprised you won the round, {you}? So am I. Briefly.', 'You took a round. It happens. Do not be astonished.', 'You took a round. It happens.'),
    low: S('Puzzled? I am still standing. Barely.', 'Wondering if I am done? Not quite.', 'You wonder if I am finished. I am not.', 'Not finished.'),
  },
  threat: {
    up: S('{G}, while I lead? Make it true.', '{G} from the one behind? Adorable.', '{G} from the one behind. Noted, and ignored.', '{G}. From behind. Unlikely.'),
    even: S('{G}? Then come and take it.', '{G}, {you}? Let us see you back it.', '{G}. Then do it.', '{G}. Prove it.'),
    down: S('{G}? You won one round. That is not a promise.', 'One round, and now {g}? Do not get ahead of yourself.', 'One round does not earn {g}.', 'One round is not {g}.'),
    low: S('{G}? I am hurt, not finished. Come.', 'I am hurt, not finished. {G} may cost you.', 'Wounded, not finished. Test it.', 'Hurt is not finished. {G} may cost you.'),
  },
  shock: {
    up: S('Shocked, {you}? I am not done.', 'Shocked, {you}? You have not seen the rest.', 'Shock is warranted. The round was decisive.', 'Shock suits the situation.'),
    even: S('Shock? It has barely started.', 'Shocked already? There is more.', 'Shock, this early. Composure, {you}.', 'Shock is premature.'),
    down: S('Shocked? I am the one who lost a round.', 'Shocked that I lost a round, {you}? So am I, slightly.', 'The round was yours. Savour it briefly.', 'A round lost. A rare sight.'),
    low: S('Shocked that I still stand? So am I.', 'Surprised I am upright, {you}? So am I.', 'I am hurt and I stand. That is the lesson.', 'Still standing. Yes.'),
  },
};
const REPEAT = S('Again? Learn a new trick.', 'The same gesture again, {you}? Do vary it.', 'Repetition is not wit.', 'Again.');

// The mood the rival shows, from what the emoji means and where the table stands (feeds the emoji it answers with).
const MOOD = {
  taunt: { up: 'smug', even: 'smug', down: 'angry', low: 'angry' },
  anger: { up: 'joy', even: 'confident', down: 'frustrated', low: 'angry' },
  fear: { up: 'smug', even: 'smug', down: 'confident', low: 'confident' },
  confusion: { up: 'smug', even: 'confident', down: 'frustrated', low: 'worried' },
  threat: { up: 'confident', even: 'confident', down: 'angry', low: 'angry' },
  shock: { up: 'smug', even: 'confident', down: 'frustrated', low: 'shock' },
};

/** What the table says, in the rival's voice and in plain numbers. */
function factLine(t, you) {
  if (t.side === 'low') return t.last === 'lost' || t.last === 'below' ? `You hold ${t.meHp} Health to my ${t.foeHp}.` : `I stand at ${t.foeHp} Health.`;
  if (t.meRatio <= 0.3) return `You stand at ${t.meHp} Health.`;
  switch (t.last) {
    case 'won': return t.dMe ? `That round cost you ${t.dMe} Health.` : 'The last round was mine.';
    case 'above': return 'I placed above you last round.';
    case 'lost': return t.dFoe ? `That round cost me ${t.dFoe} Health.` : 'You took the last round.';
    case 'below': return 'You placed above me last round.';
    default: return t.foeHp !== t.meHp && t.round > 0 ? `${t.foeHp} Health to your ${t.meHp}.` : 'Nothing is decided yet.';
  }
  void you;
}

const fill = (s, emote, you) => s.replaceAll('{G}', cap(NAME[emote] ?? 'a gesture')).replaceAll('{g}', NAME[emote] ?? 'a gesture').replaceAll('{you}', you);

/** The rival's answer to `emote`, or null (a silent being sometimes says nothing).
 *  `who` = { fighterId?, isGm?, temperament? }; `table` comes from readTable(); `repeats` = how many times the player has just sent this same emoji. */
export function answerEmote({ who, emote, table, you = 'mortal', repeats = 0, rand = Math.random }) {
  const style = styleOf(who); const intent = INTENT[emote] ?? 'threat'; const t = table ?? readTable();
  if (style === 'still' && repeats < 2 && rand() < 0.15) return null; // a silent being may let it pass
  const side = t.side;
  const stance = repeats >= 3 ? REPEAT[style] : STANCE[intent][side][style];
  const mood = repeats >= 3 ? 'smug' : MOOD[intent][side];
  const text = fill(`${stance} ${repeats >= 3 ? '' : factLine(t, you)}`.trim(), emote, you);
  return { text, mood, emoji: emojiFor(who, mood, rand, true), reply: true };
}

/** Every authored reply line (with sample tokens filled in), for the dialogue hygiene tests. */
export const EMOTE_REPLY_LINES = () => {
  const out = [];
  for (const sides of Object.values(STANCE)) for (const styles of Object.values(sides)) for (const l of Object.values(styles)) for (const e of [E.kiss, E.skull, E.rage]) out.push(fill(l, e, 'mortal'));
  for (const l of Object.values(REPEAT)) out.push(fill(l, E.kiss, 'mortal'));
  return out;
};
