import { useCallback, useEffect, useRef, useState } from 'react';
import { gameSounds } from '../utils/sound.js';
import { fill } from './narration.js';
import './cutscene.css';

export const REDUCED = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
export const holdFor = (text, min = 2400) => text.length < 40 && text === text.toUpperCase() ? 3400 : Math.max(min, String(text).split(/\s+/).length * 360 + 1100);

/** A subtitle that fades in word by word (no typewriter), so the picture leads and the words follow. */
export function Subtitle({ who, name, text }) {
  if (!text) return null; // a shot with no words is just picture (or black)
  if (who === 't') return <h1 className="ci-title" key={text}>{text}</h1>;
  const words = fill(text, name).split(' ');
  return (
    <p className={`ci-sub ci-${who}`} key={text}>
      {who !== 'n' && <b className="ci-who">{who === 'm' ? 'MONARQUE' : name}</b>}
      <span>{words.map((w, k) => <i key={k} style={{ animationDelay: `${k * 0.09}s` }}>{w}</i>)}</span>
    </p>
  );
}

/** Plays timed shots: each has a duration, an optional sound cue and shake, and a subtitle. Click / Enter / Space moves on. */
export function Reel({ shots, name, className, stage, onDone, actions, skippable = true, speaker }) {
  const [i, setI] = useState(0);
  const shot = shots[i];
  const last = i === shots.length - 1;
  const fired = useRef(false);
  const go = useCallback(() => setI((x) => Math.min(x + 1, shots.length - 1)), [shots.length]);
  const finish = useCallback(() => { if (fired.current) return; fired.current = true; onDone?.(); }, [onDone]);
  useEffect(() => {
    if (shot.cue) gameSounds.cue(shot.cue, shot.vol ?? 0.8);
    const dur = REDUCED() ? 1800 : shot.dur ?? holdFor(shot.t);
    if (last) { if (actions) return undefined; const t = window.setTimeout(finish, dur); return () => window.clearTimeout(t); }
    const t = window.setTimeout(go, dur);
    return () => window.clearTimeout(t);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const adv = () => { if (!last) go(); else if (!actions) finish(); };
  useEffect(() => {
    const k = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); adv(); } else if (e.key === 'Escape' && skippable) { if (actions) setI(shots.length - 1); else finish(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className={`cs-screen ci-reel ${className} ${shot.fx ?? ''}`} data-shot={i} onClick={(e) => { if (!e.target.closest('button')) adv(); }}>
      <i className="cs-bar top" /><i className="cs-bar bottom" />
      <div className="ci-stage" key={shot.fx ? `fx${i}` : 'stage'}>{typeof stage === 'function' ? stage(shot, i) : stage}</div>
      {speaker?.(shot)}
      <div className="ci-lower">
        <Subtitle who={shot.k} name={name} text={shot.t} />
        <div className="cs-row choices">{last && actions}</div>
      </div>
      {skippable && !(last && actions) && <button type="button" className="cs-btn ghost ci-skip" onClick={() => (actions ? setI(shots.length - 1) : finish())}>Skip ▸</button>}
      <div className="cs-dots ci-dots">{shots.map((_, k) => <i key={k} className={k === i ? 'on' : k < i ? 'seen' : ''} />)}</div>
    </main>
  );
}

