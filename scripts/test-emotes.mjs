// Emote checks: fixed palette, per-contender style read from the cards, replies, and chatter/tracker wiring.
import assert from 'node:assert/strict';
import { E, EMOTES, styleOf, emojiFor } from '../src/story/emotes.js';
import { answerEmote, readTable, EMOTE_REPLY_LINES, INTENT } from '../src/story/emoteReply.js';
import { ROSTER } from '../src/story/roster.js';
import { BattleChatter } from '../src/story/chatter.js';
import { ReactionTracker } from '../src/story/reactions.js';
import { mockLine, paybackLine, sourLine, MOCKERY_FIGHTERS, MOCKERY_LINES, isMocking } from '../src/story/mockery.js';

const palette = new Set(EMOTES.map((x) => x.e));
assert.equal(EMOTES.length, 17, 'fixed palette of 17'); assert.equal(palette.size, 17);
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

// every contender resolves to a style; styles differ across the roster
const styles = new Set(ROSTER.map((f) => styleOf({ fighterId: f.id })));
assert.deepEqual([...styles].sort(), ['feral', 'regal', 'sly', 'still']);
assert.equal(styleOf({ fighterId: 'apep' }), 'feral'); assert.equal(styleOf({ fighterId: 'baron-samedi' }), 'sly');
assert.equal(styleOf({ fighterId: 'lucifer' }), 'regal'); assert.equal(styleOf({ fighterId: 'nyx' }), 'still'); assert.equal(styleOf({ isGm: true }), 'regal');

// emoji always come from the palette (doubled ones are two of the same)
const moods = ['confident', 'joy', 'smug', 'frustrated', 'angry', 'shock', 'worried', 'fear', 'desperate', 'defeated', 'awed'];
for (const f of ROSTER) for (const m of moods) for (let k = 0; k < 6; k++) {
  const e = emojiFor({ fighterId: f.id }, m, Math.random); if (!e) continue;
  assert.ok(palette.has(e) || [...palette].some((p) => p + p === e), `${f.id}/${m}: ${e}`);
}
// a still being is quiet, a feral one almost never is
const rate = (id) => Array.from({ length: 400 }, () => emojiFor({ fighterId: id }, 'angry')).filter(Boolean).length / 400;
assert.ok(rate('nyx') < 0.75 && rate('apep') > 0.85, `rates ${rate('nyx')} ${rate('apep')}`);

// replies read the table: every emoji has a meaning, and the answer always carries a palette emoji and some text
assert.deepEqual(Object.keys(INTENT).sort(), [...palette].sort(), 'every palette emoji has an intent');
const pal = (e) => palette.has(e) || [...palette].some((p) => p + p === e);
const SOUR = new Set(MOCKERY_LINES().filter((l) => /lucky|borrowed|laughed|ransom|Enjoy|Laugh/.test(l)));
const STYLE_FIGHTERS = { feral: 'apep', sly: 'baron-samedi', regal: 'lucifer', still: 'nyx' };
const tableWon = readTable({ round: 3, seatPlace: 1, mePlace: 2, dMe: -14, dFoe: 0, foeHp: 90, foeMax: 100, meHp: 70, meMax: 100 }); // the rival took the round
const tableLost = readTable({ round: 3, seatPlace: 2, mePlace: 1, dMe: 0, dFoe: -12, foeHp: 70, foeMax: 100, meHp: 90, meMax: 100 }); // you took it
assert.equal(tableWon.side, 'up'); assert.equal(tableLost.side, 'down');
for (const [style, id] of Object.entries(STYLE_FIGHTERS)) {
  const who = { fighterId: id };
  // THE BUG: the rival won the round, you sent a kiss. It must gloat, not sulk about a round it did not lose.
  for (let k = 0; k < 60; k++) {
    const r = answerEmote({ who, emote: E.kiss, table: tableWon, rand: Math.random }); if (!r) continue;
    assert.ok(!SOUR.has(r.text) && !/lucky bite/i.test(r.text), `${style}: sour line after winning: ${r.text}`);
    assert.ok(['smug', 'joy'].includes(r.mood), `${style}: should gloat after winning, got ${r.mood}`);
    assert.ok(/14 Health|mine|beaten|beneath|score|devouring|above/i.test(r.text) || /Health/.test(r.text), `${style}: reply should reflect the round: ${r.text}`);
    assert.ok(r.emoji && pal(r.emoji), 'palette emoji');
  }
  // the rival LOST the round: now it can be sore, and it must not claim the win
  for (let k = 0; k < 60; k++) {
    const r = answerEmote({ who, emote: E.kiss, table: tableLost, rand: Math.random }); if (!r) continue;
    assert.equal(r.mood, 'angry', `${style}: sore after losing`); assert.ok(!/cost you|was mine|tribute/i.test(r.text), `${style}: must not claim the win: ${r.text}`);
    assert.ok(/12 Health|took the last round/.test(r.text), `${style}: names what happened: ${r.text}`);
  }
  // cornered: answers from the corner whoever took the last round
  const low = readTable({ round: 3, seatPlace: 1, mePlace: 2, dMe: -9, foeHp: 18, foeMax: 100, meHp: 80, meMax: 100 }); assert.equal(low.side, 'low');
  const rl = answerEmote({ who, emote: E.skull, table: low, rand: () => 0.5 }); assert.ok(/18 Health|wound|hurt|bleed|finished|stand/i.test(rl.text), `${style}: cornered: ${rl.text}`);
  // no round yet: it does not invent a result
  const none = readTable({ round: 0 }); assert.equal(none.last, 'none');
  const rn = answerEmote({ who, emote: E.kiss, table: none, rand: () => 0.5 }); assert.ok(!/last round|cost you|cost me/.test(rn.text), `${style}: no invented result: ${rn.text}`);
  // the same emoji over and over is called out
  const rp = answerEmote({ who, emote: E.kiss, table: tableWon, repeats: 3, rand: () => 0.5 }); assert.ok(/again|repet|same|trick/i.test(rp.text), `${style}: repeat: ${rp.text}`);
}
// every emoji gets a reply that fits the situation: no empty text, no unfilled tokens
for (const e of palette) for (const t of [tableWon, tableLost, readTable({ round: 0 })]) for (const id of Object.values(STYLE_FIGHTERS)) {
  const r = answerEmote({ who: { fighterId: id }, emote: e, table: t, rand: () => 0.5 }); assert.ok(r && r.text.length > 8 && !/[{}]/.test(r.text) && r.emoji, `${id}/${e}`);
}
for (const l of EMOTE_REPLY_LINES()) assert.ok(l && l.length < 110 && !/[{}]/.test(l) && (l.match(/!/g) ?? []).length <= 1, l);
// a silent being may let it pass, but only occasionally
assert.equal(answerEmote({ who: { fighterId: 'nyx' }, emote: E.kiss, table: tableWon, rand: () => 0.01 }), null);

// chatter: bubbles carry emoji; reacting answers (cooldown applies) and ignores dead/unknown seats
const players = [{ id: 'p1', name: 'You', hp: 100, maxHp: 100 }, { id: 'p2', name: 'Apep', hp: 100, maxHp: 100 }, { id: 'p3', name: 'Nyx', hp: 0, maxHp: 100 }];
const chat = new BattleChatter({ players, humanId: 'p1', rand: () => 0.05 });
const [intro] = chat.intro({ players }); assert.ok(intro && 'emoji' in intro);
const out = chat.react('p2', E.rage, { players }); assert.equal(out.length, 1); assert.ok(out[0].emoji && out[0].reply && out[0].text);
assert.deepEqual(chat.react('p2', E.rage, { players }), [], 'cooldown');
assert.deepEqual(chat.react('p3', E.rage, { players }), [], 'dead seat'); assert.deepEqual(chat.react('nobody', E.rage, { players }), []);

// story tracker: lines carry emoji, react() answers or ignores
const t = new ReactionTracker({ fighterId: 'lucifer', rand: () => 0.05 });
const [line] = t.intro(); assert.ok('emoji' in line);
const rep = t.react(E.blade, 1); assert.ok(rep && rep.reply && rep.emoji);
assert.equal(t.react(E.blade, 1), null, 'cooldown');

// the exact report: the rival WON the round, the player sent a kiss. Battle table and Story tracker both read the result.
const view = { players: [{ id: 'p1', name: 'You', hp: 70, maxHp: 100 }, { id: 'p2', name: 'Apep', hp: 95, maxHp: 100 }], lastRound: { round: 4, placements: [{ playerId: 'p2', card: {}, place: 1 }, { playerId: 'p1', card: {}, place: 2 }], deltas: { p1: { hp: -15 }, p2: { hp: 0 } } }, eventLog: [], phase: 'PLAYING' };
const cw = new BattleChatter({ players: view.players, humanId: 'p1', rand: Math.random }); cw.observe(null, view);
for (let i = 0; i < 30; i++) { cw.lastReplyAt = {}; cw.sent = {}; const [r] = cw.react('p2', E.kiss, view); assert.ok(r, 'it answers'); assert.ok(!/lucky bite|borrowed|ransom/i.test(r.text) && r.mood !== 'angry', `battle: gloats after winning: ${r.text}`); assert.ok(/15 Health|mine|devouring/i.test(r.text), `battle: reflects the round: ${r.text}`); }
const ts = new ReactionTracker({ fighterId: 'apep', rand: Math.random }); ts.observe(null, { players: [{ id: 'player-1', hp: 70, maxHp: 100 }, { id: 'player-2', hp: 95, maxHp: 100 }], lastRound: { round: 4, placements: [{ playerId: 'player-2', card: {}, place: 1 }, { playerId: 'player-1', card: {}, place: 2 }], deltas: { 'player-1': { hp: -15 } } }, eventLog: [] });
for (let i = 0; i < 30; i++) { ts.lastReplyAt = 0; ts.sentLast = null; const r = ts.react(E.kiss, 0.95, { foeHp: 95, foeMax: 100, meHp: 70, meMax: 100 }); assert.ok(r && r.mood !== 'angry' && !/lucky bite|borrowed|ransom/i.test(r.text), `story: gloats after winning: ${r?.text}`); assert.ok(/15 Health|mine|devouring/i.test(r.text), `story: reflects the round: ${r.text}`); }

// mockery: all 32 contenders jeer in their own voice; replies are mostly text + emoji
assert.equal(MOCKERY_FIGHTERS.length, 32); assert.deepEqual([...MOCKERY_FIGHTERS].sort(), ROSTER.map((f) => f.id).sort());
for (const f of ROSTER) { assert.ok(mockLine({ fighterId: f.id }, () => 0.1), f.id); assert.ok(paybackLine({ fighterId: f.id }) && sourLine({ fighterId: f.id })); }
assert.ok(mockLine({ isGm: true }, Math.random, 'BOUT_2') && mockLine({ isGm: true }, Math.random, 'EARLY'));
for (const l of MOCKERY_LINES()) assert.ok(l && l.length < 90, l);
assert.ok(isMocking(E.mock) && isMocking(E.kiss) && !isMocking(E.dread));
const lineEmoji = Array.from({ length: 300 }, () => emojiFor({ fighterId: 'nyx' }, 'smug')).filter(Boolean).length / 300; assert.ok(lineEmoji > 0.5, 'even still beings usually add an emoji');

// grudge: you jeer at a rival, it wins the next round -> payback; it jeers at you, you win -> it is sour
const mk = (round, topId, hpYou = 100) => ({ players, lastRound: { round, placements: [{ playerId: topId, card: {}, place: 1 }, { playerId: topId === 'p1' ? 'p2' : 'p1', card: {}, place: 2 }], deltas: { p1: { hp: hpYou - 100 } } }, eventLog: [], phase: 'PLAYING' });
const c2 = new BattleChatter({ players, humanId: 'p1', rand: () => 0.05 });
c2.react('p2', E.mock, { players }); // remembered even though ignored or answered
const won = c2.observe(null, mk(1, 'p2', 80)); const pb = won.find((l) => l.playerId === 'p2'); assert.ok(pb && /./.test(pb.text), 'payback line'); assert.ok(pb.emoji, 'payback carries an emoji');
const c3 = new BattleChatter({ players, humanId: 'p1', rand: () => 0.05 });
const first = c3.observe(null, mk(1, 'p2', 70)).find((l) => l.playerId === 'p2'); assert.ok(first && first.text, 'AI mocks after winning');
const sour = c3.observe(null, mk(2, 'p1')).find((l) => l.playerId === 'p2'); assert.ok(sour && sour.mood === 'angry', 'sour after you win the round it was gloating about');

// variety: every contender has extra lines in every slot; picks do not repeat back-to-back and use the whole bank
import { EXTRA_C, EXTRA_G, ALL_EXTRA_LINES, fresh, resetVariety } from '../src/story/voiceBank.js';
import { lineFor } from '../src/story/reactions.js';
assert.equal(Object.keys(EXTRA_C).length, 32);
for (const [id, c] of Object.entries(EXTRA_C)) for (const [k, v] of Object.entries(c)) assert.ok(Array.isArray(v) && v.length >= 1 && v.every(Boolean), `${id}.${k}`);
for (const g of Object.values(EXTRA_G)) for (const k of ['intro', 'win', 'lose', 'fear', 'desperate', 'power', 'gloat', 'cry', 'taunt', 'defeat']) assert.ok(g[k].length >= 4, k);
for (const l of ALL_EXTRA_LINES()) assert.ok(l.length < 100 && (l.match(/!/g) ?? []).length <= 1, l);
resetVariety();
const seen = []; for (let i = 0; i < 40; i++) seen.push(lineFor('apep', 'win', Math.random, 'MIDDLE'));
for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1], 'no back-to-back repeats');
assert.ok(new Set(seen).size >= 8, `variety ${new Set(seen).size}`);
resetVariety(); const bank = ['a', 'b', 'c', 'd']; const got = new Set(Array.from({ length: 4 }, () => fresh('t', bank))); assert.equal(got.size, 4, 'a bank is used up before any line repeats');
console.log('emotes: ok');
