// Mockery: every contender jeers in its own voice. Lines never reveal hidden information (no cards, no calls).
// Also holds the "grudge" lines: payback when you mocked a rival and it later wins, and sourness when it mocked you and you win the next round.
// `{you}` is replaced by the human's seat name by the caller.
import { styleOf, E } from './emotes.js';
import { EXTRA_C, fresh } from './voiceBank.js';

/** Emoji that read as a jeer when the player sends them. */
export const MOCKING = new Set([E.kiss, E.disdain, E.thumbsdown, E.insult, E.mock, E.skull]);
export const isMocking = (emote) => MOCKING.has(emote);

const MOCK = {
  apep: ['Is that all? I have swallowed suns with more bite.', 'You flail like a boat in my coils, {you}.'],
  mictlantecuhtli: ['Only the first level and already you tire, {you}.', 'I have seen kings climb down slower, and with more grace.'],
  coatlicue: ['Little one, is that how you hold a card?', 'My serpents are laughing. Do you hear them, {you}?'],
  kali: ['Dance faster, {you}. You trip like a mourner.', 'Is that fear or footwork? I cannot tell.'],
  'baron-samedi': ['Ha! {you}, you play like a man who has never been to a funeral.', 'Save me a seat? No, no. I will save yours. Front row, below.'],
  balor: ['I keep my eye shut and still you stumble.', 'A mouse with a card. How brave, {you}.'],
  'the-cailleach': ['Shivering, {you}? It is only spring.', 'You rush, like all things that melt.'],
  surtr: ['A spark pretending to be a flame.', 'Cute, {you}. Do it again, I want to see the ash.'],
  asmodeus: ['Three heads, and all three are laughing at you.', 'A lovely play, {you}. For the other side.'],
  baphomet: ['You have it exactly backwards, {you}. Do carry on.', 'Above or below, you are still the fool.'],
  samael: ['Blind as I am, I saw that mistake.', 'Your hand is as poor as your venom is weak.'],
  ravana: ['Ten heads, {you}, and none of them needed for you.', 'Did you plan that? Ten of me say no.'],
  'azi-dahaka': ['Chained, and still I outplay you, {you}.', 'Do you rest between blunders, or are they continuous?'],
  'jeoseung-saja': ['I regret to inform you: that was your best turn.', 'Your name is on the list, {you}. In the margin, for comic relief.'],
  perchta: ['Idle hands, {you}. And idle wits.', 'That play was sloppy. I will mend it with shears.'],
  camazotz: ['Squeak, {you}. Louder. I like it.', 'You smell nervous. It is delicious.'],
  briareus: ['A hundred hands, and you could not hold one card.', 'Is that your strongest throw, {you}?'],
  chiyou: ['I invented war, {you}. You are still learning to hold a stick.', 'Bronze laughs at your tin.'],
  hecate: ['Wrong road again, {you}. I will not mention it. Often.', 'Three paths, and you chose the one with the dogs.'],
  'baba-yaga': ['Hee, the little {you} thinks it can play!', 'Pot is warm. You are the soup, dearie.'],
  izanami: ['Your hands shake, {you}. How lovely.', 'A thousand a day. You are tomorrow’s first.'],
  'shuten-doji': ['Ha ha, a fine joke, {you}. Do pour another!', 'You fight like you drink: badly and with regret!'],
  typhon: ['Is the sky falling? No. It is only you, {you}.', 'A gnat bites a mountain. Amusing.'],
  tiamat: ['A drop in my sea, {you}. A small, loud drop.', 'The deep is not impressed.'],
  lucifer: ['Do try again, {you}. I have time, and a throne.', 'Almost a good play. Almost is a fine epitaph.'],
  beelzebub: ['The flies are laughing, {you}. All of them.', 'Even the swarm would not touch that play.'],
  nyx: ['Hush, {you}. Even the dark heard that blunder.', 'A star burned out. It was your turn.'],
  thanatos: ['I do not rush, {you}. You are not worth the haste.', 'Gently now. It only hurts if you keep trying.'],
  hades: ['Every coward arrives at my table, {you}. You will be early.', 'A poor hand. Even the shades pity you.'],
  'the-reaper': ['A grain of sand, {you}. A very small grain.', 'You were not worth the harvest, only the weeding.'],
  hel: ['Cold in my hall, {you}. Colder in your hand.', 'Even the dead play better. I have checked.'],
  osiris: ['Your heart is heavy, {you}. With bad decisions.', 'The scales laugh, too. Quietly.'],
};

// Fallback by style, for seats that are not a named contender.
const STYLE_MOCK = {
  feral: ['Is that all you bleed, {you}?', 'Squeal again. I liked it.'], sly: ['Oh, {you}, you played that so honestly.', 'How brave. How very, very brave.'],
  regal: ['You mistake effort for worth, {you}.', 'Kneel sooner. It will hurt less.'], still: ['You hurry, {you}. It shows.', 'So loud, for something so brief.'],
};
const PAYBACK = {
  feral: ['You laughed last round, {you}. Laugh now.', 'Say it again with my teeth in you.', 'Now who is bleeding for the joke?'],
  sly: ['Hm? No laughter now, {you}?', 'I let you laugh. It makes the fall so much sweeter.', 'Do remind me what was funny. I seem to have forgotten.'],
  regal: ['You presumed to mock me. The order is restored.', 'Laugh, {you}. Now kneel.', 'That is what mockery costs a sovereign.'],
  still: ['You laughed. The stone did not.', 'Quiet now, {you}.', 'The river does not forget a splash.'],
};
const SOUR = {
  feral: ['You laughed. I will remember the sound.', 'Keep laughing. I will keep your jaw.', 'A lucky bite. Enjoy the taste.'],
  sly: ['Laugh while it lasts. I enjoy a hopeful audience.', 'A good joke. I will return it, with interest.', 'Oh, how delightful. Do it again.'],
  regal: ['A jest at my expense. You will pay the ransom.', 'Enjoy the round. It is borrowed.', 'You laugh at a throne. Thrones remember.'],
  still: ['A ripple. It will be answered.', 'Laugh. It will be a short habit.', 'So. You have a sense of humour. It will not outlast you.'],
};
// Monarque: contemptuous while you are weak, arrogant and pleased when you are strong, and always sure he is above you.
const GM = {
  mock: { EARLY: ['Is that the best you can do?', 'Do try to entertain me.', 'You amuse me. Briefly.'], MIDDLE: ['You think you are strong? Good. Prove it.', 'Keep that confidence. It suits you, for now.'], BERSERKER: ['He will enjoy you.', 'Run. It is more entertaining.'], FRAY: ['Laugh. Go on. I made the joke you are living.', 'Pathetic. Pathetic. And still I will take you.'] },
  payback: ['Laugh now. I said, laugh.', 'You mocked a god. Remember it.'], sour: ['Enjoy it. It is the last thing you will enjoy.', 'A lucky round. Do not frame it.'],
};
const gmKey = (stage) => (/^BOUT/.test(stage ?? '') ? 'FRAY' : GM.mock[stage] ? stage : 'EARLY');
const pick = (arr, rand, key) => (key ? fresh(key, arr, rand) : arr[Math.floor(rand() * arr.length)]);

/** `who` = { fighterId?, temperament?, isGm? }. */
export function mockLine(who, rand = Math.random, stage = 'MIDDLE') {
  if (who.isGm) return pick(GM.mock[gmKey(stage)], rand, `gm:mock:${gmKey(stage)}`);
  const own = MOCK[who.fighterId]; const st = styleOf(who);
  return own && rand() < 0.85 ? pick([...own, ...(EXTRA_C[who.fighterId]?.mock ?? [])], rand, `${who.fighterId}:mock`) : pick(STYLE_MOCK[st], rand, `${st}:mock`);
}
export const paybackLine = (who, rand = Math.random) => (who.isGm ? pick(GM.payback, rand) : pick(PAYBACK[styleOf(who)], rand, `${styleOf(who)}:payback`));
export const sourLine = (who, rand = Math.random) => (who.isGm ? pick(GM.sour, rand) : pick(SOUR[styleOf(who)], rand, `${styleOf(who)}:sour`));
export const MOCKERY_FIGHTERS = Object.keys(MOCK);
export const MOCKERY_LINES = () => [...Object.values(MOCK).flat(), ...Object.values(EXTRA_C).flatMap((c) => c.mock), ...Object.values(STYLE_MOCK).flat(), ...Object.values(PAYBACK).flat(), ...Object.values(SOUR).flat(), ...Object.values(GM.mock).flat(), ...GM.payback, ...GM.sour];
