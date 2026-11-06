import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gameSounds } from '../utils/sound.js';
import { ROSTER, GROUPS, FIGHTER_BY_ID } from './roster.js';
import { POWER_OF, describePower, stepForWins, FAMILY, BERSERK_BOOST } from './powers.js';
import { BERSERK_STAT_BOOST } from './progression.js';
import {
  newRun, loadRun, saveRun, clearRun, loadProfile, updateProfile, opponentFor, tickerFor, claimOptions, buildBerserker,
  buildDuelCfg, stepOf, storyBridge, ROUND_NAMES, FIELD_AFTER, roundLabel,
} from './storyFlow.js';
import { lineFor } from './reactions.js';
import { twistFor } from './storyFlow.js';
import { trialFor } from './trials.js';
import { Portrait, PowerChip, MonarqueChip, StepBadge, Pips, MonarqueLine, RoadMap, scene } from './ui.jsx';
import Opening from './Opening.jsx';
import Cutscene, { Duo } from './Cutscene.jsx';
import { FinalIntro, FinalBlow, FinalEnding } from './Final.jsx';
import { BerserkerIntro, BerserkerOutro } from './Berserker.jsx';
import { ROUND_LINES, WIN_LINES, BERSERKER_FALLS, BERSERKER_LEVEL, TURNING_POINT, FINAL_TERMS, BOUT_OPENERS, FINAL_BLOW, ENDING, KEEPSAKE_PROMPT } from './narration.js';
import DifficultyPicker from '../components/DifficultyPicker.jsx';
import { loadDifficulty, saveDifficulty, difficultyOf } from '../config/difficulty.js';
import './story.css';

// Monarque's host lines (the tournament narration lives in narration.js). Proud and arrogant throughout; he wants you strong, and he wants you to know he made you so.
const MONARQUE_LINES = {
  round: ROUND_LINES,
  claim: 'Take it. A fallen being’s power, passed to you. Wield it as though it were always yours.',
  fate: 'Another card for my Gallery. I expected more from you.',
  retry: 'Rise. I did not choose you to fall this early.',
};
const TIPS = {
  SENZU: 'Can mend itself. Drain their Soul or end the duel quickly.', FINAL_ATONEMENT: 'Can spend its own HP to wound everyone. Keep your HP healthy.',
  OTHER_WORLD: 'Can turn the order over for a few rounds. Keep cheap beings that win on the lower stat.', SOLAR_FLARE: 'Can blind you and drain Soul. Hold some Soul in reserve.',
  SCOUTER: 'Reads your hand. Vary what you lead.', SHENRON_WISH: 'Can become unbreakable or double a card. Bait it with a cheap being.', MAFUBA: 'Can seal your played card and void the round. Lead a bait card first.',
};
const classify = (mine, theirs) => (theirs - mine > 2 ? ['Dangerous', 'bad'] : theirs - mine > 0.5 ? ['Slight edge to them', 'warn'] : mine - theirs > 2 ? ['You are favoured', 'good'] : ['Even match', 'mid']);

/** The player only knows a five-round tournament. The Berserker and Monarque himself are a surprise: until the reveal, hide them from every readout. */
const hiddenTail = (run) => run.round <= 5 || (run.round === 6 && run.phase === 'LEVEL');
const publicRoundName = (run) => (run.round <= 5 ? ROUND_NAMES[run.round] : hiddenTail(run) ? 'Tournament won' : ROUND_NAMES[run.round]);

export default function StoryApp({ onExit, onStartDuel }) {
  const [run, setRunState] = useState(() => loadRun());
  const [slide, setSlide] = useState(0);
  const [outroSeen, setOutroSeen] = useState('');
  const [sel, setSel] = useState(ROSTER[0]?.id);
  const [difficulty, setDifficultyRaw] = useState(() => loadDifficulty('story'));
  const setDifficulty = (id) => setDifficultyRaw(saveDifficulty('story', id));
  const [claim, setClaim] = useState(null);
  const [profile, setProfile] = useState(() => loadProfile());
  const [mode, setMode] = useState(() => (storyBridge.pending && loadRun() ? 'run' : loadRun() ? 'resume' : 'select'));
  const handled = useRef(false);
  const setRun = (r) => { setRunState(r); if (r) saveRun(r); };
  // Dark soundscape: set before any child effect runs, then pick the score for the scene.
  useLayoutEffect(() => { gameSounds.setTheme('dark'); }, []);
  const scoreKey = !run || mode !== 'run' ? 'menu' : run.phase === 'BRACKET' && run.round === 1 && run.wins === 0 ? 'BRACKET1' : run.phase;
  useEffect(() => {
    const track = { menu: 'menu', INTRO: 'gm', BRACKET: 'menu', BRACKET1: 'duel', SCOUT: 'menu', WIN: 'menu', LEVEL: 'menu', LOSS: 'gm', BERSERKER_SCENE: 'gm', FINAL_INTRO: 'gm', FINAL: 'gm', FINAL_BLOW: 'gm', ENDING: 'duel' }[scoreKey];
    if (track) gameSounds.startMusic(track);
    if (scoreKey === 'LEVEL') gameSounds.cue('sLevel', 0.9);
    if (scoreKey === 'FINAL_INTRO' || scoreKey === 'BERSERKER_SCENE') gameSounds.cue('sBoom', 0.9);
  }, [scoreKey]);
  const sc = scene(!run || mode !== 'run' ? 'menu' : run.round >= 7 || ['ENDING', 'FINAL_INTRO', 'FINAL_BLOW', 'BERSERKER_SCENE', 'INTRO'].includes(run.phase) ? 'gm' : 'arena', run ? `${run.seed}${run.round}` : '', run?.round ?? 0);

  // Return from a Battle duel: turn the result into the next story beat.
  useEffect(() => {
    const res = storyBridge.pending; if (!res || handled.current || !run) return;
    handled.current = true; storyBridge.pending = null;
    const next = { ...run, last: res, phase: 'WIN' };
    if (run.round === 7) {
      if (res.won) { setSlide(0); setRun({ ...run, last: res, phase: 'FINAL_BLOW' }); return; }
      const boutsLost = run.boutsLost + 1; setRun({ ...run, last: res, boutsLost, phase: 'LOSS' }); return;
    }
    if (res.won) { setClaim(null); setRun(next); } else setRun({ ...next, phase: 'LOSS' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (fighterId) => {
    const r = newRun(fighterId, `run-${Date.now()}`, profile.keepsake, difficulty);
    // The kept memory lasts exactly one run: it is spent as soon as that run begins. (Picking the same contender would waste it, so it stays kept.)
    const spent = !!profile.keepsake && profile.keepsake !== fighterId;
    setProfile(updateProfile((p) => ({ ...p, runs: p.runs + 1, keepsake: spent ? null : p.keepsake }))); setSlide(0); setRun(r); setMode('run');
  };
  const go = (phase, patch = {}) => setRun({ ...run, ...patch, phase });
  const startDuel = (r = run) => { handled.current = false; gameSounds.cue('sVs', 0.9); const cfg = buildDuelCfg(r); storyBridge.cfg = cfg; setRun({ ...r, phase: 'DUEL' }); onStartDuel(cfg); };
  const quitRun = () => { clearRun(); setRunState(null); setMode('select'); };

  // ---------- pre-run ----------
  if (!run || mode === 'select' || mode === 'resume') {
    if (mode === 'resume' && run) {
      const f = FIGHTER_BY_ID[run.fighterId];
      return (
        <main style={sc} className="sm-screen sm-center">
          <h1 className="sm-title">THE TOURNAMENT OF THE FALLEN</h1>
          <div className="sm-panel sm-resume">
            <Portrait id={run.fighterId} size={84} />
            <div><b>{f.name}</b><p>{run.round >= 7 ? 'Monarque waits' : `${publicRoundName(run)} · ${run.wins} win${run.wins === 1 ? '' : 's'} · ${run.powers.length} power${run.powers.length === 1 ? '' : 's'}`} · {difficultyOf(run.difficulty).label}</p></div>
          </div>
          <div className="sm-row">
            <button className="sm-btn primary" onClick={() => { setMode('run'); if (run.phase === 'DUEL') setRun({ ...run, phase: run.round >= 7 ? 'FINAL' : 'SCOUT' }); }}>Continue the rite</button>
            <button className="sm-btn" onClick={() => { clearRun(); setRunState(null); setMode('select'); }}>Begin anew</button>
            <button className="sm-btn ghost" onClick={onExit}>Back</button>
          </div>
        </main>
      );
    }
    return <FighterSelect sc={sc} sel={sel} setSel={setSel} onStart={start} onExit={onExit} keepsake={profile.keepsake} difficulty={difficulty} setDifficulty={setDifficulty} />;
  }

  const me = FIGHTER_BY_ID[run.fighterId];
  const step = stepOf(run);
  const phase = run.phase;
  const header = (
    <header className="sm-topbar">
      <button className="sm-btn ghost small" onClick={() => setMode('resume')}>☰ Pause</button>
      <div className="sm-crumbs">{Array.from({ length: hiddenTail(run) ? 5 : 7 }, (_, k) => k + 1).map((r) => <i key={r} className={r < run.round ? 'done' : r === run.round ? 'now' : ''} title={ROUND_NAMES[r]} />)}</div>
      <div className="sm-who"><Portrait id={run.fighterId} size={30} /><b>{me.short}</b><StepBadge step={step} /></div>
    </header>
  );

  // ---------- intro ----------
  if (phase === 'INTRO') return <Opening fighterId={run.fighterId} style={sc} onDone={() => go('BRACKET')} onRefuse={() => { quitRun(); onExit(); }} />;

  // ---------- bracket / what next ----------
  if (phase === 'BRACKET') {
    const opp = opponentFor(run); const gm = run.round === 7;
    const ticker = run.round > 1 && run.round <= 6 ? tickerFor(run, run.round - 1) : [];
    return (
      <main style={sc} className="sm-screen">
        {header}
        <div className="sm-roundhead"><small>NEXT THRESHOLD</small><h2>{roundLabel(run)}</h2><p>{gm ? 'The throne.' : run.round === 6 ? 'A sealed warrior, woken in fury.' : `${FIELD_AFTER[run.round] === 1 ? 'One contender will remain.' : `${FIELD_AFTER[run.round] * 2} contenders left. ${FIELD_AFTER[run.round]} will survive.`}`}</p></div>
        <RoadMap nodes={[1, 2, 3, 4, 5].map((r) => {
          const done = r < run.round; const now = r === run.round; const known = done || now;
          const id = known ? run.bracket.path[r].fighterId : null;
          return { r, state: done ? 'done' : now ? 'now' : 'todo', id, gm: false, label: ROUND_NAMES[r], name: known ? FIGHTER_BY_ID[id].short : '???' };
        })} />
        <section className="sm-grid two">
          <div className="sm-panel">
            <h3>What is owed</h3>
            <ul className="sm-stake">
              <li className="win">Win: take {gm ? 'the end of the binding' : `${FIGHTER_BY_ID[opp.fighterId]?.short}’s power`}{!gm && run.round < 6 && ', and your strength adapts'}.</li>
              <li className="lose">Lose: {gm ? 'the bout is lost and you face the next.' : 'you are bound into a card.'}</li>
              {!gm && <li className="chance">A Second Chance: <Pips n={run.retriesUsed?.[run.round] ? 0 : 1} of={1} /> {run.retriesUsed?.[run.round] ? 'spent' : 'ready'}</li>}
            </ul>
            <h3>Your powers</h3>
            <div className="sm-powers">{run.powers.map((f) => <PowerChip key={f} fighterId={f} step={step} compact />)}</div>
            <StepMeter wins={run.wins} round={run.round} />
          </div>
          <div className="sm-panel">
            <h3>Elsewhere in the Citadel</h3>
            {ticker.length ? <ul className="sm-ticker">{ticker.slice(0, 8).map((t, i) => <li key={i}><b>{FIGHTER_BY_ID[t.winner].short}</b> bound {FIGHTER_BY_ID[t.loser].short}{t.claim && <> and took <em>{POWER_OF[t.claim].name}</em></>}</li>)}</ul> : <p className="sm-muted">No bell has tolled yet.</p>}
            <MonarqueLine>{MONARQUE_LINES.round[Math.min(run.round, 6)]}</MonarqueLine>
          </div>
        </section>
        <div className="sm-row"><button className="sm-btn primary big" onClick={() => { if (run.round === 6 && !run.berserker) { setRun({ ...run, berserker: buildBerserker(run), phase: 'SCOUT' }); } else go(run.round === 7 ? 'FINAL' : 'SCOUT'); }}>{gm ? 'Face Monarque' : 'Meet your opponent'}</button></div>
      </main>
    );
  }

  // ---------- scouting ----------
  if (phase === 'SCOUT') {
    const opp = opponentFor(run); const f = FIGHTER_BY_ID[opp.fighterId];
    const rate = (fid, steps, claims) => ({ S: 5, A: 4, B: 3, C: 2 }[POWER_OF[fid].grade]) + 0.5 * claims.reduce((s, c) => s + { S: 5, A: 4, B: 3, C: 2 }[POWER_OF[c].grade], 0) + steps - 1;
    const mineR = rate(run.fighterId, step, run.powers.filter((p) => p !== run.fighterId)); const theirR = rate(opp.fighterId, opp.step, opp.powers.slice(1));
    const [verdict, vtone] = classify(mineR, theirR + (run.round === 6 ? 2.5 : 0));
    const families = [...new Set(opp.powers.map((p) => POWER_OF[p].family))].slice(0, 3);
    const retry = (run.retriesUsed?.[run.round] ?? 0) > 0;
    return (
      <main style={sc} className="sm-screen">
        {header}
        <section className="sm-vs">
          <div className="sm-vs-side you"><Portrait id={run.fighterId} size={170} mood="confident" /><b>{me.name}</b><small>{me.type}</small><StepBadge step={step} /></div>
          <div className="sm-vs-mid"><span>VS</span><div className={`sm-verdict ${vtone}`}>{verdict}</div></div>
          <div className="sm-vs-side foe"><Portrait id={opp.fighterId} size={170} mood="confident" /><b>{f.name}</b><small>{f.type} · {GROUPS[f.temperament]?.label}</small><StepBadge step={opp.step} /></div>
        </section>
        <section className="sm-scout">
          <div className="sm-panel sm-foe">{run.round === 6 && <p className="sm-berserk-banner"><b>BERSERK</b> Monarque poured a third of his power into them: +50% HP, Soul and power effects. They hold {opp.powers.length} powers and a power of Monarque’s own.</p>}<h3>What they are</h3><p>{f.desc}</p><h3>Watch out for</h3><ul className="sm-tips">{families.map((fam) => <li key={fam}><b>{FAMILY[fam].label}:</b> {TIPS[fam]}</li>)}</ul>{(() => { const tw = twistFor(run); return tw ? <div className="sm-trial-note sm-twist-note"><b>{tw.icon} Twist: {tw.name}</b><p>{tw.blurb}</p></div> : null; })()}{(() => { const tr = trialFor(run.round); return tr ? <div className="sm-trial-note"><b>This duel tests: {tr.label}</b><p>{tr.blurb} {tr.hint}</p></div> : null; })()}</div>
          <div className="sm-panel">
            <h3>Their powers ({opp.powers.length + (run.round === 6 && opp.monarquePower ? 1 : 0)})</h3>
            <div className="sm-powers">{opp.powers.map((p, i) => <PowerChip key={p} fighterId={p} step={opp.step} tag={run.round === 6 ? 'berserk' : i === 0 ? 'own' : 'taken'} boost={run.round === 6 ? BERSERK_BOOST : 1} compact />)}{run.round === 6 && opp.monarquePower && <MonarqueChip effectId={opp.monarquePower} compact />}</div>
            <MonarqueLine>{retry ? MONARQUE_LINES.retry : MONARQUE_LINES.round[Math.min(run.round, 6)]}</MonarqueLine>
            {retry && <p className="sm-boon">A Second Chance: Monarque lets a Last Draught fall into your hand.</p>}
          </div>
        </section>
        <div className="sm-row"><button className="sm-btn ghost" onClick={() => go('BRACKET')}>Back</button><button className="sm-btn primary big" onClick={() => startDuel()}>Begin the rite</button></div>
      </main>
    );
  }

  if (phase === 'DUEL') {
    return <main style={sc} className="sm-screen sm-center"><p className="sm-muted">The rite is under way…</p><button className="sm-btn primary" onClick={() => startDuel()}>Return to the rite</button></main>;
  }

  // ---------- victory: they become a card, you claim and grow ----------
  if (phase === 'WIN' && run.round === 6 && outroSeen !== String(run.seed)) {
    const o6 = opponentFor(run);
    return <BerserkerOutro key="berserker-outro" fighterId={run.fighterId} berserkerId={o6.fighterId} berserkerName={FIGHTER_BY_ID[o6.fighterId].name} name={me.name} onDone={() => setOutroSeen(String(run.seed))} />;
  }
  if (phase === 'WIN') {
    const opp = opponentFor(run); const f = FIGHTER_BY_ID[opp.fighterId];
    const options = claimOptions(run, opp);
    const berserk = run.round === 6; const chosen = berserk ? options[0] ?? null : claim;
    const nextWins = run.wins + 1; const nextStep = stepForWins(nextWins); const stepUp = run.round < 6 && nextStep > stepOf(run);
    const confirm = () => {
      gameSounds.cue('sClaim', 0.9);
      const powers = chosen ? [...run.powers, chosen] : run.powers;
      const nextRound = run.round + 1;
      const patch = { powers, wins: nextWins, round: nextRound, attempt: 0, phase: 'LEVEL', levelInfo: { berserk, claimed: chosen, stepUp, prevStep: stepOf(run), newStep: run.round < 5 ? nextStep : 3, beat: opp.fighterId } };
      if (berserk) patch.berserkPower = opp.fighterId; // the +40% HP and Soul comes with the power, even if it was already held
      if (nextRound === 6) { const r2 = { ...run, ...patch }; patch.berserker = buildBerserker(r2); }
      updateProfile((p) => ({ ...p, bestRound: Math.max(p.bestRound, run.round), defeated: { ...p.defeated, [opp.fighterId]: (p.defeated[opp.fighterId] ?? 0) + 1 } }));
      setRun({ ...run, ...patch });
    };
    return (
      <main style={sc} className="sm-screen sm-center sm-victory">
        <div className="sm-burst" aria-hidden="true" />
        <div className="sm-vic-head">{berserk ? 'THE BERSERKER FALLS' : 'BOUND'}</div>
        <div className="sm-flip"><Portrait id={opp.fighterId} size={120} mood="defeated" className="flipping" /></div>
        <p className="sm-quote">“{lineFor(opp.fighterId, 'defeat', Math.random, berserk ? 'BERSERKER' : 'MIDDLE')}”</p>
        <p className="sm-body">{berserk ? BERSERKER_FALLS(f.name) : <><b>{f.name}</b> falls and is bound into a card. A power they carried is yours to take.</>}</p>
        {!berserk && <MonarqueLine>{MONARQUE_LINES.claim}</MonarqueLine>}
        <h3>{berserk ? `Take the berserker’s power · restores ${Math.round((BERSERK_STAT_BOOST - 1) * 100)}% HP and Soul when played` : 'Claim one power'}</h3>
        <div className="sm-powers wide">
          {options.length ? options.map((p) => (
            <button key={p} type="button" className={`sm-claim ${(berserk ? true : claim === p) ? 'on' : ''}`} onClick={() => setClaim(p)}>
              <PowerChip fighterId={p} step={run.round < 5 ? nextStep : 3} tag={berserk ? '+40% HP & Soul when played' : p === opp.fighterId ? 'their own' : 'taken'} />
            </button>
          )) : <p className="sm-muted">{berserk ? 'You already hold the berserker’s power. Its +40% HP and Soul on use is yours all the same.' : 'You already hold every power they carried.'}</p>}
        </div>
        <div className="sm-row"><button className="sm-btn primary big" disabled={options.length > 0 && !chosen} onClick={confirm}>{options.length ? (berserk ? 'Take the power' : 'Take this power') : 'Continue'}</button></div>
      </main>
    );
  }

  // ---------- level up / what next ----------
  if (phase === 'LEVEL') {
    const li = run.levelInfo ?? {}; const next = opponentFor(run); const after = run.round >= 7;
    const nf = after ? null : FIGHTER_BY_ID[next.fighterId];
    return (
      <main style={sc} className="sm-screen">
        {header}
        <section className="sm-grid two">
          <div className="sm-panel">
            <h2>{li.berserk ? 'The beast is down' : li.stepUp ? 'Your strength adapts' : 'A being claimed'}</h2>
            <div className="sm-levelrow">{li.stepUp ? <><StepBadge step={li.prevStep} /><b>→</b><StepBadge step={li.newStep} /></> : <StepBadge step={step} />}<span>{run.wins} win{run.wins === 1 ? '' : 's'}</span></div>
            {li.berserk && <p className="sm-body">{BERSERKER_LEVEL}</p>}
            {li.claimed && <><h3>New power</h3><PowerChip fighterId={li.claimed} step={li.newStep ?? step} tag={li.berserk ? '+40% HP & Soul when played' : undefined} /></>}
            {li.stepUp && <><h3>Every power grows with you</h3><ul className="sm-diff">{run.powers.filter((p) => p !== li.claimed).slice(0, 6).map((p) => <li key={p}><b>{POWER_OF[p].name}</b><span>{describePower(POWER_OF[p], li.prevStep).text || 'basic'}</span><i>→</i><span className="up">{describePower(POWER_OF[p], li.newStep).text || 'basic'}</span></li>)}</ul></>}
            <StepMeter wins={run.wins} round={run.round} />
          </div>
          <div className="sm-panel">
            <h2>Next threshold</h2>
            {after ? <MonarqueLine>Now you have my full attention. Do not waste it.</MonarqueLine> : run.round === 6 ? <MonarqueLine>{ROUND_LINES[6]}</MonarqueLine> : (<>
              <div className="sm-foe inline"><Portrait id={next.fighterId} size={84} mood="confident" /><div><b>{nf.name}</b><small>{`${ROUND_NAMES[run.round]} · carries ${next.powers.length} power${next.powers.length === 1 ? '' : 's'}`}</small></div></div>
              <MonarqueLine>{WIN_LINES[run.round - 1] || ROUND_LINES[Math.min(run.round, 6)]}</MonarqueLine>
            </>)}
            <p className="sm-muted">{after ? 'Only Monarque remains.' : run.round === 6 ? 'The tournament is won. Monarque has not finished with you.' : `${6 - run.round} more round${6 - run.round === 1 ? '' : 's'} of the tournament.`}</p>
          </div>
        </section>
        <div className="sm-row"><button className="sm-btn primary big" onClick={() => go(after ? 'FINAL_INTRO' : run.round === 6 ? 'BERSERKER_SCENE' : 'BRACKET', { levelInfo: null })}>Continue</button></div>
      </main>
    );
  }

  // ---------- defeat: you become a card ----------
  if (phase === 'LOSS') {
    const gm = run.round === 7; const opp = opponentFor(run);
    const used = run.retriesUsed?.[run.round] ?? 0;
    if (gm) {
      const left = 3 - run.boutsLost;
      return (
        <main style={sc} className="sm-screen sm-center sm-defeat">
          <div className="sm-vic-head lose">{left > 0 ? 'BOUT LOST' : 'YOU HAVE FALLEN'}</div>
          <MonarqueLine>{left > 0 ? 'Is that all? Get up. I did not make you to break this easily.' : MONARQUE_LINES.fate}</MonarqueLine>
          <p className="sm-body">{left > 0 ? `${left} attempt${left === 1 ? '' : 's'} remain. The Essence frays his mind a little more with every bout, and you keep every power you hold.` : 'You are bound into a card. You may stand before him again, and you keep everything you have earned.'}</p>
          <div className="sm-row">{left > 0 ? <button className="sm-btn primary big" onClick={() => go('FINAL')}>Next bout</button> : <button className="sm-btn primary big" onClick={() => go('FINAL', { boutsLost: 0 })}>Challenge again</button>}<button className="sm-btn ghost" onClick={() => { quitRun(); onExit(); }}>Give up</button></div>
        </main>
      );
    }
    return (
      <main style={sc} className="sm-screen sm-center sm-defeat">
        <div className="sm-vic-head lose">BOUND</div>
        <div className="sm-flip"><Portrait id={run.fighterId} size={110} mood="defeated" card className="flipping" /></div>
        <p className="sm-quote">“{lineFor(opp.fighterId, 'gloat', Math.random, run.round === 6 ? 'BERSERKER' : 'MIDDLE')}”</p>
        <p className="sm-body">{me.short} is being drawn into a card… {used ? 'There is no second chance left.' : 'but Monarque is not finished measuring you.'}</p>
        <MonarqueLine>{used ? MONARQUE_LINES.fate : MONARQUE_LINES.retry}</MonarqueLine>
        <div className="sm-row">
          {!used && <button className="sm-btn primary big" onClick={() => setRun({ ...run, retriesUsed: { ...run.retriesUsed, [run.round]: 1 }, phase: 'SCOUT' })}>Rise again (Second Chance)</button>}
          {used ? <button className="sm-btn primary big" onClick={() => { const r = run; clearRun(); setRunState(null); setMode('select'); updateProfile((p) => ({ ...p, bestRound: Math.max(p.bestRound, r.round - 1) })); }}>Begin anew</button> : <button className="sm-btn ghost" onClick={() => { quitRun(); onExit(); }}>Yield the rite</button>}
        </div>
      </main>
    );
  }

  // ---------- the Berserker: Monarque pulls a sealed warrior from the archive ----------
  if (phase === 'BERSERKER_SCENE') {
    const bz = run.berserker ?? buildBerserker(run); const bf = FIGHTER_BY_ID[bz.fighterId];
    return <BerserkerIntro key="berserker-scene" fighterId={run.fighterId} berserkerId={bz.fighterId} berserkerName={bf.name} name={me.name} onDone={() => setRun({ ...run, berserker: bz, phase: 'SCOUT' })} />;
  }

  // ---------- final: the turning point, then the three bouts ----------
  if (phase === 'FINAL_INTRO') return <FinalIntro key="final-intro" fighterId={run.fighterId} name={me.name} roster={ROSTER.map((f) => f.id).filter((id) => id !== run.fighterId)} onDone={() => go('FINAL', { boutsLost: 0 })} />;
  if (phase === 'FINAL') {
    const bout = Math.min(2, run.boutsLost);
    return (
      <main style={sc} className="sm-screen">
        {header}
        <section className="sm-scout">
          <div className="sm-panel sm-foe">
            <Portrait gm size={108} mood="confident" /><h2>Monarque</h2><small>Sovereign of the Outburst</small>
            <p>{['Contact. Six Edicts, and the full, unbroken arrogance of a king.', 'Pressure. Five Edicts. The Essence gnaws at him, and he only grows more ferocious.', 'Fading. Four Edicts and less of his mind, but he still fights like a god.'][bout]}</p>
            <Pips n={3 - run.boutsLost} of={3} /> <small>attempts left</small>
            {(() => { const tr = trialFor(7, bout); return tr ? <div className="sm-trial-note"><b>This bout tests: {tr.label}</b><p>{tr.blurb} {tr.hint}</p></div> : null; })()}
          </div>
          <div className="sm-panel"><h3>Your powers ({run.powers.length})</h3><div className="sm-powers">{run.powers.map((f) => <PowerChip key={f} fighterId={f} step={3} tag={f === run.berserkPower ? '+40% HP & Soul when played' : undefined} compact />)}</div><p className="sm-muted">{FINAL_TERMS}</p><p className="sm-muted">He will speak once the bout begins.</p></div>
        </section>
        <div className="sm-row"><button className="sm-btn primary big" onClick={() => startDuel({ ...run, round: 7, phase: 'DUEL' })}>{roundLabel({ ...run, round: 7 })}</button></div>
      </main>
    );
  }

  // ---------- the final blow ----------
  if (phase === 'FINAL_BLOW') return <FinalBlow key="final-blow" fighterId={run.fighterId} name={me.name} onDone={() => { setSlide(0); go('ENDING'); }} />;

  // ---------- ending: the fallen are free, then the keepsake ----------
  if (phase === 'ENDING') {
    if (slide === 0) return <FinalEnding key="ending" fighterId={run.fighterId} name={me.name} roster={ROSTER.map((f) => f.id).filter((id) => id !== run.fighterId)} onDone={() => setSlide(1)} />;
    return (
      <main style={sc} className="sm-screen sm-center sm-victory">
        <div className="sm-burst" aria-hidden="true" />
        <div className="sm-vic-head">THE FALLEN ARE FREE</div>
        <p className="sm-credit">A game by <b>dhamo ss</b><span className="sm-music-credit">Music: “Unsolved Investigation” by isaiah658</span></p>
        <p className="sm-body">{KEEPSAKE_PROMPT}</p>
        <p className="sm-muted">Choose one power to carry into your next run. It is yours for that one run only, then it fades. The Berserker’s power cannot be kept.</p>
        <div className="sm-powers wide">{run.powers.filter((p) => p !== run.berserkPower).map((p) => <button key={p} type="button" className={`sm-claim ${claim === p ? 'on' : ''}`} onClick={() => setClaim(p)}><PowerChip fighterId={p} step={3} /></button>)}</div>
        <div className="sm-row"><button className="sm-btn primary big" disabled={!claim} onClick={() => { const k = claim; setProfile(updateProfile((p) => ({ ...p, keepsake: k, clears: p.clears + 1, bestRound: 7 }))); clearRun(); setRunState(null); setClaim(null); setSlide(0); setMode('select'); }}>Keep this memory</button></div>
      </main>
    );
  }
  return <main style={sc} className="sm-screen sm-center"><button className="sm-btn" onClick={() => go('BRACKET')}>Continue</button></main>;
}

function StepMeter({ wins, round }) {
  if (round >= 6) return <div className="sm-meter"><StepBadge step={3} /><small>Fully adapted</small></div>;
  const step = stepForWins(wins); const toNext = step === 1 ? 2 - wins : step === 2 ? 4 - wins : 0;
  return <div className="sm-meter"><StepBadge step={step} /><Pips n={wins} of={5} /><small>{toNext ? `${toNext} win${toNext === 1 ? '' : 's'} to ${['', 'Adaptation', 'Stability'][step]}` : 'Fully adapted'}</small></div>;
}

function FighterSelect({ sc, sel, setSel, onStart, onExit, keepsake, difficulty, setDifficulty }) {
  const f = FIGHTER_BY_ID[sel]; const spec = POWER_OF[sel]; const d = describePower(spec, 1);
  const groups = useMemo(() => Object.values(GROUPS).map((g) => ({ ...g, list: ROSTER.filter((x) => x.temperament === g.id) })), []);
  return (
    <main style={sc} className="sm-screen">
      <header className="sm-topbar"><button className="sm-btn ghost small" onClick={onExit}>← Back</button><h1 className="sm-title small">CHOOSE YOUR CONTENDER</h1><span />{keepsake && <span className="sm-keep" title="Joins your next run, then fades">Memory kept (next run only): {POWER_OF[keepsake].name}</span>}</header>
      <div className="sm-select">
        <div className="sm-roster">
          {groups.map((g) => (
            <section key={g.id}><h3>{g.label}</h3>
              <div className="sm-tiles">{g.list.map((x) => <button key={x.id} type="button" className={`sm-tile ${sel === x.id ? 'on' : ''}`} onClick={() => setSel(x.id)}><Portrait id={x.id} size={84} /><span>{x.short}</span><em className={`g-${POWER_OF[x.id].grade}`}>{POWER_OF[x.id].grade}</em></button>)}</div>
            </section>
          ))}
        </div>
        <aside className="sm-panel sm-detail">
          <div className="sm-detail-in" key={sel}>
          <Portrait id={sel} size={190} />
          <h2>{f.name}</h2><small>{f.type} · {GROUPS[f.temperament]?.label}</small>
          <p>{f.desc}</p>
          <h3>Your power</h3>
          <PowerChip fighterId={sel} step={1} /><p className="sm-flavor">{spec.flavor}</p>
          {spec.grade === 'C' && <p className="sm-muted">A weaker power: a challenge pick.</p>}
          </div>
          <div className="sm-diff"><h3>Difficulty</h3><DifficultyPicker value={difficulty} onChange={setDifficulty} /></div>
          <button className="sm-btn primary big sm-enter" onClick={() => onStart(sel)}>Enter the Citadel</button>
        </aside>
      </div>
    </main>
  );
}
