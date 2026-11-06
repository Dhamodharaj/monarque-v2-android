import { useCallback, useEffect, useRef, useState } from 'react';
import { gameSounds } from '../utils/sound.js';
import { Portrait } from './ui.jsx';
import { fill } from './narration.js';
import './cutscene.css';

const REDUCED = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** Types text out; the returned skip() completes it instantly. */
export function useTypewriter(text, delay = 400, cps = 42) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (REDUCED()) { setN(text.length); return undefined; }
    setN(0); let i = 0, iv = 0;
    const t = window.setTimeout(() => { iv = window.setInterval(() => { i += 1; setN(i); if (i % 4 === 0) gameSounds.cue('sType', 0.4, { minGap: 40 }); if (i >= text.length) window.clearInterval(iv); }, 1000 / cps); }, delay);
    return () => { window.clearTimeout(t); window.clearInterval(iv); };
  }, [text, delay, cps]);
  return [text.slice(0, n), n >= text.length, () => setN(text.length)];
}

const WHO = { m: 'MONARQUE', n: '' };

/**
 * Plays a list of beats ({ k: 'm'|'p'|'n', t, cue? }) one at a time. Click / Enter / Space advances (first press finishes the typing).
 * variant: 'black' (green terminal text) | 'throne' | 'berserk' | 'final' | 'ending'.
 * `stage` is optional art behind the dialogue; `actions` renders after the last beat instead of calling onDone (used for the intro choice).
 */
export default function Cutscene({ beats, name, variant = 'throne', style, stage = null, onDone, actions = null, doneLabel = 'Continue', skippable = true, music = null }) {
  const [i, setI] = useState(0);
  const b = beats[Math.min(i, beats.length - 1)];
  const text = fill(b.t, name);
  const [typed, done, skipType] = useTypewriter(text, i === 0 ? 900 : 250, variant === 'black' ? 30 : 46);
  const last = i >= beats.length - 1;
  const finished = last && done;
  const locked = useRef(false);
  useEffect(() => { if (b.cue) gameSounds.cue(b.cue, 0.8); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (music) gameSounds.startMusic(music); }, [music]);
  const next = useCallback(() => {
    if (locked.current) return;
    if (!done) { skipType(); return; }
    if (!last) setI((x) => x + 1); else if (!actions) { locked.current = true; onDone?.(); }
  }, [done, last, actions, onDone, skipType]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } else if (e.key === 'Escape' && skippable) onDone?.(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [next, onDone, skippable]);
  const log = beats.slice(Math.max(0, i - 2), i);
  return (
    <main style={style} className={`cs-screen cs-${variant}`} onClick={(e) => { if (!e.target.closest('button')) next(); }}>
      <i className="cs-bar top" /><i className="cs-bar bottom" />
      {stage && <div className="cs-stage">{stage}</div>}
      <div className="cs-dialog" role="log" aria-live="polite">
        {variant !== 'black' && log.map((p, k) => <p key={`${i}-${k}`} className={`cs-old cs-${p.k}`}>{p.k === 'm' ? <b>MONARQUE</b> : p.k === 'p' ? <b>{name}</b> : null}{fill(p.t, name)}</p>)}
        <p key={i} className={`cs-line cs-${b.k}`}>
          {b.k !== 'n' && <b className="cs-who">{b.k === 'm' ? WHO.m : name}</b>}
          <span>{typed}</span><span className={`cs-caret ${done ? 'off' : ''}`}>▍</span>
        </p>
        <div className="cs-row">
          {finished && actions}
          {!actions && <button type="button" className="cs-btn" onClick={next}>{!done ? '…' : last ? doneLabel : 'Next'}</button>}
          {skippable && !finished && <button type="button" className="cs-btn ghost" onClick={() => onDone?.()}>Skip</button>}
        </div>
        <div className="cs-dots">{beats.map((x, k) => <i key={k} className={k === i ? 'on' : k < i ? 'seen' : ''} />)}</div>
      </div>
    </main>
  );
}

/** The two figures of a duel scene: Monarque beside a contender (optionally berserk). */
export function Duo({ foeId = null, gm = true, berserk = false, you = null }) {
  return (
    <div className="cs-duo">
      {you && <div className="cs-fig you"><Portrait id={you} size={120} mood="confident" /></div>}
      {gm && <div className="cs-fig gm"><Portrait id={null} gm size={120} /></div>}
      {foeId && <div className={`cs-fig foe ${berserk ? 'berserk' : ''}`}><Portrait id={foeId} size={150} mood={berserk ? 'angry' : 'confident'} card={!berserk} />{berserk && <i className="cs-rage" aria-hidden="true" />}</div>}
    </div>
  );
}
