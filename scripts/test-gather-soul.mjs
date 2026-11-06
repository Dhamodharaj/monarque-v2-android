// Gather Soul presents itself as a sacrifice: the numbers shown (HP given, Soul taken) are the engine's, the event is a spotlight with its own sound.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStoryEngine } from '../src/story/duel.js';
import { describeEvent, wantsSpotlight, soundsForEvent, eventTone } from '../src/game/presentation.js';
import { GAME_CONFIG } from '../src/config/gameConfig.js';

const cards = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url)));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const eng = createStoryEngine(cards, { random: rng(9), human: { name: 'H', powers: [], step: 1 }, foe: { name: 'F', powers: [], step: 1 } });
const [a, b] = eng.state.players;
eng.state.currentPlayer = a.id; eng.state.roundLeaderId = a.id; eng.callStat(a.id, 'POWER');
eng.playCard(a.id, a.hand.find((c) => c.type !== 'WILDCARD' && !c.lastStand).id, {});
b.hp = 80; b.ki = 3;
eng.chargeTurn(b.id);
const ev = eng.state.eventLog.find((e) => e.type === 'CHARGE');
ok(ev, 'a CHARGE event is emitted');
ok(80 - b.hp === GAME_CONFIG.charge.hp && b.ki - 3 === GAME_CONFIG.charge.ki, 'the engine took the configured HP and gave the configured Soul');
ok(ev.hp === GAME_CONFIG.charge.hp && ev.ki === GAME_CONFIG.charge.ki, 'the event reports exactly those numbers');
const d = describeEvent(ev, () => 'F');
ok(d.sacrifice && d.sacrifice.hp === ev.hp && d.sacrifice.ki === ev.ki, 'the presentation shows the HP sacrificed and the Soul recovered');
ok(/sacrifice/i.test(d.kicker) && /bleeds/.test(d.title), 'it reads as a sacrifice, not a recharge');
ok(new RegExp(`${GAME_CONFIG.charge.cooldownRounds} rounds`).test(d.text) && /forfeit/.test(d.text), 'it states the forfeited round and the cooldown');
ok(wantsSpotlight(ev) && eventTone(ev) === 'sacrifice', 'it gets its own spotlight');
ok(soundsForEvent(ev).some(([k]) => k === 'sacrifice'), 'it has its own sound cue');
ok(!soundsForEvent(ev).some(([k]) => k === 'charge' || k === 'ki'), 'the old pickup chime is gone');
ok(readFileSync(new URL('../public/audio/dark/sacrifice.mp3', import.meta.url)).length > 10000, 'the sound file ships');
console.log(`PASS Gather Soul sacrifice presentation (${n} checks)`);
