// Content + layout maths for the first-time tutorial. Pure functions, no React, so they can be unit-tested.
// Every number quoted to the player is read from GAME_CONFIG, so the tutorial can never drift from the rules.
import { GAME_CONFIG } from '../config/gameConfig.js';

export const TUTORIAL_KEY = 'mq_tutorial_v1';
export const HINTS_KEY = 'mq_tutorial_hints_done_v1';
// Story Mode has its own flags: someone who already knows Battle Mode still gets the Story tour (and hints) once.
export const STORY_TUTORIAL_KEY = 'mq_story_tutorial_v1';
export const STORY_HINTS_KEY = 'mq_story_tutorial_hints_done_v1';

const read = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return true; } };
const write = (k) => { try { localStorage.setItem(k, '1'); } catch { /* storage unavailable: the tour simply shows again next time */ } };
export const tutorialSeen = (story = false) => read(story ? STORY_TUTORIAL_KEY : TUTORIAL_KEY);
export const markTutorialSeen = (story = false) => write(story ? STORY_TUTORIAL_KEY : TUTORIAL_KEY);
export const hintsDone = (story = false) => read(story ? STORY_HINTS_KEY : HINTS_KEY);
export const markHintsDone = (story = false) => write(story ? STORY_HINTS_KEY : HINTS_KEY);

const fmtRow = (r) => [
  r.hp ? `${r.hp > 0 ? '+' : '−'}${Math.abs(r.hp)} HP` : null,
  r.ki ? `+${r.ki} Soul` : null,
  r.coins ? `+${r.coins} coin${r.coins > 1 ? 's' : ''}` : null,
].filter(Boolean).join(', ') || 'no change';

/** Story duels are always two-player; HP losses are scaled by the round (see progression.js `pace`), so say it in words, not exact numbers. */
export function storyRewardLines() {
  const [win, lose] = GAME_CONFIG.placements.TWO_PLAYER;
  return [
    `• Round winner: +${win.hp} HP and ${win.coins} coins`,
    `• Round loser: loses roughly ${Math.abs(lose.hp)} to ${Math.round(Math.abs(lose.hp) * 1.3)} HP (more if the duel drags on), but gains +${lose.ki} Soul`,
  ];
}

/** Placement lines for the current table size, straight from the config. */
export function rewardLines(mode) {
  const duel = mode === 2;
  const rows = duel ? GAME_CONFIG.placements.TWO_PLAYER : GAME_CONFIG.placements.FOUR_PLAYER;
  const names = duel ? ['Winner', 'Loser'] : ['1st', '2nd', '3rd', '4th'];
  return rows.map((r, k) => `• ${names[k]}: ${fmtRow(r)}`);
}

/**
 * The walkthrough. `target` is a CSS selector (or list: the first visible one wins); no target = a centred card.
 * `optional` steps are skipped when their element is not on screen right now (e.g. Edicts when you hold none).
 */
export function buildSteps(mode, story = false) {
  if (story) return buildStorySteps();
  const c = GAME_CONFIG;
  const { startingHp, startingKi, maxKi, openingHand } = c.survival;
  const { powerPerKi, rankPlacesPerKi } = c.boosts;
  const t = c.tiers;
  return [
    { title: 'Welcome to the table', lines: [
      `You are a vessel in a card duel. Every round, each vessel plays one card and the table is ranked. The best placement is rewarded, the worst is punished. Everyone starts with ${startingHp} HP; reach 0 and you are out. The last vessel standing wins.`,
      'This quick tour points at the real screen. Skip any time, and replay it later with the ? button at the top.',
    ] },
    { title: 'Your rivals', target: ['.opponent-rail .opp2', '.opponent-rail'], place: 'right', lines: [
      'These are the other vessels. You can see their HP and how many cards they hold, but never their cards or their Soul.',
      'A lit frame shows whose turn it is. When a rival speaks, tap their bubble to answer with an emoji.',
    ] },
    { title: 'HP: your life', target: '.hp-meter', lines: [
      `You start with ${startingHp} HP. Poor placements and some effects take it away; good ones restore a little. At 0 HP you are eliminated.`,
    ] },
    { title: 'Soul: your fuel', target: '.ki-meter', lines: [
      `Every card costs Soul to play (the ⚡ number on it). You start with ${startingKi} and can hold at most ${maxKi}.`,
      'Soul never refills by itself. You mostly earn it by placing low, so winning every round actually drains you. When it runs low, play cheap cards.',
    ] },
    { title: 'Your hand', target: '.player-hand-wrap', place: 'top', lines: [
      `You hold ${openingHand} cards, the fallen beings. Tap one to select it.`,
      'Greyed-out cards cannot be played right now: too expensive for your Soul, still resting after a play, or a Last Stand card that is not unlocked yet.',
      'The SORT HAND BY buttons below order your cards by Power, Rank or Soul cost.',
    ] },
    { title: 'Reading a card', target: ['.player-hand .card:not(.disabled)', '.player-hand .card'], place: 'top', lines: [
      '• P = Power. Higher is better.',
      '• R = Rank. LOWER is better (1 is the best).',
      `• ⚡ = Soul cost: Normal ⚡${t.NORMAL}, Powerful ⚡${t.POWERFUL}, Sovereign ⚡${t.OP}.`,
      'Strong cards cost more, so spend them where they matter.',
    ] },
    { title: 'Power or Rank?', target: '.human-stat-choice', place: 'top', lines: [
      'Each round has a leader. The leader selects a card and secretly calls CALL POWER (highest P wins) or CALL RANK (lowest R wins).',
      'Everyone else plays without knowing which one was called, so pick cards that can win either way. When you are not leading, these buttons stay locked.',
    ] },
    { title: 'Your selected card', target: '.selected-card-dock', place: 'left', lines: [
      'The card you choose appears here. Tap it to enlarge.',
      `When you are answering a call, boost controls appear here: spend extra Soul to add +${powerPerKi} Power or take −${rankPlacesPerKi} off Rank for each Soul (the limit depends on the card's tier).`,
    ] },
    { title: 'PLAY, Draw and Gather Soul', target: '.bottom-primary-actions', place: 'top', lines: [
      '• PLAY locks your card in face-down. Nobody sees it until everyone has played.',
      `• Draw card costs ${c.draw.cost} match coins and adds a card from the reserve (at most ${c.draw.maxDrawsPerPlayerPerMatch} per match).`,
      `• Gather Soul appears when you are answering a call: skip the round, pay ${c.charge.hp} HP and gain ${c.charge.ki} Soul. It needs more than ${c.charge.minHp} HP and has a ${c.charge.cooldownRounds}-round cooldown.`,
      `• No card you can afford? You must pass: −${c.passHpLoss} HP.`,
    ] },
    { title: 'The table', target: '.trick-area', place: 'bottom', lines: [
      'Played cards land here face-down. When everyone has played, they flip, the called stat decides the order, and a result banner shows who placed where.',
      'A card you have played rests for a round or two before you can use it again, so you cannot spam your best card.',
    ] },
    { title: 'Turn order', target: '.turn-order', place: 'bottom', lines: [
      'This shows who leads and who plays next. The leader rotates every round.',
      'The ✦ tips bar on the table always tells you what to do right now.',
    ] },
    { title: 'Rewards and penalties', lines: [
      'After every reveal, placement decides what happens:',
      ...rewardLines(mode),
      'Low placements hurt, but they feed you Soul, so you are never starved for long.',
    ] },
    { title: 'Edicts', target: '.wildcard-action-panel', optional: true, place: 'right', lines: [
      "Edicts are Monarque's one-shot tricks: heal, peek at a rival, blind the table, seal a card. You may use one per round, before you play your card.",
      'Tap an Edict to read exactly what it does before you commit to it.',
    ] },
    { title: 'Omens and the LOG', target: '.special-corner', place: 'left', lines: [
      'Effects that bend the rules show up here as icons. Hover or tap them to read what they do.',
      'Tap LOG to see what happened in each round.',
    ] },
    { title: 'Monarque', target: '.gm-emblem', place: 'bottom', lines: [
      'Monarque watches the table. At rounds 4, 8 and 12 he steps in with a Whim: a draft, a secret bid, a debt. A stirring appears the round before.',
      'Omens can twist a round, for example making the LOWER Power win. Read the banner each time.',
    ] },
    { title: 'Last Stand cards', target: '.card-laststand', place: 'top', lines: [
      `Two cards in your hand are LAST STAND cards. They cost nothing but can only be played when your Soul is 0.`,
      `Playing one shields you from that round's HP loss and gives +${c.lastStand.kiBonus} Soul. They are your safety net when Soul runs dry.`,
    ] },
    { title: 'You are ready', lines: [
      'For your first rounds, a gold highlight will point at what to tap next. You can hide those hints with the × on them.',
      'Need the full rules? Tap the i button. Want this tour again? Tap ?. Good luck, vessel.',
    ] },
  ];
}

/**
 * The Story Mode walkthrough: the same real table, told as a duel against one fallen warrior.
 * No fixed HP / Soul numbers are quoted for the player: they grow after every win (story/progression.js).
 */
function buildStorySteps() {
  const c = GAME_CONFIG;
  const { openingHand, maxKi } = c.survival;
  const { powerPerKi, rankPlacesPerKi } = c.boosts;
  const t = c.tiers;
  return [
    { title: 'Welcome to the duel', lines: [
      'Every bout is a card duel against one fallen warrior. Each round you both play a card and the two are ranked. The better card is rewarded, the worse one is punished. Reach 0 HP and the duel is lost.',
      'Win and you bind their power for yourself. Lose and you are sealed into a card. This quick tour points at the real screen. Skip any time, and replay it later with the ? button at the top.',
    ] },
    { title: 'Your opponent', target: ['.opponent-rail .opp2', '.opponent-rail'], place: 'right', lines: [
      'You can see their HP and how many cards they hold, but never their cards or their Soul.',
      'Their face and what they say appear in the top bar. Tap their words to answer with an emoji.',
    ] },
    { title: 'What is at stake', target: '.sm-hud', optional: true, place: 'right', lines: [
      'This panel names your opponent, shows what you win or lose, and the habit this duel is testing. Read its hint: it tells you how to beat them.',
      'A ◆ marks your Second Chance, a single retry if the duel goes against you.',
    ] },
    { title: 'HP: your life', target: '.hp-meter', lines: [
      'Poor placements and some effects take HP away; good ones restore a little. At 0 HP you are eliminated. Your maximum HP grows after every win.',
    ] },
    { title: 'Soul: your fuel', target: '.ki-meter', lines: [
      `Every card costs Soul to play (the ⚡ number on it). Soul never refills by itself, and you can only bank a few points above your opening amount (at most ${maxKi} early on).`,
      'You mostly earn it by placing low, so winning every round actually drains you. When it runs low, play cheap cards.',
    ] },
    { title: 'Your hand', target: '.player-hand-wrap', place: 'top', lines: [
      `You hold ${openingHand} cards, the fallen beings, plus any Powers you have bound. Tap a card to select it.`,
      'Greyed-out cards cannot be played right now: too expensive for your Soul, still resting after a play, or a Last Stand card that is not unlocked yet.',
      'The SORT HAND BY buttons below order your cards by Power, Rank or Soul cost.',
    ] },
    { title: 'Reading a card', target: ['.player-hand .card:not(.disabled)', '.player-hand .card'], place: 'top', lines: [
      '• P = Power. Higher is better.',
      '• R = Rank. LOWER is better (1 is the best).',
      `• ⚡ = Soul cost: Normal ⚡${t.NORMAL}, Powerful ⚡${t.POWERFUL}, Sovereign ⚡${t.OP}.`,
      'Strong cards cost more, so spend them where they matter.',
    ] },
    { title: 'Power or Rank?', target: '.human-stat-choice', place: 'top', lines: [
      'Each round has a leader. The leader selects a card and calls CALL POWER (highest P wins) or CALL RANK (lowest R wins).',
      'The other side answers without knowing which one was called, so pick cards that can win either way. When you are not leading, these buttons stay locked.',
    ] },
    { title: 'Your selected card', target: '.selected-card-dock', place: 'left', lines: [
      'The card you choose appears here. Tap it to enlarge.',
      `When you are answering a call, boost controls appear here: spend extra Soul to add +${powerPerKi} Power or take −${rankPlacesPerKi} off Rank for each Soul (the limit depends on the card's tier).`,
    ] },
    { title: 'PLAY, Draw and Gather Soul', target: '.bottom-primary-actions', place: 'top', lines: [
      '• PLAY locks your card in face-down. Nobody sees it until both of you have played.',
      `• Draw card costs ${c.draw.cost} match coins and adds a card from the reserve (at most ${c.draw.maxDrawsPerPlayerPerMatch} per duel).`,
      `• Gather Soul appears when you are answering a call: skip the round, pay ${c.charge.hp} HP and gain ${c.charge.ki} Soul. It needs more than ${c.charge.minHp} HP and has a ${c.charge.cooldownRounds}-round cooldown.`,
      `• No card you can afford? You must pass: −${c.passHpLoss} HP.`,
    ] },
    { title: 'The table', target: '.trick-area', place: 'bottom', lines: [
      'Played cards land here face-down. When both have played, they flip, the called stat decides the winner, and a result banner shows what changed.',
      'A card you have played rests for a round or two before you can use it again, so you cannot spam your best card.',
    ] },
    { title: 'Turn order', target: '.turn-order', place: 'bottom', lines: [
      'This shows who leads and who plays next. The lead swaps every round.',
      'The ✦ tips bar on the table always tells you what to do right now.',
    ] },
    { title: 'Rewards and penalties', lines: [
      'After every reveal, the result decides what happens:',
      ...storyRewardLines(),
      'Losing a round hurts, but it feeds you Soul, so you are never starved for long.',
    ] },
    { title: 'Your Powers', target: '.wildcard-action-panel', optional: true, place: 'right', lines: [
      'Powers are the abilities you bound from fallen warriors. You may use one per round, before you play your card.',
      'Each one costs Soul and is spent when used. Tap a Power to read exactly what it does before you commit to it.',
    ] },
    { title: 'Omens and the LOG', target: '.special-corner', place: 'left', lines: [
      'Effects that bend the rules show up here as icons. Hover or tap them to read what they do.',
      'Tap LOG to see what happened in each round.',
    ] },
    // Story duels schedule Monarque's Whims from round 3, then every third round (see story/duel.js `gm`).
    { title: 'Monarque', target: '.gm-emblem', place: 'bottom', lines: [
      'Monarque watches every duel. At rounds 3, 6 and 9 he can step in with a Whim: a draft, a secret bid, a debt. A stirring appears the round before.',
      'Omens can twist a round, for example making the LOWER Power win. Read the banner each time.',
    ] },
    { title: 'Last Stand cards', target: '.card-laststand', place: 'top', lines: [
      'Two cards in your hand are LAST STAND cards. They cost nothing but can only be played when your Soul is 0.',
      `Playing one shields you from that round's HP loss and gives +${c.lastStand.kiBonus} Soul. They are your safety net when Soul runs dry.`,
    ] },
    { title: 'You are ready', lines: [
      'For your first rounds, a gold highlight will point at what to tap next. You can hide those hints with the × on them.',
      'Need the full rules? Tap the i button. Want this tour again? Tap ?. Good luck, vessel.',
    ] },
  ];
}

/** Where to put a tooltip of `size` next to `rect` inside a vw x vh screen. Prefers `pref`, then any side with room, then clamps. */
export function placeTip(rect, size, pref, vw, vh) {
  const gap = 16; const m = 10;
  if (!rect) return { left: Math.max(m, (vw - size.w) / 2), top: Math.max(m, (vh - size.h) / 2), side: 'center' };
  const space = { top: rect.y, bottom: vh - (rect.y + rect.h), left: rect.x, right: vw - (rect.x + rect.w) };
  const fits = (s) => ((s === 'top' || s === 'bottom') ? space[s] >= size.h + gap + m : space[s] >= size.w + gap + m);
  const order = [pref, 'bottom', 'top', 'right', 'left'].filter(Boolean);
  const side = order.find(fits) ?? Object.keys(space).sort((a, b) => space[b] - space[a])[0];
  let left; let top;
  if (side === 'top' || side === 'bottom') { left = rect.x + rect.w / 2 - size.w / 2; top = side === 'top' ? rect.y - size.h - gap : rect.y + rect.h + gap; }
  else { top = rect.y + rect.h / 2 - size.h / 2; left = side === 'left' ? rect.x - size.w - gap : rect.x + rect.w + gap; }
  return { left: Math.min(Math.max(m, left), Math.max(m, vw - size.w - m)), top: Math.min(Math.max(m, top), Math.max(m, vh - size.h - m)), side };
}

/**
 * The live pointer for the first rounds: what the player should tap next, or null.
 * `selectedCard` is the id of the card currently selected (or null).
 */
export function liveHint(state, humanId, selectedCard) {
  if (!state || state.currentPlayer !== humanId) return null;
  if (state.phase === 'CALLING_STAT') {
    if (!selectedCard) return { target: '.player-hand-wrap', place: 'top', text: 'You lead this round. Tap a card in your hand to select it.' };
    return { target: '.human-stat-choice', place: 'top', text: 'Now call it: POWER means the highest P wins, RANK means the lowest R wins.' };
  }
  if (state.phase === 'PLAYING_CARD') {
    if (!selectedCard) return { target: '.player-hand-wrap', place: 'top', text: 'Your turn to answer. Tap a card you can afford (the ⚡ number must not exceed your Soul).' };
    return { target: '.bottom-play-button', place: 'top', text: 'Happy with it? Press PLAY. You can also spend extra Soul on the right to boost the card first.' };
  }
  return null;
}
