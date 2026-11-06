const StoryApp = lazy(() => import('./story/StoryApp.jsx'));
import StoryHud from './story/StoryHud.jsx';
import { createStoryEngine } from './story/duel.js';
import { ReactionTracker } from './story/reactions.js';
import { BattleChatter } from './story/chatter.js';
import { resetVariety } from './story/voiceBank.js';
import { makePowerPicker } from './story/storyAI.js';
import { configureFoeAI } from './story/trials.js';
import { pickTwist } from './game/twists.js';
import { TacticsDirector } from './game/tactics.js';
import { clutchBonus } from './game/drama.js';
import { applyMatch, applyStoryWin, STORY_CLEAR_COINS } from './services/progress.js';
import { showRewardToast } from './utils/toast.js';
import { applyDifficultyToAI, applyRivalBonus, scaleAdapt, difficultyOf, normalizeDifficulty } from './config/difficulty.js';
import { storyBridge } from './story/storyFlow.js';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import cards from './data/cards.json';
import { GameEngine } from './game/GameEngine';
import { AIEngine } from './game/AIEngine';
import { takeAiTurn } from './game/AITurn.js';
import AudioChip from './components/AudioChip.jsx';
import { describeEvent, factsLine, eventTone, soundsForEvent, wantsSpotlight } from './game/presentation.js';
import { GAME_CONFIG } from './config/gameConfig.js';
import { loadGameData, resetGameData, updateGameData } from './services/storage.js';
import Home from './pages/Home';
import CardShop from './components/CardShop';
import GameInfo from './components/GameInfo';
import ModeSelect from './pages/ModeSelect';
import Game from './pages/Game';
import Result from './pages/Result';
import './styles.css';
import './ui-additions.css';
import './ui-v9.css';
import './ui-v10.css';
import './monarque-theme.css';
import { gameSounds } from './utils/sound.js';
import { L, setLexMode } from './game/lexicon.js';
import { BATTLE_RIVALS } from './pages/ModeSelect.jsx';

const SCREENS = { HOME: 'HOME', MODE: 'MODE', GAME: 'GAME', RESULT: 'RESULT', SHOP: 'SHOP', STORY: 'STORY' };

// One backdrop per story round, from the supplied round images. The Monarque's final fight has its own (round-7).
const STORY_ARENAS = [
  { id: 'cathedral', name: 'Eclipsed Cathedral', image: '/ui/round-1.webp' },
  { id: 'temple', name: 'Blood Moon Temple', image: '/ui/round-2.webp' },
  { id: 'fortress', name: 'Infernal Fortress', image: '/ui/round-3.webp' },
  { id: 'citadel', name: 'Frozen Citadel', image: '/ui/round-4.webp' },
  { id: 'sea', name: 'Sunken Sea', image: '/ui/round-5.webp' },
  { id: 'ruins', name: 'Gothic Ruins', image: '/ui/round-6.webp' },
  { id: 'cosmic', name: 'Cosmic Vortex Ruins', image: '/ui/round-7.webp' }
];
const AI_MIN_DELAY = 650;
const AI_MAX_DELAY = 1100;

const getRandomAIDelay = () =>
  Math.floor(Math.random() * (AI_MAX_DELAY - AI_MIN_DELAY + 1)) + AI_MIN_DELAY;

export default function App() {
  const engineRef = useRef(null);
  const aiTimer = useRef(null);
  const musicHold = useRef(null); // set while the soundtrack fades out on leaving Story Mode
  const aiRef = useRef(new AIEngine(cards));
  const battleDiffRef = useRef('easy');
  const battleTwistsRef = useRef(true);
  const [lastReward, setLastReward] = useState(null);
  const tacticsRef = useRef(null); const tacticsK = useRef(1); // rival personalities: per-match stance director and its difficulty intensity
  const [screen, setScreen] = useState(SCREENS.HOME);
  const [state, setState] = useState(null);
  const [selectedArena, setSelectedArena] = useState(null);
  const [visibleTrick, setVisibleTrick] = useState(null);
  const [roundResult, setRoundResult] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false); // the first-time tutorial pauses the AI while it is on screen
  const [error, setError] = useState('');
  const [spotlight, setSpotlight] = useState(null);
  const [logLines, setLogLines] = useState([]);
  const [retryTick, setRetryTick] = useState(0);
  const [koIds, setKoIds] = useState([]);
  const [dealing, setDealing] = useState(false);
  const storyRef = useRef(null);
  const [storyUi, setStoryUi] = useState({ mood: 'confident', bubble: null, used: [] });
  const lastSeq = useRef(0);
  const spotQueue = useRef([]);
  const spotBusy = useRef(false);
  const resultTimer = useRef(null);
  const [persistentData, setPersistentData] = useState(() => loadGameData());
  const matchStartedAt = useRef(null);
  const recordedMatchId = useRef(null);

  const sync = () => setState(engineRef.current.getView(engineRef.current.state.players[0].id));

  const namesRef = useRef(null);
  const chatRef = useRef(null);
  const lastSpeechRound = useRef(0);
  const [speech, setSpeech] = useState({});
  // In-character table talk from the AI seats: one bubble per seat. It stays until that round is decided, or the seat says something new.
  const say = (lines = []) => { for (const l of lines) setSpeech((m) => ({ ...m, [l.playerId]: l })); };
  // The player taps a bubble and sends an emoji: the rival may answer a moment later, if it feels like it.
  const reactToSeat = (playerId, emoji) => {
    const chat = chatRef.current; const engine = engineRef.current; if (!chat || !engine) return;
    const out = chat.react(playerId, emoji, engine.getView(engine.state.players[0].id));
    if (out.length) window.setTimeout(() => { if (chatRef.current === chat && engineRef.current === engine) say(out); }, 600 + Math.random() * 900);
  };
  const reactToFoe = (emoji) => {
    const s = storyRef.current; const foe = engineRef.current?.state?.players?.[1]; if (!s || !foe) return;
    const me = engineRef.current.state.players[0];
    const line = s.tracker.react(emoji, foe.hp / Math.max(1, foe.maxHp ?? 100), { foeHp: foe.hp, foeMax: foe.maxHp ?? 100, meHp: me?.hp, meMax: me?.maxHp ?? 100 });
    if (line) window.setTimeout(() => { if (storyRef.current === s) setStoryUi((u) => ({ ...u, mood: s.tracker.mood, bubble: line })); }, 600 + Math.random() * 900);
  };
  const startMatch = (mode, arena = selectedArena, names = null, difficulty = battleDiffRef.current, twists = battleTwistsRef.current) => {
    battleTwistsRef.current = twists !== false;
    if (names) namesRef.current = names;
    battleDiffRef.current = normalizeDifficulty(difficulty);
    if (arena) setSelectedArena(arena);
    try {
      gameSounds.unlock(); gameSounds.cue('arenaConfirm', 0.8);
      storyRef.current = null; setLexMode('battle');
      const engine = new GameEngine(cards, { drama: true, twist: battleTwistsRef.current ? pickTwist(Math.random, 0.15) : null });
      aiRef.current = applyDifficultyToAI(new AIEngine(cards), battleDiffRef.current); // reads hidden cards as a blurry range, like a person (sharper on higher difficulty)
      setSpeech({}); lastSpeechRound.current = 0; resetVariety();
      engine.createMatch(mode, (namesRef.current && namesRef.current.length >= mode ? namesRef.current : [persistentData.profile.name, ...BATTLE_RIVALS]).slice(0, mode));
      engine.startMatch(); applyRivalBonus(engine, battleDiffRef.current);
      engineRef.current = engine;
      chatRef.current = new BattleChatter({ players: engine.state.players, humanId: engine.state.players[0].id });
      for (const [pid, t] of Object.entries(chatRef.current.temperaments())) aiRef.current.setPersona(pid, t);
      tacticsRef.current = new TacticsDirector({ temperaments: chatRef.current.temperaments(), humanId: engine.state.players[0].id }); tacticsK.current = difficultyOf(battleDiffRef.current).tactics;
      aiRef.current.setHuman(engine.state.players[0].id); aiRef.current.setAdapt(scaleAdapt(0.4, battleDiffRef.current)); if (difficultyOf(battleDiffRef.current).aggrAdd) aiRef.current.aggression = 1 + difficultyOf(battleDiffRef.current).aggrAdd; // rivals pick up your habits, gently
      window.setTimeout(() => { if (chatRef.current && engineRef.current === engine) say(chatRef.current.intro(engine.getView(engine.state.players[0].id))); }, 3400);
      setState(engine.getView(engine.state.players[0].id));
      setVisibleTrick(null);
      setRoundResult(null);
      setSelectedCard(null);
      setError('');
      matchStartedAt.current = Date.now();
      recordedMatchId.current = null;
      setKoIds([]); setDealing(true); lastSeq.current = 0; spotQueue.current = []; spotBusy.current = false; setSpotlight(null); setLogLines([]);
      ingestEvents(engine.getView(engine.state.players[0].id), true);
      gameSounds.startMusic('battle'); gameSounds.startAmbience(arena?.id); gameSounds.seq([['shuffle', 0, 0.6], ['matchStart', 150, 0.8], ['deal', 500, 0.5]]);
      setScreen(SCREENS.GAME);
    } catch (err) { setError(L(err.message)); }
  };

  const startStoryDuel = (cfg) => {
    try {
      gameSounds.unlock(); gameSounds.cue('arenaConfirm', 0.8);
      setLexMode('story');
      const engine = createStoryEngine(cards, cfg);
      aiRef.current = applyDifficultyToAI(configureFoeAI(new AIEngine(cards), { ...cfg, aggression: cfg.aggression ?? 1.2 }), cfg.difficulty);
      tacticsRef.current = new TacticsDirector({ temperaments: { 'player-2': cfg.foe.temperament ?? 'SOVEREIGN' } }); tacticsK.current = difficultyOf(cfg.difficulty).tactics;
      const tracker = new ReactionTracker({ fighterId: cfg.foe.fighterId, isGm: cfg.foe.gmBout != null, stage: cfg.stage });
      chatRef.current = null; setSpeech({}); resetVariety();
      storyRef.current = { cfg, tracker, picker: makePowerPicker(engine, cfg.foe.temperament, Math.random, cfg.picker ?? cfg.trial?.picker, (id) => aiRef.current?.humanRead?.(id)) };
      engineRef.current = engine;
      const arena = STORY_ARENAS[cfg.arena % STORY_ARENAS.length]; setSelectedArena(arena);
      const view = engine.getView(engine.state.players[0].id);
      setState(view); setVisibleTrick(null); setRoundResult(null); setSelectedCard(null); setError('');
      matchStartedAt.current = Date.now(); recordedMatchId.current = view.matchId;
      setKoIds([]); setDealing(true); lastSeq.current = 0; spotQueue.current = []; spotBusy.current = false; setSpotlight(null); setLogLines([]);
      setStoryUi({ mood: 'confident', bubble: null, used: [] });
      ingestEvents(view, true);
      gameSounds.startMusic('battle'); gameSounds.startAmbience(arena.id); gameSounds.seq([['shuffle', 0, 0.6], ['matchStart', 150, 0.8], ['deal', 500, 0.5]]);
      setScreen(SCREENS.GAME);
      window.setTimeout(() => { const t = storyRef.current?.tracker; const open = storyRef.current?.cfg?.hud?.opener; if (open) { setStoryUi(u => ({ ...u, mood: 'confident', bubble: { mood: 'confident', text: open, who: 'gm', id: `open-${Date.now()}` } })); } else if (t) { const r = t.intro(); if (r.length) setStoryUi(u => ({ ...u, mood: t.mood, bubble: r[0] })); } }, 2600);
    } catch (err) { setError(L(err.message)); setScreen(SCREENS.STORY); }
  };
  // Story first clears pay coins (more on harder difficulties); feats can complete here too.
  const rewardStoryWin = (cfg) => {
    try {
      const round = cfg?.roundNo; if (!round) return; const diff = cfg.difficulty; let out = null;
      const next = updateGameData((data) => { out = applyStoryWin(data.progress, { round, difficulty: diff });
        const clear = out.firstClear ? Math.round((STORY_CLEAR_COINS[round] ?? 0) * difficultyOf(diff).coinMul) : 0; out.clear = clear; const gained = clear + out.coins;
        return { ...data, progress: out.progress, profile: { ...data.profile, walletCoins: data.profile.walletCoins + gained }, stats: { ...data.stats, coinsEarned: data.stats.coinsEarned + gained } }; });
      setPersistentData(next);
      const lines = []; if (out.clear) lines.push(`First clear: +${out.clear} coins`);
      for (const f of out.earned) lines.push(`Feat earned: ${f.name} (+${f.reward} coins)`);
      if (lines.length) showRewardToast(lines);
    } catch { /* rewards are best-effort */ }
  };
  const afterStory = (before, after) => {
    const s = storyRef.current; if (!s) return;
    try {
      const reactions = s.tracker.observe(before, after);
      const used = (after.eventLog ?? []).filter(e => e.type === 'WILDCARD_USED' && e.playerId !== after.players[0].id && (e.detail?.story?.fighter || String(e.card?.id ?? '').startsWith('berserk-'))).map(e => e.detail?.story?.fighter ?? '@edict');
      const talk = reactions.filter((r) => !r.kind); const shout = reactions.find((r) => r.kind === 'callout');
      const rn = after.lastRound?.round ?? 0; const newRound = rn !== (s.bubbleRound ?? 0); s.bubbleRound = rn;
      // Monarque in the final bouts: the Essence gnaws at his mind as his health falls, said through his bubble.
      let fade = null; const fl = s.cfg?.hud?.fading;
      if (fl) { const fo = after.players[1]; const ratio = fo ? fo.hp / Math.max(1, fo.maxHp ?? 100) : 1; s.fadeShown = s.fadeShown ?? new Set(); [0.7, 0.4, 0.2].forEach((th, k) => { if (ratio <= th && !s.fadeShown.has(k) && fl[k]) { s.fadeShown.add(k); fade = { mood: k === 2 ? 'fear' : 'angry', text: fl[k], who: 'gm', id: `fade-${k}-${Date.now()}` }; } }); }
      setStoryUi((u) => ({ mood: fade ? fade.mood : s.tracker.mood, bubble: fade ?? talk.at(-1) ?? (newRound ? null : u.bubble), callout: shout ?? null, used: [...new Set(used)] }));
      // The opponent fights the fight it is in: it tilts when you win rounds, presses when you bleed, and stops blundering when cornered.
      const me = after.players[0], foe = after.players[1], ai = aiRef.current;
      if (ai && me && foe) {
        ai.aggression = (s.cfg.aggression ?? 1.2) + 0.12 * Math.min(3, s.tracker.streak.me) + (me.hp <= 40 ? 0.2 : 0) + (foe.hp <= 30 ? 0.25 : 0) - (foe.hp - me.hp >= 40 ? 0.1 : 0);
        const tmp = s.cfg.foe.temperament; // temperament leans the whole table posture, on top of its power choices
        if (tmp === 'DEVOURER' && me.hp <= 50) ai.aggression += 0.15; else if (tmp === 'ANCIENT') ai.aggression -= 0.1; else if (tmp === 'SOVEREIGN' && foe.hp > me.hp) ai.aggression -= 0.05;
        s.mistakeNow = foe.hp <= 45 || me.hp <= 30 ? 0 : s.cfg.mistake;
      }
    } catch { /* decorative only */ }
    if (after.phase === 'MATCH_COMPLETE') {
      const humanId = after.players[0].id;
      if (after.winner === humanId && !s.rewarded) { s.rewarded = true; rewardStoryWin(s.cfg); }
      storyBridge.pending = { won: after.winner === humanId, rounds: after.roundNumber, hp: after.players[0].hp, foeHp: after.players[1].hp };
    }
  };

  // A purple orb travels from the old Curse holder's panel to the new one.
  const flyCurseOrb = (fromId, toId) => {
    window.setTimeout(() => {
      try {
        const a = document.querySelector(`[data-pid="${fromId}"]`)?.getBoundingClientRect(); const b = document.querySelector(`[data-pid="${toId}"]`)?.getBoundingClientRect();
        if (!a || !b || !persistentData.settings.animations) return;
        const orb = document.createElement('div'); orb.className = 'curse-orb'; document.body.appendChild(orb);
        const from = { x: a.left + a.width / 2 - 18, y: a.top + a.height / 2 - 18 }; const to = { x: b.left + b.width / 2 - 18, y: b.top + b.height / 2 - 18 };
        const anim = orb.animate([{ transform: `translate(${from.x}px,${from.y}px) scale(.4)`, opacity: 0 }, { opacity: 1, offset: .15 }, { transform: `translate(${(from.x + to.x) / 2}px,${Math.min(from.y, to.y) - 90}px) scale(1.3)`, offset: .55 }, { transform: `translate(${to.x}px,${to.y}px) scale(.6)`, opacity: .2 }], { duration: 1100, easing: 'ease-in-out' });
        anim.onfinish = () => orb.remove(); window.setTimeout(() => orb.remove(), 1500);
      } catch { /* decorative only */ }
    }, 500);
  };

  const resultOpen = useRef(false);
  const pumpSpotlight = () => {
    if (spotBusy.current || resultOpen.current) return; // Monarque / Omen banners wait until the round result has been read
    const item = spotQueue.current.shift();
    if (!item) return;
    spotBusy.current = true; setSpotlight(item);
    window.setTimeout(() => { setSpotlight(null); spotBusy.current = false; window.setTimeout(pumpSpotlight, 120); }, item.sacrifice ? 2800 : item.tone === 'gm' || item.tone === 'crazy' ? 2300 : 1800);
  };

  // Plays structured engine events through the presentation layer (log, spotlight, sound).
  const ingestEvents = (st, silent = false) => {
    const fresh = (st.eventLog ?? []).filter(e => e.seq > lastSeq.current);
    if (!fresh.length) return;
    lastSeq.current = fresh[fresh.length - 1].seq;
    const nameOf = (id) => st.players.find(p => p.id === id)?.name;
    const lines = [];
    for (const ev of fresh) {
      const d = describeEvent(ev, nameOf);
      if (d && ev.type !== 'ROUND_START' && ev.type !== 'SEAL_RELEASED') lines.push({ round: ev.round, text: L(d.text ? `${d.title} — ${d.text}` : d.title), facts: factsLine(d.facts) });
      if (silent) continue;
      for (const [key, ms, level] of soundsForEvent(ev)) window.setTimeout(() => gameSounds.cue(key, level ?? 0.8), ms);
      if (d && wantsSpotlight(ev)) spotQueue.current.push({ key: ev.seq, tone: eventTone(ev), kicker: L(d.kicker), title: L(d.title), text: L(d.text), facts: null, image: ev.card?.image ?? d.image, fx: ev.type === 'WILDCARD_USED' ? ev.effectId : ev.type === 'CHARGE' ? 'SACRIFICE' : null, sacrifice: d.sacrifice ?? null, playerId: ev.playerId });
      if (ev.type === 'CURSE_OUTCOME' && ev.outcome === 'TRANSFERRED') flyCurseOrb(ev.holderId, ev.newHolderId);
    }
    if (lines.length) setLogLines(prev => [...prev, ...lines].slice(-40));
    pumpSpotlight();
  };

  const presentRound = (st) => {
    const lr = st.lastRound;
    if (!lr?.placements?.length) return;
    const rows = lr.placements.map(x => ({
      playerId: x.playerId, place: x.place, card: x.card, isHuman: x.playerId === st.players[0].id,
      playerName: st.players.find(p => p.id === x.playerId)?.name ?? 'Vessel',
      hp: lr.deltas?.[x.playerId]?.hp ?? 0, ki: lr.deltas?.[x.playerId]?.ki ?? 0, coins: lr.deltas?.[x.playerId]?.coins ?? 0,
      note: x.card.isPass ? (x.card.charge ? L(`Sacrificed ${x.card.hpLoss} HP · gathered ${x.card.kiGain} Soul`) : 'No legal card') : (lr.banished?.includes(x.card.id) ? 'Banished' : '')
    }));
    const curse = st.lastCurseOutcome?.round === lr.round ? st.lastCurseOutcome : null;
    const footer = curse ? ({ DESTROYED: 'The Unraveling was broken.', TRANSFERRED: `The Unraveling passes to ${st.players.find(p => p.id === curse.newHolderId)?.name}.`, FAILED: 'The attempt failed — the Unraveling deepens.' })[curse.outcome] : '';
    const top = rows.find(r => r.place === 1);
    const me = rows.find(r => r.isHuman);
    gameSounds.seq([['reveal', 0, 0.9], ['clash', 520, 0.9]]);
    if (me?.place === 1) gameSounds.seq([['trickWin', 1050]]); else if (rows.length && me && me.place === rows.length) gameSounds.seq([['kiLoss', 1050, 0.6]]);
    if (me?.ki > 0) gameSounds.seq([['ki', 1500, 0.8]]); else if (me?.ki < 0) gameSounds.seq([['kiLoss', 1500, 0.7]]);
    if (me?.coins > 0) gameSounds.seq([['coins', 1900]]);
    if (lr.banished?.length) gameSounds.seq([['cooldown', 1300, 0.9]]);
    resultOpen.current = true;
    const why = top && !top.card.isPass ? `${top.playerName} wins: ${lr.call === 'TOTAL' ? 'best combined Power + Rank' : lr.inverted ? (lr.call === 'POWER' ? 'lowest Power' : 'highest Rank') : (lr.call === 'POWER' ? 'highest Power' : 'lowest Rank')} ${lr.call === 'TOTAL' ? '' : `(${lr.call === 'POWER' ? top.card.power : top.card.rank})`}. Better placement = more HP/Soul; worst placement loses HP.` : '';
    setRoundResult({ why, rows, call: lr.call, inverted: lr.inverted, arena: lr.arena, footer, winnerId: top?.playerId });
    window.clearTimeout(resultTimer.current);
    resultTimer.current = window.setTimeout(() => { resultOpen.current = false; setRoundResult(null); setVisibleTrick(null); window.setTimeout(pumpSpotlight, 250); }, 3600);
  };
  const skipRoundResult = () => { window.clearTimeout(resultTimer.current); resultOpen.current = false; setRoundResult(null); setVisibleTrick(null); window.setTimeout(pumpSpotlight, 250); };

  // Shared post-action bookkeeping for human and AI actions.
  const afterAction = (before) => {
    const after = engineRef.current.getView(engineRef.current.state.players[0].id);
    if (after.currentTrick?.plays?.length) setVisibleTrick(structuredClone(after.currentTrick));
    else if (after.lastRound?.round === before.roundNumber && after.roundNumber !== before.roundNumber || (after.phase === 'MATCH_COMPLETE' && after.lastRound?.round === before.roundNumber)) {
      if (after.lastRound?.placements?.length) {
        setVisibleTrick({ leaderId: before.currentTrick?.leaderId, call: after.lastRound.call, plays: after.lastRound.placements.map(({ playerId, card }) => ({ playerId, card })) });
        presentRound(after);
      } else setVisibleTrick(null);
    } else if (!after.currentTrick) setVisibleTrick(null);
    ingestEvents(after);
    const aliveBefore = (before.players ?? []).filter(p => p.hp > 0).length; const aliveAfter = after.players.filter(p => p.hp > 0).length;
    const downed = after.players.filter(p => p.hp <= 0 && (before.players ?? []).find(b => b.id === p.id)?.hp > 0);
    if (downed.length) { setKoIds(ids => [...ids, ...downed.map(p => p.id)]); gameSounds.seq([['ko', 900]]); if (aliveAfter === 2 && aliveBefore > 2) { gameSounds.seq([['lastTwo', 2300]]); window.setTimeout(() => { if (engineRef.current && engineRef.current.state.phase !== 'MATCH_COMPLETE') gameSounds.startMusic('duel'); }, 2800); } }
    setState(after);
    if (storyRef.current) afterStory(before, after);
    else if (chatRef.current) { try { const rn = after.lastRound?.round ?? 0; if (rn !== lastSpeechRound.current) { lastSpeechRound.current = rn; setSpeech({}); } say(chatRef.current.observe(before, after)); } catch { /* table talk is decorative */ } }
    if (after.phase === 'MATCH_COMPLETE') {
      gameSounds.stopAmbience(); gameSounds.stopMusic();
      const humanWon = after.winner === after.players[0]?.id;
      humanWon ? gameSounds.matchWin() : gameSounds.matchLose();
      if (humanWon && !storyRef.current) window.setTimeout(() => gameSounds.cue('reward', 0.7), 2600);
      if (storyRef.current) { window.setTimeout(() => { storyRef.current = null; engineRef.current = null; setScreen(SCREENS.STORY); }, 4200); } else {
      recordCompletedMatch(after);
      window.setTimeout(() => { setScreen(SCREENS.RESULT); gameSounds.cue('gameOver', 0.7); }, 3600); }
    }
    return after;
  };

  const humanAct = (fn) => {
    try {
      const engine = engineRef.current; const before = engine.getState();
      if (before.currentPlayer !== before.players[0].id) return false;
      fn(engine, before); setError(''); afterAction(before); return true;
    } catch (err) { setError(L(err.message)); gameSounds.cue(/Ki|coin/i.test(err.message) ? 'warn' : 'invalid'); return false; }
  };

  const drawCard = () => humanAct((engine, live) => { engine.drawCard(live.currentPlayer); gameSounds.draw(); gameSounds.seq([['coinsSpent', 450, 0.8]]); setSelectedCard(null); });
  const callStat = (call) => humanAct((engine, live) => {
    if (live.phase !== 'CALLING_STAT' || !selectedCard) throw new Error('Select a card first.');
    engine.callStat(live.currentPlayer, call); call === 'POWER' ? gameSounds.callPower() : gameSounds.callRank();
  });
  const chargeTurn = () => humanAct((engine, live) => { engine.chargeTurn(live.currentPlayer); setSelectedCard(null); });
  const passTurn = () => humanAct((engine, live) => { engine.passTurn(live.currentPlayer); setSelectedCard(null); });
  const answerDecree = (choice) => humanAct((engine, live) => { engine.decreeAct(live.currentPlayer, choice); setSelectedCard(null); });
  const useWildcard = (cardId, options = {}) => humanAct((engine, live) => { engine.useWildcard(live.currentPlayer, cardId, options); setSelectedCard(null); });
  const playCard = (boost = {}) => {
    if (!selectedCard) return;
    humanAct((engine, before) => { engine.playCard(before.currentPlayer, selectedCard, boost); gameSounds.cardPlay(); if ((boost?.power ?? 0) + (boost?.rank ?? 0) > 0) gameSounds.seq([['kiSpent', 250, 0.8]]); setSelectedCard(null); });
  };

  const recordCompletedMatch = (finalState) => {
    if (!finalState?.winner || !finalState.matchId || recordedMatchId.current === finalState.matchId) return;
    const human = finalState.players[0];
    const winner = finalState.players.find((player) => player.id === finalState.winner);
    const won = finalState.winner === human?.id;
    const diff = battleDiffRef.current; const coinMul = difficultyOf(diff).coinMul; const cb = clutchBonus(finalState);
    const earnedCoins = Math.round(((human?.roundsWon ?? 0) * GAME_CONFIG.coins.roundWinReward + (won ? GAME_CONFIG.coins.matchWinReward : 0) + cb.coins) * coinMul);
    let settled = null;
    const spentCoins = (human?.drawsUsed ?? 0) * GAME_CONFIG.draw.cost;
    const historyEntry = {
      id: finalState.matchId,
      date: new Date().toISOString(),
      mode: finalState.mode,
      result: won ? 'WIN' : 'LOSS',
      winner: winner?.name ?? 'Unknown',
      direction: finalState.direction,
      roundsWon: human?.roundsWon ?? 0,
      cardsBanished: finalState.banishedCards?.filter(card => card.ownerId === human?.id).length ?? 0,
      drawsUsed: human?.drawsUsed ?? 0,
      coinsEarned: earnedCoins,
      coinsSpent: spentCoins,
      durationSeconds: Math.max(0, Math.round((Date.now() - (matchStartedAt.current ?? Date.now())) / 1000))
    };

    const next = updateGameData((data) => { settled = applyMatch(data.progress, { won, mode: finalState.mode, difficulty: diff, twist: finalState.twist, clutch: cb.clutch, comeback: cb.comeback }); const gained = earnedCoins + settled.coins; return ({
      ...data,
      progress: settled.progress,
      profile: {
        ...data.profile,
        walletCoins: data.profile.walletCoins + gained
      },
      stats: {
        ...data.stats,
        matchesPlayed: data.stats.matchesPlayed + 1,
        matchesWon: data.stats.matchesWon + (won ? 1 : 0),
        matchesLost: data.stats.matchesLost + (won ? 0 : 1),
        twoPlayerMatches: data.stats.twoPlayerMatches + (finalState.mode === 2 ? 1 : 0),
        fourPlayerMatches: data.stats.fourPlayerMatches + (finalState.mode === 4 ? 1 : 0),
        roundsWon: data.stats.roundsWon + (human?.roundsWon ?? 0),
        cardsBanished: data.stats.cardsBanished + (finalState.banishedCards?.filter(card => card.ownerId === human?.id).length ?? 0),
        drawsUsed: data.stats.drawsUsed + (human?.drawsUsed ?? 0),
        coinsEarned: data.stats.coinsEarned + gained,
        coinsSpent: data.stats.coinsSpent + spentCoins
      },
      matchHistory: [historyEntry, ...data.matchHistory].slice(0, 20)
    }); });
    setPersistentData(next);
    setLastReward({ coins: earnedCoins, mul: coinMul, reasons: cb.reasons, feats: (settled?.earned ?? []).map((f) => ({ id: f.id, name: f.name, reward: f.reward })) });
    if (settled?.earned.length) showRewardToast(settled.earned.map((f, i) => (i === 0 ? `Feat earned: ${f.name} (+${f.reward} coins)` : `${f.name} (+${f.reward} coins)`)));
    recordedMatchId.current = finalState.matchId;
  };

  const saveProfile = (name) => {
    const safeName = name.trim().slice(0, 24) || 'Vessel';
    const next = updateGameData((data) => ({ ...data, profile: { ...data.profile, name: safeName } }));
    setPersistentData(next);
  };

  const toggleAnimations = () => {
    const next = updateGameData((data) => ({ ...data, settings: { ...data.settings, animations: !data.settings.animations } }));
    setPersistentData(next);
  };

  const buyCard = (card) => {
    const price = { COMMON: 5, RARE: 10, EPIC: 20, LEGENDARY: 40 }[card.rarity] ?? 5;
    let purchased = false;
    const next = updateGameData((data) => {
      if (data.profile.ownedCardIds.includes(card.id) || data.profile.walletCoins < price) return data;
      purchased = true;
      return {
        ...data,
        profile: { ...data.profile, walletCoins: data.profile.walletCoins - price, ownedCardIds: [...data.profile.ownedCardIds, card.id] },
        stats: { ...data.stats, coinsSpent: data.stats.coinsSpent + price }
      };
    });
    if (!purchased) {
      gameSounds.cue('purchaseFail');
      setError(next.profile.ownedCardIds.includes(card.id)
        ? `${card.character} is already in your collection.`
        : `You need ${price} coins to take ${card.character}.`);
      return;
    }
    setPersistentData(next); gameSounds.cue('purchase'); gameSounds.seq([['coinsSpent', 160, 0.7]]);
    setError('');
  };

  const resetPersistentData = () => {
    const next = resetGameData();
    setPersistentData(next);
  };

  const goHome = () => {
    if (storyRef.current) { storyRef.current = null; if (aiTimer.current) clearTimeout(aiTimer.current); gameSounds.stopAmbience(); gameSounds.stopMusic(); window.clearTimeout(resultTimer.current); resultOpen.current = false; spotQueue.current = []; spotBusy.current = false; setSpotlight(null); engineRef.current = null; setState(null); setSelectedCard(null); setVisibleTrick(null); setRoundResult(null); setError(''); setScreen(SCREENS.STORY); return; }
    if (aiTimer.current) clearTimeout(aiTimer.current);
    gameSounds.stopAmbience(); window.clearTimeout(resultTimer.current); resultOpen.current = false; spotQueue.current = []; spotBusy.current = false; setSpotlight(null);
    engineRef.current = null;
    setState(null); setSelectedCard(null); setVisibleTrick(null); setRoundResult(null); setShopOpen(false); setInfoOpen(false); setError(''); setScreen(SCREENS.HOME);
  };

  useEffect(() => { gameSounds.duck(Boolean(spotlight || roundResult)); }, [spotlight, roundResult]);
  useEffect(() => { if (!error) return undefined; const t = window.setTimeout(() => setError(''), 3500); return () => window.clearTimeout(t); }, [error]);

  useEffect(() => {
    if (screen !== SCREENS.GAME || shopOpen || !state || !engineRef.current || state.phase === 'MATCH_COMPLETE') return undefined;
    if (dealing) return undefined;
    if (spotlight || roundResult) return undefined; // let the player read the special card / round result first
    if (tutorialOpen) return undefined;
    const current = state.players.find(p => p.id === state.currentPlayer);
    if (!current || current.type !== 'AI') return undefined;

    aiTimer.current = window.setTimeout(() => {
      try {
        const engine = engineRef.current;
        const before = engine.getState();
        const player = before.players.find(p => p.id === before.currentPlayer);
        if (!player || player.type !== 'AI') return;
        const tac = tacticsRef.current?.update(before, player.id, aiRef.current, { intensity: tacticsK.current });
        if (tac?.line) { if (storyRef.current) setStoryUi((u) => ({ ...u, mood: tac.line.mood, bubble: tac.line })); else say([tac.line]); }
        takeAiTurn(engine, aiRef.current, player.id, { pickWildcard: storyRef.current?.picker, mistake: storyRef.current?.mistakeNow ?? storyRef.current?.cfg.mistake, onAction: (type) => { if (type === 'DRAW') gameSounds.draw(); if (type === 'CALL') gameSounds.callPower(); } });
        gameSounds.cardPlay();
        afterAction(before);
      } catch (err) {
        setError(L(err.message));
        window.setTimeout(() => setRetryTick(n => n + 1), 1500); // never freeze: retry the AI step
      }
    }, getRandomAIDelay());

    return () => clearTimeout(aiTimer.current);
  }, [screen, shopOpen, dealing, state?.currentPlayer, state?.phase, state?.roundNumber, state?.decree?.idx, spotlight, roundResult, tutorialOpen, retryTick]);

  // Music on the menu screens, ambience in the match; first gesture unlocks the audio context; every button gets a tap.
  useEffect(() => {
    // Story Mode has its own dark soundscape; the story screens choose their own music per scene.
    gameSounds.setTheme(screen === SCREENS.STORY || (screen === SCREENS.GAME && storyRef.current) ? 'dark' : 'default');
    if (screen === SCREENS.STORY) return; if (screen === SCREENS.GAME) gameSounds.startMusic('battle'); else if (screen !== SCREENS.RESULT) { if (musicHold.current) return; gameSounds.startMusic('menu'); } else gameSounds.stopMusic();
  }, [screen]);
  // In-match music follows the drama: Monarque Whim theme, intense theme during Omens / when someone is nearly out, duel theme for the last two.
  useEffect(() => {
    if (screen !== SCREENS.GAME || !state || state.phase === 'MATCH_COMPLETE' || dealing) return;
    const alive = state.players.filter(p => !p.eliminated && p.hp > 0);
    let track = 'battle';
    if (storyRef.current) {
      const boss = storyRef.current.cfg?.foe?.gmBout != null; const low = alive.some(p => p.hp <= 25);
      track = state.phase === 'GM_DECREE' ? 'gm' : low ? 'intense' : boss ? 'duel' : 'battle';
    } else if (alive.length <= 2 && state.players.length > 2) track = 'duel';
    else if (state.phase === 'GM_DECREE') track = 'gm';
    else if (Object.values(state.activeEffects ?? {}).some(Boolean) || alive.some(p => p.hp <= 25)) track = 'intense';
    if (gameSounds.musicTrack() !== track) gameSounds.startMusic(track);
  }, [screen, dealing, state?.phase, state?.roundNumber, state?.players]);
  useEffect(() => {
    const onDown = (e) => {
      gameSounds.unlock();
      const b = e.target.closest?.('button, [role="button"], a');
      if (!b || b.disabled || b.closest('.card, .blind-card-slot, [data-sfx="none"], .wildcard-action')) return;
      gameSounds.cue(b.classList.contains('text-button') || b.getAttribute('aria-label')?.match(/close|back/i) ? 'modalClose' : 'ui', 0.9);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);
  useEffect(() => { if (infoOpen) gameSounds.cue('modalOpen', 0.7); else if (gameSounds._infoWas) gameSounds.cue('modalClose', 0.7); gameSounds._infoWas = infoOpen; }, [infoOpen]);
  useEffect(() => { if (screen === SCREENS.SHOP) gameSounds.cue('shopToggle'); else if (screen === SCREENS.HOME && gameSounds._lastScreen === SCREENS.SHOP) gameSounds.cue('shopToggle'); else if (screen === SCREENS.MODE) gameSounds.cue('tab', 0.8); gameSounds._lastScreen = screen; }, [screen]);

  // Test hook (dev server only, and only with ?debug in the URL): lets automated UI tests stage an engine state and run the normal after-action pipeline.
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined' || !/[?&]debug\b/.test(window.location.search)) return; // dev server only: never exposes the engine in a production build
    window.__kc = { get engine() { return engineRef.current; }, act(fn) { const before = engineRef.current.getState(); fn(engineRef.current); return afterAction(before); }, view: () => engineRef.current?.getView(engineRef.current.state.players[0].id), autoStep() { const e = engineRef.current; const before = e.getState(); takeAiTurn(e, aiRef.current, before.currentPlayer, {}); return afterAction(before).phase; } };
  });
  const wildcardStatus = (screen === SCREENS.GAME && engineRef.current && state && state.phase !== 'MATCH_COMPLETE')
    ? Object.fromEntries(engineRef.current.getWildcardCards(state.players[0].id).map(c => [c.id, { usable: c.usable, reason: c.reason }])) : {};

  const chip = <AudioChip floating />;
  if (screen === SCREENS.STORY) return <Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: '#080b0c' }} />}><StoryApp onExit={() => { storyRef.current = null; gameSounds.fadeOutMusic(1.8); window.clearTimeout(musicHold.current); musicHold.current = window.setTimeout(() => { musicHold.current = null; gameSounds.startMusic('menu'); }, 2000); setScreen(SCREENS.HOME); }} onStartDuel={startStoryDuel} /></Suspense>;
  if (screen === SCREENS.HOME) return <>
    <Home progress={persistentData.progress} onStory={() => setScreen(SCREENS.STORY)} onStart={() => setScreen(SCREENS.MODE)} onOpenShop={() => setScreen(SCREENS.SHOP)} onOpenInfo={() => setInfoOpen(true)} profile={persistentData.profile} stats={persistentData.stats} settings={persistentData.settings} history={persistentData.matchHistory} onSaveProfile={saveProfile} onToggleAnimations={toggleAnimations} onReset={resetPersistentData} />
    {infoOpen && <GameInfo onClose={() => setInfoOpen(false)} />}
    {error && <div className="error-toast">{error}</div>}
  </>;
  if (screen === SCREENS.MODE) return <>{chip}<ModeSelect progress={persistentData.progress} stats={persistentData.stats} onSelect={startMatch} onBack={() => setScreen(SCREENS.HOME)} /></>;
  if (screen === SCREENS.RESULT) return <>{chip}<Result reward={lastReward} state={state} onRestart={() => startMatch(state.mode)} onHome={goHome} /></>;
  if (screen === SCREENS.SHOP) return <>{chip}<CardShop cards={cards.filter(card => card.type === 'CHARACTER')} walletCoins={persistentData.profile.walletCoins} ownedCardIds={persistentData.profile.ownedCardIds} onBuy={buyCard} onClose={() => setScreen(SCREENS.HOME)} /></>;

  return (
    <>
      <Game
        dealing={dealing}
        onTutorialChange={setTutorialOpen}
        onDealDone={() => { setDealing(false); gameSounds.cue('countdown', 0.5); }}
        decreeOptions={state.phase === 'GM_DECREE' && state.currentPlayer === state.players[0].id && engineRef.current ? engineRef.current.decreeOptions(state.players[0].id) : null}
        onDecree={answerDecree}
        arena={selectedArena}
        state={state}
        walletCoins={persistentData.profile.walletCoins}
        visibleTrick={visibleTrick}
        roundResult={roundResult}
        onSkipResult={skipRoundResult}
        spotlight={spotlight}
        logLines={logLines}
        animations={persistentData.settings.animations}
        wildcardStatus={wildcardStatus}
        ownedCardIds={persistentData.profile.ownedCardIds}
        koIds={koIds}
        speech={speech}
        onReact={reactToSeat}
        selectedCard={selectedCard}
        onSelectCard={(cardId) => { setSelectedCard(cardId); gameSounds.cardSelect(); }}
        onCall={callStat}
        onPlay={playCard}
        onDraw={drawCard}
        onPass={passTurn}
        onCharge={chargeTurn}
        onUseWildcard={useWildcard}
        onClear={() => { setSelectedCard(null); gameSounds.cue('cardDeselect', 0.8); }}
        onHome={goHome}
        onOpenInfo={() => setInfoOpen(true)}
        onOpenShop={() => setShopOpen(true)}
      />
      {storyRef.current && <div className="sm-duel-mute" aria-hidden="true" />}
      {storyRef.current && <div className={`sm-duel-grade ${state.players.some((p) => p.hp > 0 && p.hp <= 25) ? 'low' : ''}`} aria-hidden="true" />}
      {storyRef.current && <StoryHud hud={storyRef.current.cfg.hud} mood={storyUi.mood} bubble={storyUi.bubble} onReact={reactToFoe} callout={storyUi.callout} usedPowers={storyUi.used} hp={Math.round(((state.players[1]?.hp ?? 100) / (state.players[1]?.maxHp ?? 100)) * 100)} soul={state.players[0]?.ki ?? null} />}
      {infoOpen && <GameInfo onClose={() => setInfoOpen(false)} />}
      {shopOpen && <CardShop cards={cards.filter(card => card.type === 'CHARACTER')} walletCoins={persistentData.profile.walletCoins} ownedCardIds={persistentData.profile.ownedCardIds} onBuy={buyCard} onClose={() => setShopOpen(false)} embedded />}
      {error && <div className="error-toast">{error}</div>}
    </>
  );
}
