// Audio engine (Web Audio): preloaded + decoded buffers, loudness-normalised per file (audioGain.json, measured offline),
// separate SFX / music / ambience buses into one soft limiter, voice limiting, and a play log for verification (window.__kcAudio).
// Missing files or a missing AudioContext are tolerated: everything degrades to silence, never to an exception.
import GAIN from './audioGain.json';
const CUES = {
  cardSelect: 'cards/card-hover-energy-tick.mp3', cardDeselect: 'cards/card-deselected-release.mp3',
  callPower: 'combat/power-rank-call-charge.mp3', callRank: 'combat/power-rank-call-charge.mp3',
  cardPlay: 'cards/card-committed-energy-lock.mp3', reveal: 'cards/card-reveal-energy-burst.mp3', deal: 'cards/initial-hand-deal-staggered.mp3',
  draw: 'cards/random-card-draw-suspense-reveal.mp3', clash: 'combat/power-comparison-energy-clash.mp3',
  trickWin: 'combat/winner-reveal-triumphant-sting.mp3', matchWin: 'match/victory-triumphant-energy-fanfare.mp3', matchLose: 'match/defeat-descending-energy-fade.mp3',
  damage: 'combat/hp-damage-impact.mp3', heal: 'combat/hp-healing-restorative-pulse.mp3', ki: 'combat/ki-gain-energy-pickup.mp3', kiLoss: 'combat/ki-loss-descending-drain.mp3',
  coins: 'combat/coins-earned-reward-chime.mp3', cooldown: 'combat/cooldown-unavailable-pulse.mp3', warn: 'combat/insufficient-ki-coins-warning.mp3',
  round: 'match/round-start-combat-ready.mp3', matchStart: 'match/match-start-arena-energy.mp3', ko: 'match/player-elimination-defeat-impact.mp3', lastTwo: 'match/last-two-players-endgame-tension.mp3',
  ui: 'ui/button-click-confirmation-tap.mp3', invalid: 'ui/invalid-action-rejection-pulse.mp3', modalOpen: 'ui/modal-open-interface-transition.mp3', modalClose: 'ui/modal-close-energy-release.mp3',
  gmWarn: 'events/game-master-intervention-warning-surge.mp3', gmStir: 'events/game-master-intervention-warning-surge.mp3', crazy: 'events/crazy-round-start-chaotic-burst.mp3',
  PUBLIC_FORECAST: 'events/public-forecast-scan-reveal.mp3', NO_APEX: 'events/no-apex-power-suppression-seal.mp3', WILDCARD_LOCKOUT: 'events/wildcard-lockout-energy-seal.mp3', KI_SURGE: 'events/ki-surge-charge-release.mp3', HIGH_STAKES: 'events/high-stakes-tension-confirmation.mp3',
  DIVINE_CHALLENGE: 'events/divine-challenge-signal.mp3', FORCED_SACRIFICE: 'events/forced-sacrifice-decisive-impact.mp3',
  wildcard: 'wildcards/wildcard-activation-mystic-surge.mp3', SENZU: 'wildcards/senzu-healing-restoration-burst.mp3', FINAL_ATONEMENT: 'wildcards/final-atonement-sacrifice-explosion.mp3',
  MAFUBA: 'wildcards/mafuba-capture-sealing-vortex.mp3', SCOUTER: 'wildcards/scouter-lock-on-scan-beep.mp3', SOLAR_FLARE: 'wildcards/solar-flare-blinding-burst.mp3',
  OTHER_WORLD: 'wildcards/domain-inversion-other-world-shift.mp3', CURSE: 'wildcards/curse-reveal-destruction-transfer.mp3', SHENRON_WISH: 'wildcards/shenron-interaction-summoning-cue.mp3',
  wishGranted: 'wildcards/shenrons-wish-granted-chime.mp3', immortal: 'wildcards/immortality-shield-blocked-damage.mp3'
};
Object.assign(CUES, {
  charge: 'combat/ki-gain-energy-pickup.mp3', ZENKAI: 'events/ki-surge-charge-release.mp3', KI_SEAL: 'events/wildcard-lockout-energy-seal.mp3',
  DIVINE_FAVOR: 'combat/ki-gain-energy-pickup.mp3', KI_RAIN: 'events/ki-surge-charge-release.mp3', COOLDOWN_FLUSH: 'combat/cooldown-unavailable-pulse.mp3', WORLD_OF_VOID: 'events/wildcard-lockout-energy-seal.mp3',
  DIVINE_SWAP: 'events/game-master-intervention-warning-surge.mp3', CURSE_INJECTION: 'wildcards/curse-reveal-destruction-transfer.mp3',
  cardHover: 'cards/card-hover-energy-tick.mp3', shuffle: 'cards/card-shuffle-energy-flicks.mp3',
  coinsSpent: 'combat/coins-spent-confirmation.mp3', kiSpent: 'combat/ki-spent-boosted-drain.mp3', gameOver: 'match/game-over-final-results-transition.mp3', countdown: 'match/countdown-match-ready-three-beats.mp3', tab: 'ui/tab-menu-navigation-transition.mp3', toggle: 'ui/settings-toggle-clean-click.mp3', arenaConfirm: 'ui/arena-select-confirm-energy-lock.mp3',
  purchase: 'rewards/purchase-confirmed-coin-energy-chime.mp3', purchaseFail: 'rewards/shop-purchase-failed-rejection.mp3', shopToggle: 'rewards/shop-open-close-interface-flourish.mp3', reward: 'rewards/reward-claim-celebration.mp3',
});
Object.assign(CUES, {
  dealFlick: 'cards/deal-card-flick.mp3', cardFlip: 'cards/card-flip-reveal.mp3', cardSlam: 'cards/card-slam-table.mp3',
  gmRumble: 'events/gm-telegraph-rumble.mp3', gmDecree: 'events/gm-decree-gong.mp3', crazySiren: 'events/crazy-round-siren.mp3',
  draftPick: 'events/draft-pick-chime.mp3', auctionTick: 'events/auction-bid-tick.mp3', auctionHit: 'events/auction-reveal-hit.mp3',
  training: 'events/training-powerup.mp3', bounty: 'events/bounty-mark-sting.mp3', timeChamber: 'events/time-chamber-warp.mp3',
  wishGlow: 'events/wish-round-glow.mp3', sideQuest: 'events/side-quest-fanfare.mp3', lastStand: 'match/last-stand-heartbeat.mp3', shield: 'combat/shield-guard-pulse.mp3',
  TOTAL_MIGHT: 'events/total-might-balance-chime.mp3', BACKWARDS: 'events/backwards-rewind.mp3', WISH_ROUND: 'events/wish-round-glow.mp3',
});
// Story Mode's dark battle soundscape (rendered by scripts/make-dark-audio.py). When the theme is 'dark', these replace the
// matching cue / music track; anything not listed keeps its normal sound. New story-only cues exist in both themes.
const DARK = {
  ui: 'dark/ui-tap.mp3', tab: 'dark/ui-tap.mp3', modalOpen: 'dark/ui-open.mp3', modalClose: 'dark/ui-close.mp3', cardDeselect: 'dark/ui-close.mp3', invalid: 'dark/invalid.mp3', warn: 'dark/invalid.mp3', cooldown: 'dark/invalid.mp3',
  cardSelect: 'dark/card-select.mp3', cardHover: 'dark/card-select.mp3', cardPlay: 'dark/card-commit.mp3', callPower: 'dark/call.mp3', callRank: 'dark/call.mp3',
  cardFlip: 'dark/card-flip.mp3', reveal: 'dark/reveal.mp3', deal: 'dark/deal.mp3', dealFlick: 'dark/deal.mp3', draw: 'dark/deal.mp3', shuffle: 'dark/shuffle.mp3', cardSlam: 'dark/slam.mp3',
  clash: 'dark/clash.mp3', trickWin: 'dark/win-trick.mp3', damage: 'dark/damage.mp3', heal: 'dark/heal.mp3', ki: 'dark/ki.mp3', charge: 'dark/ki.mp3', kiLoss: 'dark/ki-loss.mp3', kiSpent: 'dark/ki-loss.mp3',
  round: 'dark/round.mp3', matchStart: 'dark/match-start.mp3', countdown: 'dark/match-start.mp3', ko: 'dark/ko.mp3', lastTwo: 'dark/last-two.mp3', lastStand: 'dark/heartbeat.mp3', shield: 'dark/shield.mp3', immortal: 'dark/shield.mp3',
  matchWin: 'dark/story-victory.mp3', matchLose: 'dark/story-defeat.mp3', gameOver: 'dark/story-defeat.mp3',
  gmWarn: 'dark/gm-growl.mp3', gmStir: 'dark/gm-growl.mp3', gmRumble: 'dark/gm-growl.mp3', DIVINE_SWAP: 'dark/gm-growl.mp3', DIVINE_CHALLENGE: 'dark/gm-growl.mp3', gmDecree: 'dark/gong.mp3',
  crazy: 'dark/alarm.mp3', crazySiren: 'dark/alarm.mp3', FORCED_SACRIFICE: 'dark/slam.mp3', CURSE_INJECTION: 'dark/wild-curse.mp3',
  coins: 'dark/card-select.mp3', coinsSpent: 'dark/card-select.mp3', reward: 'dark/win-trick.mp3', purchase: 'dark/card-commit.mp3', purchaseFail: 'dark/invalid.mp3', shopToggle: 'dark/ui-open.mp3',
  arenaConfirm: 'dark/round.mp3', training: 'dark/ki.mp3', timeChamber: 'dark/wild-invert.mp3', TOTAL_MIGHT: 'dark/shield.mp3', HIGH_STAKES: 'dark/gm-growl.mp3', bounty: 'dark/gm-growl.mp3',
  PUBLIC_FORECAST: 'dark/wild-scan.mp3', NO_APEX: 'dark/wild-seal.mp3', WILDCARD_LOCKOUT: 'dark/wild-seal.mp3', KI_SEAL: 'dark/wild-seal.mp3', WORLD_OF_VOID: 'dark/wild-invert.mp3', BACKWARDS: 'dark/wild-invert.mp3',
  KI_SURGE: 'dark/wild-surge.mp3', ZENKAI: 'dark/wild-surge.mp3', DIVINE_FAVOR: 'dark/ki.mp3', KI_RAIN: 'dark/ki.mp3', COOLDOWN_FLUSH: 'dark/heal.mp3', WISH_ROUND: 'dark/wish-granted.mp3', wishGlow: 'dark/wish-granted.mp3',
  sideQuest: 'dark/win-trick.mp3', draftPick: 'dark/card-select.mp3', auctionTick: 'dark/card-select.mp3', auctionHit: 'dark/slam.mp3',
  wildcard: 'dark/wild-surge.mp3', SENZU: 'dark/wild-heal.mp3', FINAL_ATONEMENT: 'dark/wild-blast.mp3', MAFUBA: 'dark/wild-seal.mp3', SCOUTER: 'dark/wild-scan.mp3', SOLAR_FLARE: 'dark/wild-flare.mp3',
  OTHER_WORLD: 'dark/wild-invert.mp3', CURSE: 'dark/wild-curse.mp3', SHENRON_WISH: 'dark/wild-wish.mp3', wishGranted: 'dark/wish-granted.mp3',
};
Object.assign(CUES, {
  sVictory: 'dark/story-victory.mp3', sDefeat: 'dark/story-defeat.mp3', sClaim: 'dark/story-claim.mp3', sLevel: 'dark/story-level.mp3',
  sacrifice: 'dark/sacrifice.mp3', sVs: 'dark/story-vs.mp3', sBoom: 'dark/story-boom.mp3', sBell: 'dark/story-bell.mp3', sType: 'dark/story-type.mp3',
});
let theme = 'default';
const fileOf = (key) => (theme === 'dark' && DARK[key]) || CUES[key];
const ESSENTIAL = ['cardSelect', 'cardDeselect', 'callPower', 'callRank', 'cardPlay', 'reveal', 'clash', 'trickWin', 'damage', 'ki', 'round', 'ui', 'invalid', 'dealFlick', 'cardFlip', 'matchStart', 'shuffle', 'warn'];
const AMBIENCE = { tournament: 'arenas/tournament-arena-rocky-wind-ambience.wav', ruined: 'arenas/ruined-city-wind-and-embers.wav', cosmic: 'arenas/cosmic-other-world-celestial-drone.wav', shattered: 'arenas/alien-arena-ethereal-wind-hum.wav' };
// Themes: menu, in-match battle theme, and the tense final-duel theme (last two fighters).
const MUSIC = { menu: 'menu-cinematic-ambient.wav', battle: 'music/battle-theme.wav', intense: 'music/battle-theme-intense.wav', duel: 'music/final-duel-theme.wav', gm: 'music/gm-decree-theme.wav' };
const MUSIC_DARK = { menu: 'dark/theme-menu.ogg', battle: 'dark/theme-battle.ogg', intense: 'dark/theme-intense.ogg', duel: 'dark/theme-duel.ogg', gm: 'dark/theme-gm.ogg' };
// One track for the whole game (a seamless 40 s loop of 'Unsolved Investigation' by isaiah658, see docs/CREDITS.md).
const MAIN_TRACK = 'music/unsolved-investigation.ogg';
const musicFile = () => MAIN_TRACK;
void MUSIC; void MUSIC_DARK;
const MUSIC_LEVEL = { menu: 0.5, battle: 0.42, intense: 0.44, duel: 0.46, gm: 0.5 };
// Per-category mix level on top of the normalised file (1 = reference loudness of about -20 dBFS RMS).
const LEVEL = (file) => file.startsWith('ui/') ? 0.55 : file.startsWith('cards/') ? 0.75 : file.startsWith('match/victory') || file.startsWith('match/defeat') || file.startsWith('match/game-over') ? 1.0 : file.startsWith('events/') || file.startsWith('wildcards/') ? 0.95 : 0.85;
const B = '/audio/';
const KEY = 'kc-audio';
let prefs = { muted: false, volume: 0.7, sfx: 1, music: 0.6 };
try { const saved = JSON.parse(window.localStorage.getItem(KEY) || 'null'); if (saved && typeof saved === 'object') prefs = { ...prefs, ...saved }; } catch { /* storage unavailable */ }
const save = () => { try { window.localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ } };
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

const log = (typeof window !== 'undefined') ? (window.__kcAudio = { plays: [], failed: [], loops: [], contextState: 'none' }) : { plays: [], failed: [], loops: [] };
let ctx = null; let master = null; let sfxBus = null; let musicBus = null; let ambBus = null;
const buffers = new Map(); const loading = new Map(); const lastPlay = new Map();
let voices = 0; let musicNode = null; let ambNode = null; let wantMusic = null; let wantAmbience = null; let ducked = false;
const listeners = new Set(); const notify = () => listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });

function ensureContext() {
  if (ctx || typeof window === 'undefined') return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain(); sfxBus = ctx.createGain(); musicBus = ctx.createGain(); ambBus = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.12;
    sfxBus.connect(master); musicBus.connect(master); ambBus.connect(master); master.connect(limiter); limiter.connect(ctx.destination);
    applyLevels(true);
    log.contextState = ctx.state; ctx.onstatechange = () => { log.contextState = ctx.state; };
  } catch { ctx = null; }
  return ctx;
}
function applyLevels(immediate) {
  if (!ctx) return;
  const t = ctx.currentTime; const ramp = immediate ? 0 : 0.08;
  const set = (g, v) => { try { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(v, t, ramp || 0.001); } catch { g.gain.value = v; } };
  set(master, prefs.muted ? 0 : prefs.volume); set(sfxBus, prefs.sfx); set(musicBus, prefs.music * (ducked ? 0.45 : 1)); set(ambBus, ducked ? 0.5 : 1);
}
function load(file) {
  if (buffers.has(file)) return Promise.resolve(buffers.get(file));
  if (loading.has(file)) return loading.get(file);
  const c = ensureContext(); if (!c) return Promise.resolve(null);
  const p = fetch(B + file).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
    .then((ab) => new Promise((res, rej) => c.decodeAudioData(ab, res, rej)))
    .then((buf) => { buffers.set(file, buf); loading.delete(file); return buf; })
    .catch((err) => {
      loading.delete(file);
      if (file.endsWith('.ogg')) return load(file.replace(/\.ogg$/, '.mp3')).then((b) => { if (b) buffers.set(file, b); return b; });
      log.failed.push({ file, error: String(err?.message ?? err) }); return null;
    });
  loading.set(file, p); return p;
}
// Only the small, frequently used cues are fetched up front; everything else is fetched (and cached) the first time it plays.
const preloadAll = () => { const c = ensureContext(); if (!c) return; ESSENTIAL.forEach((k) => { const f = fileOf(k); if (f) load(f); }); };

function play(key, level = 1, opts = {}) {
  const file = fileOf(key); if (!file || typeof window === 'undefined') return;
  const now = performance.now(); const gap = opts.minGap ?? 70;
  if (now - (lastPlay.get(key) ?? -1e9) < gap) return; lastPlay.set(key, now);
  log.plays.push({ key, file, t: Math.round(now), muted: prefs.muted }); if (log.plays.length > 400) log.plays.shift();
  if (prefs.muted) return;
  const c = ensureContext(); if (!c) return;
  const start = (buf) => {
    if (!buf || voices >= 12) return;
    try {
      if (c.state === 'suspended') c.resume().catch(() => {});
      const src = c.createBufferSource(); src.buffer = buf; if (opts.rate) src.playbackRate.value = opts.rate;
      const g = c.createGain(); g.gain.value = (GAIN[file] ?? 1) * LEVEL(file) * level * (opts.gain ?? 1);
      src.connect(g); g.connect(sfxBus); voices += 1; src.onended = () => { voices -= 1; try { g.disconnect(); } catch { /* ignore */ } };
      src.start(c.currentTime + (opts.delay ?? 0));
    } catch { /* silent */ }
  };
  const have = buffers.get(file); if (have) start(have); else load(file).then(start);
}
const seq = (steps) => steps.forEach(([key, ms, level]) => { if (ms) window.setTimeout(() => play(key, level ?? 1), ms); else play(key, level ?? 1); });

function startLoop(kind, file, _bus, level, fade = 1.2) {
  const c = ensureContext(); if (!c) return null;
  const bus = kind === 'music' ? musicBus : ambBus; // resolved after the context exists
  const node = { file, stopped: false, src: null, gain: null };
  load(file).then((buf) => {
    if (!buf || node.stopped) return;
    try {
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const g = c.createGain(); g.gain.value = 0; src.connect(g); g.connect(bus);
      if (kind === 'music') { // short, even fade-in from silence
        g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime((GAIN[file] ?? 1) * level, c.currentTime + Math.max(1.2, Math.min(fade, 2)));
      } else g.gain.setTargetAtTime((GAIN[file] ?? 1) * level, c.currentTime, fade / 3);
      src.start(); node.src = src; node.gain = g; log.loops.push({ kind, file, t: Math.round(performance.now()) });
    } catch { /* silent */ }
  });
  return node;
}
function stopLoop(node, fade = 0.6) {
  if (!node) return; node.stopped = true;
  if (node.src && ctx) { try { node.gain.gain.cancelScheduledValues(ctx.currentTime); node.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3); const s = node.src; window.setTimeout(() => { try { s.stop(); s.disconnect(); } catch { /* ignore */ } }, fade * 1000 + 200); } catch { /* ignore */ } }
}

export const gameSounds = {
  /** Call from any user gesture: creates/resumes the context and preloads every cue. */
  unlock() {
    const c = ensureContext(); if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    if (!gameSounds._preloaded) { gameSounds._preloaded = true; preloadAll(); }
    if (wantMusic && !musicNode) musicNode = startLoop('music', musicFile(wantMusic), musicBus, MUSIC_LEVEL[wantMusic]);
    if (wantAmbience && !ambNode) ambNode = startLoop('ambience', AMBIENCE[wantAmbience], ambBus, 0.4);
  },
  setMuted(v) { prefs.muted = Boolean(v); save(); applyLevels(); notify(); },
  toggleMute() { gameSounds.setMuted(!prefs.muted); return prefs.muted; },
  isMuted() { return prefs.muted; },
  getVolume() { return prefs.volume; }, setVolume(v) { prefs.volume = clamp01(v); save(); applyLevels(); notify(); },
  getMix() { return { volume: prefs.volume, sfx: prefs.sfx, music: prefs.music, muted: prefs.muted }; },
  setMix(part) { prefs = { ...prefs, ...Object.fromEntries(Object.entries(part).filter(([k]) => k in prefs).map(([k, v]) => [k, k === 'muted' ? Boolean(v) : clamp01(v)])) }; save(); applyLevels(); notify(); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  /** track: 'menu' | 'battle' | 'duel'. Switching tracks fades the old one out and the new one in. */
  startMusic(track = 'menu') {
    if (!MUSIC[track]) track = 'menu';
    if (wantMusic === track && musicNode) return;
    // Every screen shares one track: switching "theme" must not restart it, so it plays on unbroken.
    if (musicNode && !musicNode.stopped && musicNode.file === musicFile(track)) { wantMusic = track; return; }
    stopLoop(musicNode, 1.2); musicNode = null; wantMusic = track;
    musicNode = startLoop('music', musicFile(track), musicBus, MUSIC_LEVEL[track], 1.6);
  },
  /** 'dark' = Story Mode soundscape, 'default' = original. Re-starts the current music in the new theme. */
  setTheme(t) {
    const next = t === 'dark' ? 'dark' : 'default'; if (next === theme) return; theme = next; gameSounds._preloaded = false;
    if (wantMusic && !(musicNode && musicNode.file === musicFile(wantMusic))) { const w = wantMusic; stopLoop(musicNode, 0.8); musicNode = null; wantMusic = null; gameSounds.startMusic(w); }
    if (ctx) { gameSounds._preloaded = true; preloadAll(); }
  },
  getTheme() { return theme; },
  musicTrack() { return wantMusic; },
  stopMusic() { wantMusic = null; stopLoop(musicNode, 1.0); musicNode = null; },
  /** Smooth exit (leaving Story Mode): the track fades to silence over `sec` seconds instead of cutting. */
  fadeOutMusic(sec = 1.8) { wantMusic = null; stopLoop(musicNode, sec); musicNode = null; },
  startAmbience(arenaId) { gameSounds.stopAmbience(); if (!AMBIENCE[arenaId]) return; wantAmbience = arenaId; ambNode = startLoop('ambience', AMBIENCE[arenaId], ambBus, 0.4); },
  stopAmbience() { wantAmbience = null; stopLoop(ambNode, 0.8); ambNode = null; },
  duck(on) { ducked = Boolean(on); applyLevels(); },
  play, cue: play, seq, preload: preloadAll,
  cardSelect() { play('cardSelect'); }, callPower() { play('callPower'); }, callRank() { play('callRank'); }, cardPlay() { play('cardPlay'); },
  draw() { play('draw'); }, trickWin() { play('trickWin'); }, matchWin() { play('matchWin'); }, matchLose() { play('matchLose'); },
  damage() { play('damage'); }, heal() { play('heal'); }, ki() { play('ki'); }, round() { play('round'); }, ui() { play('ui'); }
};
