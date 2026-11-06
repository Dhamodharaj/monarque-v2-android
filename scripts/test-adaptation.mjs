// The AI's adaptation to the human seat (AIEngine.setAdapt): it must LEARN real habits from public information, stay OFF unless
// asked, differ by temperament and seat, and stay gentle (it may not turn a fair duel into an unfair one).
import { readFileSync } from 'node:fs';
import { AIEngine } from '../src/game/AIEngine.js';
import { takeAiTurn } from '../src/game/AITurn.js';
import { createStoryEngine } from '../src/story/duel.js';
import { configureFoeAI } from '../src/story/trials.js';
import { rngFor } from '../src/story/storyFlow.js';
const cards = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url)));
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };

// One duel. The "human" seat is played by a second AI, optionally with a fixed call habit. Returns the foe AI and who won.
function duel(seed, { adapt = 0, temperament = 'SOVEREIGN', habit = null, configure = true } = {}) {
  const random = rngFor('adapt', seed); Math.random = random;
  const eng = createStoryEngine(cards, { random, human: { name: 'H', powers: ['hades'], step: 1 }, foe: { name: 'F', powers: ['baron-samedi'], step: 1 } });
  const me = new AIEngine(cards, random); let flip = 0; if (habit) me.chooseCall = () => (habit === 'MIX' ? (flip++ % 2 ? 'POWER' : 'RANK') : habit);
  const foe = new AIEngine(cards, random);
  if (configure) configureFoeAI(foe, { aggression: 1.2, adapt, foe: { temperament } });
  let guard = 0; const reads = [];
  while (eng.state.phase !== 'MATCH_COMPLETE' && guard++ < 2000) {
    const id = eng.state.currentPlayer;
    takeAiTurn(eng, id === 'player-1' ? me : foe, id, {});
    const r = foe.humanRead?.('player-2'); if (r) reads.push(r);
  }
  return { foe, won: eng.state.winner === 'player-2', reads, rounds: eng.state.roundNumber };
}
const rate = (n, opts) => { let w = 0; for (let i = 0; i < n; i++) if (duel(`r${i}`, opts).won) w++; return w / n; };

// --- off by default -----------------------------------------------------------------------------------------------------------------
{
  const a = duel('same', { configure: false }), b = duel('same', { adapt: 0 });
  ok(a.rounds === b.rounds && a.won === b.won, 'adapt 0 plays exactly like an AI that was never configured');
  ok(b.foe.humanRead('player-2') === null && b.reads.length === 0, 'adapt 0 builds no model of the player');
}

// --- it learns real habits, from public information only ----------------------------------------------------------------------------
{
  let learned = 0, n = 6, strongest = 0;
  for (let i = 0; i < n; i++) {
    const { reads } = duel(`h${i}`, { adapt: 0.7, habit: 'POWER' });
    const lean = reads.length ? reads[reads.length - 1].lean : 0;
    if (lean > 0.5) learned++; strongest = Math.max(strongest, ...reads.map((r) => Math.abs(r.lean)));
  }
  ok(learned >= n - 1, `a player who always calls POWER is recognised as a POWER caller (${learned}/${n} duels)`);
  ok(strongest <= 1, 'the read is bounded (|lean| ≤ 1)');
  let mixed = 0;
  for (let i = 0; i < n; i++) { const { reads } = duel(`m${i}`, { adapt: 0.7, habit: 'MIX' }); const lean = reads.length ? reads[reads.length - 1].lean : 0; if (Math.abs(lean) < 0.5) mixed++; }
  ok(mixed >= n - 1, `a player who alternates POWER and RANK is NOT read as predictable (${mixed}/${n} duels)`);
}

// --- it differs by temperament and by seat ------------------------------------------------------------------------------------------
{
  const k = (t, id) => { const a = new AIEngine(cards); a.setAdapt(0.6); a.setTemperament(id, t); a._last = { players: [{ id: 'player-1', type: 'HUMAN', hp: 100, hand: [] }], matchId: 'x', roundNumber: 3 }; return a.humanRead(id)?.k ?? null; };
  const ks = ['SOVEREIGN', 'DECEIVER', 'DEVOURER', 'ANCIENT'].map((t) => k(t, 'player-2'));
  ok(ks.every((v) => v > 0.45 && v < 0.8), `every seat adapts, at most to about adapt ±15% (${ks.map((v) => v.toFixed(2)).join(', ')})`);
  ok(new Set(['player-2', 'player-3', 'player-4', 'player-5'].map((id) => k('SOVEREIGN', id).toFixed(3))).size >= 3, 'different seats pay different amounts of attention');
}

// --- gentle: adapting must not make the AI much stronger ----------------------------------------------------------------------------
{
  const N = 40;
  for (const temperament of ['SOVEREIGN', 'DECEIVER', 'DEVOURER', 'ANCIENT']) {
    const base = rate(N, { adapt: 0, temperament, habit: 'POWER' }), adapted = rate(N, { adapt: 0.7, temperament, habit: 'POWER' });
    console.log(`  ${temperament.padEnd(9)} foe win rate vs a one-call habit: ${(base * 100).toFixed(0)}% -> ${(adapted * 100).toFixed(0)}%`);
    ok(adapted - base <= 0.2, `${temperament}: adaptation adds at most 20 points of win rate against a fully predictable player (${((adapted - base) * 100).toFixed(0)})`);
  }
}
console.log(fails ? `\n${fails} FAILED` : '\nall adaptation checks passed'); process.exit(fails ? 1 : 0);
