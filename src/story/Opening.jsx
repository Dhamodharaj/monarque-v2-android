import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Reel, REDUCED } from './Reel.jsx';
import { gameSounds } from '../utils/sound.js';
import { Portrait } from './ui.jsx';
import { INTRO_BLACK, INTRO_CELL, INTRO_LIGHT, INTRO_CHOICES } from './narration.js';
import { FIGHTER_BY_ID } from './roster.js';
import './cutscene.css';

/* ---- 1. The last fight, flashing back: the fallen strobe past, blows land, the world goes dark ---- */
const GHOSTS = ['hades', 'kali', 'surtr', 'thanatos', 'typhon', 'ravana'];
const FIGHT = INTRO_BLACK.map((b, k) => ({ ...b, ...[
  { dur: 3200 }, { fx: 'hit', cue: 'sBoom', ghost: true }, { fx: 'hit2', cue: 'damage', dur: 2800 }, { fx: 'hit', cue: 'sBoom', vol: 0.9, dur: 2200, ghost: true }, { fx: 'close', cue: 'sBell', vol: 0.5, dur: 5200 },
][k] }));
function Fight({ name, onDone }) {
  useEffect(() => { gameSounds.cue('lastStand', 0.7); const t = window.setInterval(() => gameSounds.cue('lastStand', 0.6), 1500); return () => window.clearInterval(t); }, []);
  const stage = (shot, i) => (
    <>
      <img className="ci-bg fight" src="/ui/round-7.webp" alt="" />
      {shot.ghost && GHOSTS.slice(i % 2 ? 3 : 0, i % 2 ? 6 : 3).map((g, k) => <img key={g} className="ci-ghost" style={{ animationDelay: `${k * 0.55}s`, left: `${14 + k * 28}%` }} src={`/story/fighters/${g}.webp`} alt="" />)}
      <i className="ci-vig" /><i className="ci-slash a" /><i className="ci-slash b" /><i className="ci-pulse" />
      {shot.fx === 'close' && <><i className="ci-lid top" /><i className="ci-lid bottom" /></>}
    </>
  );
  return <Reel shots={FIGHT} name={name} className="ci-fight" onDone={onDone} stage={stage} />;
}

/* ---- 2. The cell: years counting up, drip, dust, one sliver of light ---- */
function Cell({ onDone }) {
  const [step, setStep] = useState(0);
  const [year, setYear] = useState(0);
  const [flood, setFlood] = useState(false);
  const done = useRef(false);
  const end = useCallback(() => { if (done.current) return; done.current = true; onDone(); }, [onDone]);
  const dust = useMemo(() => Array.from({ length: 26 }, (_, k) => ({ left: `${(k * 37) % 100}%`, d: `${6 + (k % 7)}s`, delay: `${-(k % 9)}s`, s: 2 + (k % 3) })), []);
  useEffect(() => {
    const q = REDUCED() ? 0.2 : 1; const ids = [];
    ids.push(window.setTimeout(() => setStep(1), 2600 * q));
    for (let y = 1; y <= 9; y += 1) ids.push(window.setTimeout(() => { setYear(y); gameSounds.cue('sBell', 0.18); }, (2600 + y * 430) * q));
    ids.push(window.setTimeout(() => setStep(2), 7600 * q));
    ids.push(window.setTimeout(() => { setFlood(true); gameSounds.cue('sBoom', 0.7); }, 10400 * q));
    ids.push(window.setTimeout(end, 11900 * q));
    return () => ids.forEach(window.clearTimeout);
  }, [end]);
  return (
    <main className={`cs-screen cs-cell ci-cell ${flood ? 'flood' : ''}`} onClick={end} aria-label="A dark, damp cell">
      <i className="ci-chain l" /><i className="ci-chain r" />
      <i className="ci-drip" />
      {dust.map((d, k) => <i key={k} className="ci-dust" style={{ left: d.left, animationDuration: d.d, animationDelay: d.delay, width: d.s, height: d.s }} />)}
      <div className="ci-years" aria-hidden="true"><small>YEARS</small><b key={year}>{String(year).padStart(2, '0')}</b></div>
      <p className="cs-caption" key={step}>{INTRO_CELL.caption[step]}</p>
      {flood && <i className="cs-flash" />}
      <button type="button" className="cs-btn ghost ci-skip" onClick={end}>Skip ▸</button>
    </main>
  );
}

/* ---- 3. The throne: the light floods in, Monarque rises out of the dark, the camera pushes in as he speaks ---- */
const THRONE_CUES = ['sBell', 'gmWarn', null, 'sBoom', null, 'gmDecree', 'sVs', 'sBoom'];
const THRONE = INTRO_LIGHT.map((b, k) => ({
  ...b, cue: THRONE_CUES[k] ?? undefined, vol: 0.75,
  fx: b.k === 'p' && /Release/.test(b.t) ? 'shout' : b.k === 'm' && k >= 5 ? 'push' : b.k === 'n' ? 'lightfall' : undefined,
}));
function Throne({ fighterId, name, onDone, onRefuse }) {
  const embers = useMemo(() => Array.from({ length: 34 }, (_, k) => ({ left: `${(k * 29) % 100}%`, d: `${5 + (k % 6)}s`, delay: `${-(k % 8)}s`, s: 2 + (k % 4) })), []);
  const stage = (shot) => (
    <>
      <img className="ci-bg throne" src="/ui/round-7.webp" alt="" />
      <><div className="ci-cam"><i className="ci-eclipse" /><i className="ci-corona" /><img className={`ci-monarque ${shot.k === 'm' ? 'speaking' : ''}`} src="/ui/monarque.webp" alt="Monarque, enthroned beneath a black eclipse" /></div>
      {embers.map((e, k) => <i key={k} className="ci-ember" style={{ left: e.left, animationDuration: e.d, animationDelay: e.delay, width: e.s, height: e.s }} />)}</>
      {shot.fx === 'lightfall' && <i className="ci-lightfall" />}
      <i className="ci-vig soft" />
    </>
  );
  return (
    <Reel
      shots={THRONE} name={name} className="ci-throne" stage={stage} skippable
      speaker={(shot) => shot.k === 'p' && <div className="ci-hero" key={shot.t}><Portrait id={fighterId} size={104} mood="angry" /></div>}
      onDone={onDone}
      actions={INTRO_CHOICES.map((c) => (
        <button key={c.id} type="button" className={`sm-btn big ${c.id === 'accept' ? 'primary' : 'ghost'}`} onClick={() => { if (c.id === 'accept') { gameSounds.cue('sBoom', 0.9); gameSounds.cue('sVs', 0.9); onDone(); } else onRefuse(); }}>{c.label}</button>
      ))}
    />
  );
}

/** Intro cinematic: the lost fight, the cell, the light, then Monarque's offer. Accepting begins the tournament; refusing returns to the main screen. */
export default function Opening({ fighterId, onDone, onRefuse, style }) {
  const [scene, setScene] = useState('fight');
  const name = FIGHTER_BY_ID[fighterId]?.name ?? 'Contender';
  if (scene === 'fight') return <Fight name={name} onDone={() => setScene('cell')} />;
  if (scene === 'cell') return <Cell onDone={() => setScene('light')} />;
  return <div className="ci-wrap"><Throne fighterId={fighterId} name={name} onDone={onDone} onRefuse={onRefuse} /></div>;
}
