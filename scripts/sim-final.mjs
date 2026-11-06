// GM bouts only: a strong average build (7 powers at Step III) against each bout.
import { readFileSync } from 'node:fs';
import { AIEngine } from '../src/game/AIEngine.js';
import { takeAiTurn } from '../src/game/AITurn.js';
import { createStoryEngine } from '../src/story/duel.js';
import { makePowerPicker } from '../src/story/storyAI.js';
import { rngFor } from '../src/story/storyFlow.js';
import { ROSTER } from '../src/story/roster.js';
const cards = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url)));
const N = Number(process.argv[2] ?? 60); const nPow = Number(process.argv[3] ?? 5);
const ids = ROSTER.map((f) => f.id);
const w = [0, 0, 0];
for (let b = 0; b < 3; b++) for (let i = 0; i < N; i++) {
  const random = rngFor('final', b, i); Math.random = random;
  const mine = Array.from({ length: nPow }, (_, k) => ids[(i * 5 + k * 7) % 32]).filter((x, k, a) => a.indexOf(x) === k);
  const eng = createStoryEngine(cards, { random, human: { name: 'H', powers: mine, step: 3 }, foe: { name: 'GM', gmBout: b } });
  const ais = [new AIEngine(cards, random), new AIEngine(cards, random)];
  const pick = [makePowerPicker(eng, 'SOVEREIGN', random), makePowerPicker(eng, 'DECEIVER', random)];
  let n = 0; while (eng.state.phase !== 'MATCH_COMPLETE' && n++ < 800) { const id = eng.state.currentPlayer; const k = id === 'player-1' ? 0 : 1; takeAiTurn(eng, ais[k], id, { pickWildcard: pick[k] }); }
  if (eng.state.winner === 'player-1') w[b]++;
}
const p = w.map((x) => x / N);
console.log(`bout win rates I ${(p[0] * 100).toFixed(0)}% II ${(p[1] * 100).toFixed(0)}% III ${(p[2] * 100).toFixed(0)}%; P(at least one of three) ${((1 - (1 - p[0]) * (1 - p[1]) * (1 - p[2])) * 100).toFixed(0)}%`);
