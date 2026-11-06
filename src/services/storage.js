import { emptyProgress, normalizeProgress } from './progress.js';

const STORAGE_KEY = 'monarque.game.v1';
const LEGACY_KEY = 'dragon-ball-card-game:v1'; // pre-rename saves are carried over once, never written back

const DEFAULT_DATA = Object.freeze({
  profile: { name: 'Vessel', walletCoins: 0, ownedCardIds: [] },
  settings: { animations: true },
  stats: {
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
    twoPlayerMatches: 0,
    fourPlayerMatches: 0,
    roundsWon: 0,
    cardsBanished: 0,
    drawsUsed: 0,
    coinsEarned: 0,
    coinsSpent: 0
  },
  matchHistory: [],
  progress: emptyProgress()
});

function cloneDefaults() { return structuredClone(DEFAULT_DATA); }

const num = (v, fallback = 0, max = 1e9) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.floor(n))) : fallback; };
const cleanName = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) : '') || 'Vessel';

// Everything read back from localStorage is untrusted (hand-edited, truncated, or written by another build): coerce every field.
function normalize(data) {
  const defaults = cloneDefaults();
  const stats = { ...defaults.stats };
  for (const k of Object.keys(defaults.stats)) stats[k] = num(data?.stats?.[k], 0);
  stats.roundsWon = num(data?.stats?.roundsWon ?? data?.stats?.tricksWon, 0); // migrate legacy trick-era stat names
  stats.cardsBanished = num(data?.stats?.cardsBanished ?? data?.stats?.cardsCaptured, 0);
  const history = Array.isArray(data?.matchHistory) ? data.matchHistory.filter((m) => m && typeof m === 'object' && !Array.isArray(m)).slice(0, 20) : [];
  return {
    profile: {
      name: cleanName(data?.profile?.name),
      walletCoins: num(data?.profile?.walletCoins, defaults.profile.walletCoins),
      ownedCardIds: Array.isArray(data?.profile?.ownedCardIds) ? [...new Set(data.profile.ownedCardIds.filter((id) => typeof id === 'string' && id.length < 80))] : [],
    },
    settings: { animations: typeof data?.settings?.animations === 'boolean' ? data.settings.animations : defaults.settings.animations },
    stats,
    matchHistory: history,
    progress: normalizeProgress(data?.progress),
  };
}

export function loadGameData() {
  try {
    let raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) { raw = window.localStorage.getItem(LEGACY_KEY); if (raw) { try { window.localStorage.setItem(STORAGE_KEY, raw); } catch { /* ignore */ } } }
    return raw ? normalize(JSON.parse(raw)) : cloneDefaults();
  } catch { return cloneDefaults(); }
}

export function saveGameData(data) {
  const normalized = normalize(data);
  // Blocked or full storage (private mode, quota) must never break a purchase or a settings toggle: play on, just unsaved.
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch { /* not persisted */ }
  return normalized;
}

export function updateGameData(updater) {
  const current = loadGameData();
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  return saveGameData(next);
}

export function resetGameData() {
  const defaults = cloneDefaults();
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults)); } catch { /* not persisted */ }
  return defaults;
}
