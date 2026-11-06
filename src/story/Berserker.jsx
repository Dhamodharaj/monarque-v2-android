import { useMemo } from 'react';
import { Reel } from './Reel.jsx';
import { Portrait } from './ui.jsx';
import { BERSERKER_SCENE, BERSERKER_OUTRO } from './narration.js';

const ARCHIVE = ['hades', 'kali', 'surtr', 'thanatos', 'typhon', 'ravana', 'apep', 'hel'];
const embersFor = (n) => Array.from({ length: n }, (_, k) => ({ left: `${(k * 31) % 100}%`, d: `${3 + (k % 5)}s`, delay: `${-(k % 7)}s`, s: 2 + (k % 4) }));

/** Round 6, before the duel: Monarque cracks a seal in the archive, the warrior is dragged out, then he pours his power into it. */
export function BerserkerIntro({ fighterId, berserkerId, berserkerName, name, onDone }) {
  const beats = BERSERKER_SCENE(berserkerName);
  const shots = beats.map((b, k) => ({ ...b, ...[
    { fx: 'shout', cue: 'sBoom', vis: 'gm' }, { vis: 'gm', cue: 'gmWarn' }, { vis: 'archive', cue: 'sBell', vol: 0.6, dur: 4200 }, { vis: 'sealed', cue: 'sBoom', dur: 4200 },
    { vis: 'sealed', cue: undefined }, { vis: 'surge', fx: 'hit', cue: 'CURSE_INJECTION', dur: 5200 }, { vis: 'awake', fx: 'hit2', cue: 'sBoom', vol: 1, dur: 3600 }, { vis: 'awake', cue: 'gmDecree' }, { vis: 'awake', fx: 'shout', cue: 'sVs' },
  ][k] }));
  const embers = useMemo(() => embersFor(30), []);
  const stage = (shot) => {
    const v = shot.vis;
    const beast = v === 'sealed' || v === 'surge' || v === 'awake';
    return (
      <>
        <img className="ci-bg berserk" src="/ui/round-6.webp" alt="" />
        <i className={`cb-tint ${v === 'surge' || v === 'awake' ? 'red' : ''}`} />
        {v === 'archive' && <div className="cb-archive">{ARCHIVE.map((a, k) => <img key={a} src={`/story/fighters/${a}.webp`} alt="" className={k === 3 ? 'pick' : ''} style={{ '--i': k }} />)}</div>}
        {beast && <div className={`cb-beast ${v}`}><img src={`/story/fighters/${berserkerId}.webp`} alt={berserkerName} />{v !== 'sealed' && <i className="cs-rage" aria-hidden="true" />}{v === 'sealed' && <><i className="cb-chain a" /><i className="cb-chain b" /></>}</div>}
        {(v === 'gm') && <div className="cb-gm"><Portrait id={null} gm size={150} /></div>}
        {(v === 'surge' || v === 'awake') && <><div className="cb-beam" />{embers.map((e, k) => <i key={k} className="ci-ember red" style={{ left: e.left, animationDuration: e.d, animationDelay: e.delay, width: e.s, height: e.s }} />)}</>}
        {v === 'surge' && <div className="cb-gm side"><Portrait id={null} gm size={96} /></div>}
        <i className="ci-vig soft" />
      </>
    );
  };
  return <Reel shots={shots} name={name} className="ci-berserk" stage={stage} skippable={false}
    speaker={(shot) => shot.k === 'p' && <div className="ci-hero" key={shot.t}><Portrait id={fighterId} size={104} mood="angry" /></div>} onDone={onDone} />;
}

/** Round 6, the moment the Berserker falls: the surge burns out of it, Monarque is shaken, the leftover power is claimed. */
export function BerserkerOutro({ fighterId, berserkerId, berserkerName, name, onDone }) {
  const beats = BERSERKER_OUTRO(berserkerName);
  const shots = beats.map((b, k) => ({ ...b, ...[
    { vis: 'burn', fx: 'hit', cue: 'sBoom', dur: 5200 }, { vis: 'fall', cue: 'sBell', vol: 0.8, dur: 5200 }, { vis: 'shock', fx: 'shout', cue: 'gmWarn' }, { vis: 'orb', cue: 'sClaim', vol: 0.7, dur: 5600 }, { vis: 'take', cue: 'sVs', vol: 0.7 },
  ][k] }));
  const embers = useMemo(() => embersFor(30), []);
  const stage = (shot) => {
    const v = shot.vis;
    return (
      <>
        <img className="ci-bg berserk" src="/ui/round-6.webp" alt="" />
        <i className={`cb-tint ${v === 'burn' || v === 'orb' || v === 'take' ? 'red' : ''}`} />
        {(v === 'burn' || v === 'fall') && <div className={`cb-beast ${v}`}><img src={`/story/fighters/${berserkerId}.webp`} alt={berserkerName} />{v === 'burn' && <i className="cs-rage" aria-hidden="true" />}{v === 'fall' && <i className="cb-seal" aria-hidden="true">✦</i>}</div>}
        {v === 'shock' && <div className="cb-gm"><Portrait id={null} gm size={150} /></div>}
        {(v === 'orb' || v === 'take') && <div className="cb-orb"><i /><img src={`/story/fighters/${berserkerId}.webp`} alt="" /></div>}
        {(v === 'burn' || v === 'orb' || v === 'take') && embers.map((e, k) => <i key={k} className="ci-ember red" style={{ left: e.left, animationDuration: e.d, animationDelay: e.delay, width: e.s, height: e.s }} />)}
        <i className="ci-vig soft" />
      </>
    );
  };
  return <Reel shots={shots} name={name} className="ci-berserk" stage={stage} skippable={false}
    speaker={(shot) => shot.k === 'p' && <div className="ci-hero" key={shot.t}><Portrait id={fighterId} size={104} mood="angry" /></div>} onDone={onDone} />;
}
