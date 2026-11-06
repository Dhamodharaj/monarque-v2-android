import { useMemo } from 'react';
import { Reel } from './Reel.jsx';
import { Portrait } from './ui.jsx';
import { TURNING_POINT, FINAL_BLOW, ENDING } from './narration.js';
import { gameSounds } from '../utils/sound.js';

const sparks = (n, seed = 31) => Array.from({ length: n }, (_, k) => ({ left: `${(k * seed) % 100}%`, d: `${4 + (k % 6)}s`, delay: `${-(k % 8)}s`, s: 2 + (k % 4) }));
const Monarque = ({ cls = '' }) => <img className={`ci-monarque fin ${cls}`} src="/ui/monarque.webp" alt="Monarque" />;

/** The turning point: Monarque rises and explains the tournament, AION, and the vessel he was raising. */
export function FinalIntro({ fighterId, name, roster, onDone }) {
  const shots = TURNING_POINT.map((b, k) => ({ ...b, ...[
    { vis: 'rise', cue: 'sBoom', dur: 5200 }, { vis: 'rise', cue: 'gmWarn', fx: 'push' }, { vis: 'hero', fx: 'shout', cue: 'sBoom' }, { vis: 'aion', cue: 'sBell', vol: 0.6, dur: 7600 },
    { vis: 'essence', cue: 'gmWarn', fx: 'hit', dur: 6800 }, { vis: 'crucible', cue: 'sVs', vol: 0.6, dur: 6200 }, { vis: 'crucible2', cue: 'sBell', vol: 0.7, dur: 8200 }, { vis: 'kneel', cue: 'sBoom', vol: 1, fx: 'push' },
  ][k] }));
  const em = useMemo(() => sparks(32), []);
  const stage = (shot) => {
    const v = shot.vis;
    return (
      <>
        <img className="ci-bg throne" src="/ui/round-7.webp" alt="" />
        <i className={`cb-tint ${v === 'essence' || v === 'kneel' ? 'red' : ''}`} />
        {v === 'aion' && <div className="cf-aion">{[0, 1, 2, 3, 4].map((k) => <i key={k} style={{ animationDelay: `${k * 1.1}s` }} />)}<b>AION</b></div>}
        {(v === 'crucible' || v === 'crucible2') && <div className={`cf-crucible ${v}`}>{roster.slice(0, 16).map((id, k) => <img key={id} src={`/story/fighters/${id}.webp`} alt="" style={{ '--i': k }} />)}<div className="cf-me"><Portrait id={fighterId} size={130} mood="angry" /></div></div>}
        {['rise', 'hero', 'essence', 'kneel'].includes(v) && <div className="ci-cam"><i className="ci-eclipse" /><i className="ci-corona" /><Monarque cls={`speaking ${v === 'essence' || v === 'kneel' ? 'raging' : ''} ${v === 'rise' ? 'rising' : ''}`} /></div>}
        {(v === 'essence' || v === 'kneel') && em.map((e, k) => <i key={k} className="ci-ember red" style={{ left: e.left, animationDuration: e.d, animationDelay: e.delay, width: e.s, height: e.s }} />)}
        <i className="ci-vig soft" />
      </>
    );
  };
  return <Reel shots={shots} name={name} className="ci-final" stage={stage} skippable
    speaker={(shot) => shot.k === 'p' && <div className="ci-hero" key={shot.t}><Portrait id={fighterId} size={104} mood="angry" /></div>}
    onDone={onDone}
    actions={<button type="button" className="sm-btn primary big" onClick={() => { gameSounds.cue('sBoom', 0.9); onDone(); }}>Face Monarque</button>} />;
}

/** Begins the instant the last bout is won: "Pathetic.", the cage, the final blow. */
export function FinalBlow({ fighterId, name, onDone }) {
  const shots = FINAL_BLOW.map((b, k) => ({ ...b, ...[
    { vis: 'kneel', fx: 'shout', cue: 'sBoom', dur: 3400 }, { vis: 'kneel', cue: 'gmWarn', dur: 4400 }, { vis: 'hero', fx: 'shout', cue: 'sVs', vol: 0.8, dur: 4800 }, { vis: 'surge', fx: 'hit', cue: 'CURSE_INJECTION', dur: 5600 }, { vis: 'blow', fx: 'blow', cue: 'sBoom', vol: 1, dur: 4200 },
  ][k] }));
  const em = useMemo(() => sparks(34, 29), []);
  const stage = (shot) => {
    const v = shot.vis;
    return (
      <>
        <img className="ci-bg throne" src="/ui/round-7.webp" alt="" />
        <i className={`cb-tint ${v === 'surge' || v === 'kneel' ? 'red' : ''}`} />
        <div className="ci-cam"><i className="ci-eclipse" /><i className="ci-corona" /><Monarque cls={`speaking raging ${v === 'blow' ? 'shatter' : v === 'kneel' ? 'kneeling' : ''}`} /></div>
        {v === 'surge' && <><div className="cb-beam" /><div className="cf-me center"><Portrait id={fighterId} size={150} mood="angry" /></div></>}
        {(v === 'surge' || v === 'blow') && em.map((e, k) => <i key={k} className="ci-ember red" style={{ left: e.left, animationDuration: e.d, animationDelay: e.delay, width: e.s, height: e.s }} />)}
        {v === 'blow' && <><i className="ci-slash a cf-blow" /><i className="cf-whiteout" /></>}
        <i className="ci-vig soft" />
      </>
    );
  };
  return <Reel shots={shots} name={name} className="ci-final" stage={stage} skippable={false}
    speaker={(shot) => shot.k === 'p' && <div className="ci-hero" key={shot.t}><Portrait id={fighterId} size={104} mood="angry" /></div>}
    onDone={onDone} />;
}

/** After the blow: the seals burst, the bound walk free, the champion stands alone. */
export function FinalEnding({ fighterId, name, roster, onDone }) {
  const shots = ENDING.map((b, k) => ({ ...b, ...[
    { vis: 'fall', cue: 'sBoom', dur: 5200 }, { vis: 'cards', cue: 'sBell', vol: 0.8, dur: 6600 }, { vis: 'free', cue: 'sClaim', vol: 0.8, dur: 7200 }, { vis: 'depart', cue: 'sLevel', vol: 0.6, dur: 7200 }, { vis: 'title', cue: 'sVictory', vol: 0.7, dur: 4800 }, { vis: 'hero', cue: undefined, dur: 8800 }, { vis: 'hero', cue: undefined, dur: 5200 },
  ][k] }));
  const dust = useMemo(() => sparks(44, 23), []);
  const ids = roster.slice(0, 32);
  const stage = (shot) => {
    const v = shot.vis;
    return (
      <>
        <img className={`ci-bg ending ${v === 'hero' || v === 'title' ? 'dawn' : ''}`} src="/ui/round-7.webp" alt="" />
        {v === 'fall' && <div className="ci-cam"><Monarque cls="speaking ashen" /></div>}
        {(v === 'cards' || v === 'free' || v === 'depart') && <div className={`cf-grid ${v}`}>{ids.map((id, k) => <img key={id} src={`/story/fighters/${id}.webp`} alt="" style={{ '--i': k }} />)}</div>}
        {(v === 'cards' || v === 'fall' || v === 'free') && dust.map((e, k) => <i key={k} className="ci-ember gold" style={{ left: e.left, animationDuration: e.d, animationDelay: e.delay, width: e.s, height: e.s }} />)}
        {v === 'title' && <i className="cf-dawn" />}
        {v === 'hero' && <><i className="cf-dawn" /><div className="cf-me center big"><Portrait id={fighterId} size={190} mood="confident" /></div></>}
        <i className="ci-vig soft" />
      </>
    );
  };
  return <Reel shots={shots} name={name} className="ci-final ci-ending" stage={stage} skippable onDone={onDone} />;
}
