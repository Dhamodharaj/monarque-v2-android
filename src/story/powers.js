// Story powers. ONE power per contender, and it is one of Monarque's Edicts made personal:
// every power is a base Edict (its `family`, the engine's original wild-card effect) enhanced with a rider.
// In a duel it is simply a wild card in the hand (one per round, same rules, same sheet, same AI).
// Step I/II/III (from wins) strengthens the rider and trims the Soul price. The Steps read as Resistance / Adaptation / Stability.
//
// The supplied rows (data-src/contender_powers_rows.js) use Monarque effect ids and the field names `soul` / `oppSoul`.
// The engine reads the original `ki` / `oppKi` rider fields and its original effect ids, so P() adapts both.
// Soul IS the engine's Ki reserve under another name: same values, same caps, same costs.
import { WILDCARD_CARDS } from '../game/SpecialCards.js';
import { ENGINE_EFFECT } from '../data/monarque.generated.js';
import { FIGHTER_BY_ID } from './roster.js';

export const FAMILY = {
  SENZU: { label: 'Recovery', gm: 'The Last Draught', monarque: 'LAST_DRAUGHT' },
  FINAL_ATONEMENT: { label: 'Burst', gm: 'The Reckoning', monarque: 'THE_RECKONING' },
  OTHER_WORLD: { label: 'Inversion', gm: 'The Inverted Realm', monarque: 'INVERTED_REALM' },
  SOLAR_FLARE: { label: 'Disruptor', gm: 'The Blinding Eclipse', monarque: 'BLINDING_ECLIPSE' },
  SCOUTER: { label: 'Insight', gm: 'The Oracle’s Gaze', monarque: 'ORACLE_GAZE' },
  SHENRON_WISH: { label: 'Wish', gm: 'Monarque’s Boon', monarque: 'MONARQUE_BOON' },
  MAFUBA: { label: 'Seal', gm: 'The Binding Seal', monarque: 'BINDING_SEAL' },
};
/** Resistance / Adaptation / Stability: the narrative reading of Step I / II / III. Not a new currency. */
export const STEP_LABEL = ['', 'Resistance', 'Adaptation', 'Stability'];
export const GRADE_POINTS = { S: 5, A: 4, B: 3, C: 2 };
export const stepForWins = (wins) => (wins >= 4 ? 3 : wins >= 2 ? 2 : 1);

const RENAME = { soul: 'ki', oppSoul: 'oppKi' };
const adaptRider = (r) => {
  if (Array.isArray(r)) return r.map(adaptRider);
  if (r && typeof r === 'object') return Object.fromEntries(Object.entries(r).map(([k, v]) => [RENAME[k] ?? k, adaptRider(v)]));
  return r;
};

// [contenderId, power name, family, grade, soul cost x3, rider x3, extras]
const P = (fighter, name, family, grade, soul, rider, extra = {}) => ({
  fighter, name, family: ENGINE_EFFECT[family] ?? (() => { throw new Error(`Unmapped family ${family} for ${fighter}`); })(), monarqueFamily: family,
  grade, ki: soul, rider: adaptRider(rider), ...extra,
});
export const POWERS = [
  P("apep", "The Nightly Devouring", "BINDING_SEAL", "S", [2, 2, 2], [{ oppSoul: 2, oppDmg: 8 }, { oppSoul: 3, oppDmg: 10 }, { oppSoul: 4, oppDmg: 12 }], { flavor: "Every night he swallows the sun. Every night he is cut open, and every night he returns hungrier." }),
  P("mictlantecuhtli", "Descent of Nine Levels", "INVERTED_REALM", "A", [2, 2, 2], [{ rounds: 2, hp: 10 }, { rounds: 2, hp: 12, oppSoul: 1 }, { rounds: 3, hp: 15, oppSoul: 2 }], { flavor: "Nine levels of the dead, each colder than the last. You have already started down." }),
  P("coatlicue", "Skirt of Serpents", "LAST_DRAUGHT", "A", [2, 2, 2], [{ hp: 16, draw: 1 }, { hp: 19, draw: 1, soul: 1 }, { hp: 22, draw: 1, soul: 2 }], { flavor: "She wears the dead as a necklace and births them back into hunger." }),
  P("kali", "Garland of Skulls", "MONARQUE_BOON", "A", [2, 2, 2], [{ selfDmg: 5 }, { selfDmg: 4, soul: 1 }, { selfDmg: 3, soul: 2 }], { wish: "ABSOLUTE_POWER", stat: "POWER", flavor: "She drinks the demons dry. Then she does not stop." }),
  P("baron-samedi", "The Grave's Bargain", "LAST_DRAUGHT", "B", [1, 1, 1], [{ hp: 20, soul: 1 }, { hp: 25, soul: 2 }, { hp: 30, soul: 2, draw: 1 }], { flavor: "He tips his hat, lights a cigar, and decides who goes back." }),
  P("balor", "Eye of Annihilation", "ORACLE_GAZE", "A", [2, 2, 2], [{ oppSoul: 2, oppDmg: 8, nextRank: 3 }, { oppSoul: 3, oppDmg: 10, nextRank: 4 }, { oppSoul: 3, oppDmg: 12, nextRank: 6 }], { flavor: "The great eyelid lifts. Where he looks, armies stop being armies." }),
  P("the-cailleach", "Hammer of Endless Winter", "BLINDING_ECLIPSE", "B", [1, 1, 1], [{ oppSoul: 2, oppDmg: 4 }, { oppSoul: 3, oppDmg: 6 }, { oppSoul: 3, oppDmg: 8 }], { flavor: "One strike of her hammer, and the ground forgets spring." }),
  P("surtr", "The Flame at the End", "THE_RECKONING", "S", [3, 2, 2], [{ self: 15, others: 26, oppSoul: 2 }, { self: 15, others: 28, oppSoul: 3 }, { self: 12, others: 30, oppSoul: 3 }], { flavor: "He waited for the end. He carries the fire himself." }),
  P("asmodeus", "Three Heads, Three Wants", "ORACLE_GAZE", "A", [2, 2, 1], [{ soul: 2, nextRank: 4, oppSoul: 1 }, { soul: 3, nextRank: 5, oppSoul: 2 }, { soul: 3, nextRank: 7, oppSoul: 3 }], { flavor: "Three heads, three hungers. One of them always knows what you want." }),
  P("baphomet", "The Horned Paradox", "INVERTED_REALM", "A", [2, 2, 2], [{ rounds: 2, nextPower: 40 }, { rounds: 2, nextPower: 60, soul: 1 }, { rounds: 3, nextPower: 80, soul: 2 }], { flavor: "A torch between the horns. As above, so below, and the weak lead the strong." }),
  P("samael", "Venom of Judgement", "BLINDING_ECLIPSE", "A", [2, 2, 2], [{ oppDmg: 10, oppSoul: 1 }, { oppDmg: 12, oppSoul: 2 }, { oppDmg: 14, oppSoul: 3 }], { flavor: "Blind, he judges by the venom on your breath." }),
  P("ravana", "Ten Heads, Ten Plans", "BLINDING_ECLIPSE", "A", [3, 2, 2], [{ oppSoul: 1, draw: 1 }, { oppSoul: 2, draw: 1, nextPower: 50 }, { oppSoul: 2, draw: 2, nextPower: 70 }], { flavor: "Ten heads, twenty arms, and each one has already made a plan." }),
  P("azi-dahaka", "Chains Beneath the Mountain", "BINDING_SEAL", "B", [1, 1, 1], [{ oppSoul: 3 }, { oppSoul: 4, oppDmg: 5 }, { oppSoul: 5, oppDmg: 8 }], { flavor: "He is chained, but the mountain trembles whenever he breathes." }),
  P("jeoseung-saja", "The List of Names", "ORACLE_GAZE", "B", [1, 1, 0], [{ nextRank: 5, oppSoul: 1 }, { nextRank: 7, oppSoul: 2 }, { nextRank: 9, oppSoul: 2 }], { flavor: "A black hat, a quiet voice, and your name read from a list." }),
  P("perchta", "Belly Full of Straw", "THE_RECKONING", "B", [1, 1, 0], [{ self: 8, others: 18 }, { self: 8, others: 20 }, { self: 6, others: 22 }], { flavor: "She finds the idle, cuts them open, and fills them with straw." }),
  P("camazotz", "The Bite from the Dark", "LAST_DRAUGHT", "B", [2, 2, 2], [{ hp: 20, oppDmg: 6 }, { hp: 24, oppDmg: 8 }, { hp: 28, oppDmg: 10 }], { flavor: "A single bite in the dark, and the head comes away." }),
  P("briareus", "A Hundred Hands, A Hundred Stones", "MONARQUE_BOON", "B", [2, 2, 2], [{ selfDmg: 5, draw: 1 }, { selfDmg: 4, draw: 1 }, { selfDmg: 3, draw: 1 }], { wish: "ABSOLUTE_POWER", stat: "POWER", flavor: "A hundred hands, a hundred hills, and none of them miss." }),
  P("chiyou", "Bronze Brow, Horned Helm", "MONARQUE_BOON", "B", [1, 1, 1], [{ selfDmg: 4 }, { selfDmg: 3, soul: 1 }, { selfDmg: 2, soul: 2 }], { wish: "ABSOLUTE_POWER", stat: "RANK", flavor: "Bronze skull, four eyes, horned helm. He invented war and never stopped." }),
  P("hecate", "Three Roads, One Seal", "BINDING_SEAL", "B", [2, 2, 1], [{ soul: 1, cdClear: 1 }, { soul: 2, cdClear: 1 }, { soul: 3, cdClear: 1, draw: 1 }], { flavor: "At the crossroads she closes one road and opens another." }),
  P("baba-yaga", "The Walking Hut's Cauldron", "LAST_DRAUGHT", "B", [1, 1, 1], [{ hp: 15, soul: 2, nextPower: 40 }, { hp: 18, soul: 2, nextPower: 60 }, { hp: 22, soul: 3, nextPower: 80 }], { flavor: "The hut turns, the pot boils, and you are what's for dinner." }),
  P("izanami", "A Thousand Lives a Day", "THE_RECKONING", "A", [2, 2, 2], [{ self: 12, others: 20, soul: 2 }, { self: 12, others: 22, soul: 3 }, { self: 10, others: 25, soul: 4 }], { flavor: "She swore to take a thousand a day. She is keeping count." }),
  P("shuten-doji", "The Endless Banquet", "BLINDING_ECLIPSE", "A", [3, 3, 2], [{ oppDmg: 12, hp: 10 }, { oppDmg: 14, hp: 12 }, { oppDmg: 16, hp: 14, oppSoul: 2 }], { flavor: "The wine is red, the meat is warm, and the banquet never ends." }),
  P("typhon", "The Mountain Over Him", "MONARQUE_BOON", "A", [2, 2, 2], [{ rounds: 1, hp: 10 }, { rounds: 2, hp: 10 }, { rounds: 2, hp: 15, oppSoul: 1 }], { wish: "IMMORTALITY", flavor: "Buried under a volcano, he still shakes the world." }),
  P("tiamat", "Salt Abyss Unmaking", "INVERTED_REALM", "S", [2, 2, 2], [{ rounds: 2, oppSoul: 2, selfDmg: 3 }, { rounds: 2, oppSoul: 3, selfDmg: 3 }, { rounds: 3, oppSoul: 3, selfDmg: 2 }], { flavor: "She was the sea before there was a sky. She remembers." }),
  P("lucifer", "Pride Before the Fall", "MONARQUE_BOON", "S", [2, 2, 2], [{ oppSoul: 2 }, { oppSoul: 2, soul: 1 }, { oppSoul: 3, soul: 2 }], { wish: "ABSOLUTE_POWER", stat: "RANK", flavor: "He knows exactly how high he fell from." }),
  P("beelzebub", "Swarm of the Flies", "BLINDING_ECLIPSE", "B", [1, 1, 1], [{ oppDmg: 6, oppSoul: 1 }, { oppDmg: 8, oppSoul: 1 }, { oppDmg: 10, oppSoul: 2 }], { flavor: "The flies arrive first. He follows." }),
  P("nyx", "Veil of Unbroken Night", "BLINDING_ECLIPSE", "S", [3, 2, 2], [{ oppSoul: 2, shield: 1, soul: 1 }, { oppSoul: 3, shield: 1, soul: 2 }, { oppSoul: 4, shield: 2, soul: 2 }], { flavor: "Before the first god, there was night. Night remembers." }),
  P("thanatos", "The Inverted Torch", "INVERTED_REALM", "B", [1, 1, 1], [{ rounds: 1, oppDmg: 6 }, { rounds: 2, oppDmg: 6 }, { rounds: 2, oppDmg: 8, soul: 1 }], { flavor: "He never hurries. He is never late." }),
  P("hades", "The Unseen Tithe", "MONARQUE_BOON", "S", [3, 3, 2], [{ oppSoul: 2 }, { oppSoul: 3 }, { oppSoul: 3, soul: 2 }], { wish: "DIVINE_DESTRUCTION", flavor: "Everything that falls comes to him, and nothing is returned." }),
  P("the-reaper", "The Reaper's Draw", "LAST_DRAUGHT", "C", [0, 0, 0], [{ gamble: [{ hp: 10 }, { soul: 3 }, { oppDmg: 12 }, { oppSoul: 3 }, { nextRank: 10 }, { hp: 5, soul: 2, nextPower: 60 }] }, { gamble: [{ hp: 13 }, { soul: 4 }, { oppDmg: 15 }, { oppSoul: 4 }, { nextRank: 12 }, { hp: 7, soul: 3, nextPower: 80 }] }, { gamble: [{ hp: 15 }, { soul: 5 }, { oppDmg: 18 }, { oppSoul: 5 }, { nextRank: 15 }, { hp: 9, soul: 4, nextPower: 100 }] }], { flavor: "A name comes up on the wheel. Anything can happen." }),
  P("hel", "Helheim's Tithe", "BLINDING_ECLIPSE", "B", [1, 1, 1], [{ oppDmg: 8, oppSoul: 1 }, { oppDmg: 10, oppSoul: 1 }, { oppDmg: 12, oppSoul: 2 }], { flavor: "Half alive, half rotting, and all hers who die in their beds." }),
  P("osiris", "The Reassembled King", "MONARQUE_BOON", "C", [2, 1, 1], [{ rounds: 1, hp: 12 }, { rounds: 2, hp: 12, soul: 1 }, { rounds: 2, hp: 15, soul: 2 }], { wish: "IMMORTALITY", flavor: "He was torn to pieces and put back together a king." }),
];
export const POWER_OF = Object.fromEntries(POWERS.map((p) => [p.fighter, p]));
const ART = Object.fromEntries(WILDCARD_CARDS.map((c) => [c.effectId, c.image]));
const nameOf = (id) => FIGHTER_BY_ID[id]?.short ?? id;

/** Berserk surge: Monarque's raw power makes a power's EFFECTS half again as strong (+50%). Costs the wielder pays (own HP, Soul price) are left alone. */
export const BERSERK_BOOST = 1.5;
const SCALED = ['hp', 'ki', 'oppKi', 'oppDmg', 'others', 'nextPower', 'nextRank', 'draw', 'shield', 'rounds'];
const lift = (n, boost) => (boost > 1 ? Math.max(n, Math.round(n * boost)) : n);
export function boostRider(r, boost = 1) {
  if (!(boost > 1)) return r;
  if (Array.isArray(r)) return r.map((x) => boostRider(x, boost));
  if (r && typeof r === 'object') return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === 'gamble' ? boostRider(v, boost) : SCALED.includes(k) && typeof v === 'number' ? lift(v, boost) : v]));
  return r;
}

/** Plain-language text of a power at a Step. Display only; the engine reads the rider. `boost` > 1 shows the berserk surge. */
export function describePower(spec, step = 1, boost = 1) {
  const i = step - 1, R = boostRider(spec.rider[i], boost), ki = spec.ki[i];
  const bits = [];
  const gm = FAMILY[spec.family].gm;
  const body = ({
    OTHER_WORLD: `Lower stat wins for ${R.rounds ?? 2} rounds.`,
    SENZU: R.gamble ? 'Cast the lot: a random boon (heal, Soul, Power, Rank or drain).' : '',
    SOLAR_FLARE: 'Leader only: the foe must play blind and cannot boost.',
    SCOUTER: 'Scan the foe: Soul, HP and their best cards.',
    MAFUBA: 'Seal the foe’s played card; the round is void.',
    FINAL_ATONEMENT: `Burst: you lose ${R.self ?? 15} HP, the foe loses ${R.others ?? 17} HP, round ends.`,
    SHENRON_WISH: ({ IMMORTALITY: `No HP loss for ${R.rounds ?? 2} round${(R.rounds ?? 2) > 1 ? 's' : ''}.`, ABSOLUTE_POWER: spec.stat === 'RANK' ? 'This round, your card’s Rank is halved.' : 'This round, your card’s Power is doubled.', DIVINE_DESTRUCTION: 'The foe loses a random card.' })[spec.wish],
  })[spec.family];
  if (body) bits.push(body);
  if (!R.gamble) {
    if (R.hp && spec.family !== 'FINAL_ATONEMENT') bits.push(`+${R.hp} HP`);
    if (R.ki) bits.push(`+${R.ki} Soul`);
    if (R.selfDmg) bits.push(`costs ${R.selfDmg} HP`);
    if (R.oppKi) bits.push(`foe −${R.oppKi} Soul`);
    if (R.oppDmg) bits.push(`foe −${R.oppDmg} HP`);
    if (R.nextPower) bits.push(`next card +${R.nextPower} Power`);
    if (R.nextRank) bits.push(`next card −${R.nextRank} Rank`);
    if (R.cdClear) bits.push('all cooldowns cleared');
    if (R.draw) bits.push(`draw ${R.draw} card`);
  }
  return { gm, text: bits.join(' · '), cost: ki ? `${ki} Soul` : 'Free' };
}

/** The wild card the engine deals. `ownerKey` makes ids unique when one contender's power sits in two hands. */
/** The Berserker's power, once taken, restores 40% of the wielder's max HP and max Soul when it is played (on top of its own effect). */
export const BERSERK_SURGE = 0.4;
export function powerCard(fighterId, step, ownerKey = 'p', boost = 1, surge = 0) {
  const spec = POWER_OF[fighterId];
  const i = step - 1;
  const d = describePower(spec, step, boost);
  if (surge > 0) d.text = `${d.text}${d.text ? ' · ' : ''}+${Math.round(surge * 100)}% max HP and Soul`;
  return {
    id: `pow-${fighterId}-${ownerKey}`, type: 'WILDCARD', category: 'WILDCARD', rarity: 'SPECIAL', series: 'STORY', form: 'Power', power: null, rank: null, unique: false,
    character: spec.name, title: `${nameOf(fighterId)} · ${FAMILY[spec.family].label}`, description: d.text,
    effectId: spec.family, image: `/story/fighters/${fighterId}.webp`, // a contender's power wears that contender's own image
    story: { name: spec.name, fighter: spec.fighter, grade: spec.grade, step, boost: boost > 1 ? boost : 1, surge: surge > 0 ? surge : 0, kiCost: spec.ki[i], rider: boostRider(spec.rider[i], boost), wish: spec.wish ?? null, stat: spec.stat ?? null, flavor: spec.flavor },
  };
}
/** All eight base Edicts, un-enhanced: Monarque's own hand. */
export const gmWildHand = () => WILDCARD_CARDS.map((c) => ({ ...c, id: `gm-${c.id}`, story: null }));
