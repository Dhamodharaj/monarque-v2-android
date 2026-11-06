import { useMemo, useState } from 'react';

export const BATTLE_RIVALS = ['Fenrir', 'Hel', 'Loki'];
const ARENAS = [
  { id: 'cathedral', name: 'Eclipsed Cathedral', image: '/ui/round-1.webp', short: 'A ruined cathedral under a black eclipse' },
  { id: 'temple', name: 'Blood Moon Temple', image: '/ui/round-2.webp', short: 'Broken stone beneath a red moon' },
  { id: 'fortress', name: 'Infernal Fortress', image: '/ui/round-3.webp', short: 'Ash and iron above a burning gate' },
  { id: 'citadel', name: 'Frozen Citadel', image: '/ui/round-4.webp', short: 'A pale spire, a single shaft of light' },
  { id: 'sea', name: 'Sunken Sea', image: '/ui/round-5.webp', short: 'A drowned harbour, the water not at rest' },
  { id: 'ruins', name: 'Gothic Ruins', image: '/ui/round-6.webp', short: 'Ruins beneath an ancient tree' },
];

import { ROSTER } from '../story/roster.js';
import { hallUnlocked, hallNeed } from '../services/progress.js';
import DifficultyPicker from '../components/DifficultyPicker.jsx';
import { loadDifficulty, saveDifficulty } from '../config/difficulty.js';

const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const img = (f) => `/story/fighters/${f.id}.webp`;

export default function ModeSelect({ onSelect, onBack, progress = null, stats = null }) {
  const [mode, setMode] = useState(4);
  const [difficulty, setDifficultyRaw] = useState(() => loadDifficulty('battle'));
  const setDifficulty = (id) => setDifficultyRaw(saveDifficulty('battle', id));
  const [twists, setTwistsRaw] = useState(() => { try { return window.localStorage.getItem('monarque.twists.v1') !== 'off'; } catch { return true; } });
  const setTwists = (on) => { setTwistsRaw(on); try { window.localStorage.setItem('monarque.twists.v1', on ? 'on' : 'off'); } catch { /* not persisted */ } };
  const [arenaId, setArenaIdRaw] = useState(ARENAS[0].id);
  // Backdrops are 300KB+ each: mount one only when its hall is first picked (the old one stays for the cross-fade).
  const [seenArenas, setSeenArenas] = useState(() => new Set([ARENAS[0].id]));
  const setArenaId = (id) => { setSeenArenas((prev) => (prev.has(id) ? prev : new Set(prev).add(id))); setArenaIdRaw(id); };
  const [pickId, setPickId] = useState(() => ROSTER[Math.floor(Math.random() * ROSTER.length)].id);
  const [picking, setPicking] = useState(false);
  const [order] = useState(() => shuffle(ROSTER.map((f) => f.id)));
  const arena = useMemo(() => ARENAS.find(item => item.id === arenaId) || ARENAS[0], [arenaId]);
  const me = ROSTER.find((f) => f.id === pickId);
  const rivals = useMemo(() => order.filter((id) => id !== pickId).slice(0, 3).map((id) => ROSTER.find((f) => f.id === id)), [order, pickId]);
  const seats = [{ f: me, role: 'You', sub: 'Your vessel' }, ...rivals.map((f, i) => ({ f, role: 'Rival', sub: `Rival ${i + 1}` }))].slice(0, mode);
  const begin = () => onSelect(mode, arena, [me.short, ...rivals.slice(0, mode - 1).map((f) => f.short)], difficulty, twists);

  return (
    <main className="su" data-arena={arena.id}>
      {ARENAS.filter(item => seenArenas.has(item.id)).map(item => <div key={item.id} className={`su-bg ${item.id === arena.id ? 'on' : ''}`} style={{ backgroundImage: `url("${item.image}")` }} aria-hidden="true" />)}
      <button className="su-back" onClick={onBack}>← Back</button>
      <section className="su-panel">
        <header className="su-head"><span>BATTLE MODE</span><h1>Set the Table</h1></header>

        <div className="su-modes">
          {[[2, 'The Duel', 'One rival'], [4, 'The Four-Way Table', 'Three rivals']].map(([n, t, d]) => (
            <button key={n} className={`su-mode ${mode === n ? 'on' : ''}`} onClick={() => setMode(n)} aria-pressed={mode === n}>
              <b>{n}</b><span><strong>{t}</strong><small>{d}</small></span>
            </button>
          ))}
        </div>

        <div className="su-block su-diff-block">
          <h2>Difficulty</h2>
          <DifficultyPicker value={difficulty} onChange={setDifficulty} />
          <div className="dp su-twist-toggle" role="group" aria-label="Match twists">
            <div className="dp-row two">
              {[[true, 'Twists on'], [false, 'Twists off']].map(([on, label]) => <button key={label} type="button" aria-pressed={twists === on} className={`dp-opt ${twists === on ? 'on' : ''}`} onClick={() => setTwists(on)}>{label}</button>)}
            </div>
            <p className="dp-blurb">{twists ? 'Most matches get a random rule twist (Blood Moon, Mirror Rounds…) so no two play alike.' : 'Standard rules every match.'}</p>
          </div>
        </div>

        <div className="su-block">
          <h2>Who Sits</h2>
          <div className="su-seats">
            {seats.map(({ f, role, sub }, i) => (
              <article key={f.id} className={`su-seat ${i === 0 ? 'me' : ''}`}>
                <img src={img(f)} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                <strong>{f.short}</strong><small>{i === 0 ? 'Your vessel' : sub}</small>
                {i === 0 && <button className="su-change" onClick={() => setPicking(true)}>Choose contender</button>}
              </article>
            ))}
          </div>
        </div>

        <div className="su-block su-halls-block">
          <h2>Choose the Hall</h2>
          <div className="su-halls">
            {ARENAS.map(item => (
              <button key={item.id} className={`su-hall ${arenaId === item.id ? 'on' : ''} ${hallUnlocked(item.id, progress, stats) ? '' : 'locked'}`} onClick={() => { if (hallUnlocked(item.id, progress, stats)) setArenaId(item.id); }} aria-pressed={arenaId === item.id} aria-disabled={!hallUnlocked(item.id, progress, stats)} title={hallUnlocked(item.id, progress, stats) ? item.short : `Locked: ${hallNeed(item.id)}`}>
                <img src={item.image.replace('/ui/', '/ui/thumbs/')} alt="" width="480" height="225" loading="lazy" decoding="async" /><em>{item.name}</em>{arenaId === item.id && <i>✓</i>}{!hallUnlocked(item.id, progress, stats) && <span className="su-lock">🔒 {hallNeed(item.id)}</span>}
              </button>
            ))}
          </div>
        </div>
      </section>
      <button className="su-begin" onClick={begin}>BEGIN <b>→</b></button>

      {picking && (
        <div className="su-pick-back" onClick={() => setPicking(false)}>
          <div className="su-pick" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Choose your contender">
            <header><h2>Choose your contender</h2><button onClick={() => setPicking(false)} aria-label="Close">✕</button></header>
            <div className="su-pick-grid">
              {ROSTER.map((f) => (
                <button key={f.id} className={`su-pick-item ${f.id === pickId ? 'on' : ''}`} onClick={() => { setPickId(f.id); setPicking(false); }}>
                  <img src={img(f)} alt="" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /><span>{f.short}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
