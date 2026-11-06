// A/B: one upgraded AI (skill 1 + persona) against three original-heuristic AIs. Fair share is 25%. Seats rotate.
import fs from 'node:fs';
import { GameEngine } from '../src/game/GameEngine.js';
import { AIEngine } from '../src/game/AIEngine.js';
import { takeAiTurn } from '../src/game/AITurn.js';
const cards = JSON.parse(fs.readFileSync(new URL('../src/data/cards.json', import.meta.url), 'utf8'));
const N = Number(process.argv[2] || 120); const mode = Number(process.argv[3] || 4); const TEMPS = ['SOVEREIGN', 'DECEIVER', 'DEVOURER', 'ANCIENT'];
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
let wins = 0, played = 0, stalls = 0; const byTemp = Object.fromEntries(TEMPS.map(t => [t, [0, 0]]));
for (let g = 1; g <= N; g++) {
  const r = rng(g * 7919); const e = new GameEngine(cards, { random: r }); e.createMatch(mode); e.startMatch();
  const smart = g % mode; const temp = TEMPS[g % 4];
  const ais = e.state.players.map((p, i) => { const a = new AIEngine(cards, r); a.skill = i === smart ? 1 : 0; if (i === smart) { if (process.env.W) Object.assign(a.W, JSON.parse(process.env.W)); if (!process.env.NOPERSONA) a.setPersona(p.id, temp); } return a; });
  let guard = 0;
  while (e.state.phase !== 'MATCH_COMPLETE' && guard++ < 4000) { const id = e.state.currentPlayer; const idx = e.state.players.findIndex(p => p.id === id); try { takeAiTurn(e, ais[idx], id, {}); } catch { stalls++; break; } }
  if (e.state.phase !== 'MATCH_COMPLETE') { stalls++; continue; }
  played++; byTemp[temp][1]++; if (e.state.players.findIndex(p => p.id === e.state.winner) === smart) { wins++; byTemp[temp][0]++; }
}
console.log(JSON.stringify({ games: played, upgradedWinRate: +(wins / played).toFixed(3), fairShare: +(1 / mode).toFixed(2), stalls, byTemperament: byTemp }));
