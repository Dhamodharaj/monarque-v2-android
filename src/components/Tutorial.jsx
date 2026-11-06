import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildSteps, placeTip, liveHint, markTutorialSeen, markHintsDone, hintsDone } from './tutorialSteps.js';
import './tutorial.css';

export { tutorialSeen } from './tutorialSteps.js';

/** First on-screen element matching any selector (a string or a list). */
const pick = (sel) => {
  for (const s of [].concat(sel ?? [])) {
    const el = document.querySelector(s);
    if (el) { const r = el.getBoundingClientRect(); if (r.width > 2 && r.height > 2) return el; }
  }
  return null;
};

/** Live bounding box of whatever the selector points at; follows layout changes, resizes and animations. */
function useTargetRect(sel, active = true) {
  const [rect, setRect] = useState(null);
  const key = [].concat(sel ?? []).join('|');
  useLayoutEffect(() => {
    if (!active || !key) { setRect(null); return undefined; }
    let raf = 0;
    const measure = () => {
      const el = pick(sel);
      if (!el) { setRect((p) => (p === null ? p : null)); return; }
      const r = el.getBoundingClientRect();
      const next = { x: r.left, y: r.top, w: r.width, h: r.height };
      setRect((p) => (p && Math.abs(p.x - next.x) < 0.6 && Math.abs(p.y - next.y) < 0.6 && Math.abs(p.w - next.w) < 0.6 && Math.abs(p.h - next.h) < 0.6 ? p : next));
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    const iv = window.setInterval(measure, 350);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', schedule); window.removeEventListener('scroll', schedule, true); window.clearInterval(iv); };
  }, [key, active]); // eslint-disable-line react-hooks/exhaustive-deps
  return rect;
}

const Lines = ({ lines }) => lines.map((t, k) => (t.startsWith('• ')
  ? <p key={k} className="tut-li"><b aria-hidden="true">•</b><span>{t.slice(2)}</span></p>
  : <p key={k}>{t}</p>));

/** The guided tour: dims the real game screen and spotlights one element at a time. Pauses the AI via the parent while open. */
export default function Tutorial({ mode, story = false, onClose }) {
  const steps = useMemo(() => buildSteps(mode, story), [mode, story]);
  const [i, setI] = useState(0);
  const dir = useRef(1);
  const tipRef = useRef(null);
  const [size, setSize] = useState({ w: 360, h: 220 });
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const step = steps[i];
  const rect = useTargetRect(step.target, true);
  const last = i === steps.length - 1;

  const finish = () => { markTutorialSeen(story); onClose(); };
  const go = (d) => { dir.current = d; setI((x) => Math.min(Math.max(x + d, 0), steps.length - 1)); };

  // Skip steps whose element is not on screen right now (e.g. Edicts when you hold none), in the direction of travel.
  useEffect(() => {
    if (step.optional && !pick(step.target)) setI((x) => Math.min(Math.max(x + dir.current, 0), steps.length - 1));
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  // Bring a target inside a scrolling strip (the hand) into view before it is spotlighted.
  useEffect(() => { pick(step.target)?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const b = tipRef.current?.getBoundingClientRect();
    if (b && (Math.abs(b.width - size.w) > 1 || Math.abs(b.height - size.h) > 1)) setSize({ w: b.width, h: b.height });
  }, [i, rect]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (last) finish(); else go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = placeTip(rect, size, step.place, vp.w, vp.h);
  const pad = 7;
  return (
    <div className="tut-layer" role="dialog" aria-modal="true" aria-label="Tutorial">
      {rect
        ? <div className="tut-hole" style={{ left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 }} />
        : <div className="tut-dim" />}
      <div className={`tut-card side-${pos.side}`} ref={tipRef} style={{ left: pos.left, top: pos.top }}>
        <div className="tour-step">TUTORIAL · {i + 1}/{steps.length}</div>
        <h3>{step.title}</h3>
        <div className="tut-body"><Lines lines={step.lines} /></div>
        <div className="tut-progress" aria-hidden="true"><i style={{ width: `${((i + 1) / steps.length) * 100}%` }} /></div>
        <div className="tour-actions">
          {!last && <button type="button" className="tour-skip" onClick={finish}>Skip tour</button>}
          {i > 0 && <button type="button" onClick={() => go(-1)}>Back</button>}
          {last ? <button type="button" className="primary" onClick={finish}>Start playing</button> : <button type="button" className="primary" onClick={() => go(1)}>Next</button>}
        </div>
      </div>
    </div>
  );
}

/**
 * A non-blocking gold highlight on whatever the player should tap next, for the first rounds only.
 * `enabled` is false while any modal, banner or the tour is on screen.
 */
export function LiveHints({ state, humanId, selectedCard, enabled, story = false }) {
  const [done, setDone] = useState(() => hintsDone(story));
  const [size, setSize] = useState({ w: 280, h: 74 });
  const ref = useRef(null);
  const retired = state.roundNumber > 2;
  useEffect(() => { if (retired && !done) { markHintsDone(story); setDone(true); } }, [retired, done]);
  const hint = enabled && !done && !retired ? liveHint(state, humanId, selectedCard) : null;
  const rect = useTargetRect(hint?.target, Boolean(hint));
  useLayoutEffect(() => {
    const b = ref.current?.getBoundingClientRect();
    if (b && (Math.abs(b.width - size.w) > 1 || Math.abs(b.height - size.h) > 1)) setSize({ w: b.width, h: b.height });
  }, [hint?.text, rect]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!hint || !rect) return null;
  const pos = placeTip(rect, size, hint.place, window.innerWidth, window.innerHeight);
  const hide = () => { markHintsDone(story); setDone(true); };
  return (
    <>
      <div className="tut-ring" aria-hidden="true" style={{ left: rect.x - 5, top: rect.y - 5, width: rect.w + 10, height: rect.h + 10 }} />
      <div className="tut-hint" ref={ref} role="note" style={{ left: pos.left, top: pos.top }}>
        <span className="tut-hint-text">{hint.text}</span>
        <button type="button" className="tut-hint-x" onClick={hide} aria-label="Hide tutorial hints" title="Hide hints">×</button>
      </div>
    </>
  );
}
