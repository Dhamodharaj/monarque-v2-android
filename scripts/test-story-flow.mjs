// Story flow rules from the screenplay: the Berserker replaces the Corrupted, is never someone the player beat, carries the +50% surge,
// the player takes only that exact power, and every authored line is clean.
import { newRun, opponentFor, buildBerserker, buildDuelCfg, claimOptions, stageOf, ROUND_NAMES, BERSERKER } from '../src/story/storyFlow.js';
import { createStoryEngine } from '../src/story/duel.js';
import { POWER_OF, powerCard, describePower, BERSERK_BOOST } from '../src/story/powers.js';
import { ROSTER } from '../src/story/roster.js';
import { PROGRESSION, foeStart, monarqueStart } from '../src/story/progression.js';
import { TRIALS, trialFor, tiltStart } from '../src/story/trials.js';
import { ALL_NARRATION, fill, INTRO_CHOICES, ROUND_LINES, WIN_LINES } from '../src/story/narration.js';
import { readFileSync } from 'node:fs';
const newBaseRun = (...a) => ({ ...newRun(...a), difficulty: 'baseline' }); // raw authored progression, no difficulty scaling
const cards = JSON.parse(readFileSync(new URL('../src/data/cards.json', import.meta.url)));
let fails = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) fails++; };

ok(ROUND_NAMES[6] === 'The Berserker' && stageOf(6) === 'BERSERKER', 'round 6 is the Berserker encounter (the Corrupted is gone)');
ok(!JSON.stringify([ROUND_NAMES, ALL_NARRATION()]).match(/corrupt/i), 'no Corrupted wording in round names or narration');

const seenBz = new Map();
let notBeaten = true, notSelf = true, notHeld = true, soundKit = true, onlyOwn = true;
for (let i = 0; i < 120; i++) {
  const fighter = ROSTER[i % 32].id; const run = newBaseRun(fighter, `flow-${i}`);
  for (let r = 1; r <= 5; r++) run.powers.push(run.bracket.path[r].fighterId === fighter ? fighter : run.bracket.path[r].fighterId);
  run.powers = [...new Set(run.powers)]; run.round = 6; run.wins = 5;
  const bz = buildBerserker(run); run.berserker = bz; seenBz.set(bz.fighterId, (seenBz.get(bz.fighterId) ?? 0) + 1);
  const beaten = [1, 2, 3, 4, 5].map((r) => run.bracket.path[r].fighterId);
  if (beaten.includes(bz.fighterId)) notBeaten = false;
  if (bz.fighterId === fighter) notSelf = false;
  if (run.powers.includes(bz.fighterId)) notHeld = false;
  if (bz.powers.length !== 1 + BERSERKER.extraPowers || new Set(bz.powers).size !== bz.powers.length || bz.powers.some((p) => !POWER_OF[p] || p === fighter)) soundKit = false;
  if (!bz.monarquePower || !BERSERKER.monarqueEdicts.includes(bz.monarquePower)) soundKit = false;
  const opp = opponentFor(run); const opts = claimOptions(run, opp);
  if (opts.length !== 1 || opts[0] !== bz.fighterId) onlyOwn = false;
}
ok(notBeaten, 'the Berserker is never an opponent the player already beat (120 seeds)');
ok(notSelf && notHeld, 'the Berserker is never the player, nor someone whose power the player already holds');
{ const top = Math.max(...seenBz.values()); ok(seenBz.size >= 12 && top <= 120 * 0.2, `the Berserker is a uniform random pick, not always the same top fighter (${seenBz.size} different fighters over 120 seeds, most frequent ${top}x)`); }
ok(BERSERKER.extraPowers === 5, 'the Berserker carries five random powers beside its own, like the player');
ok(soundKit, `Berserker carries its own power plus ${BERSERKER.extraPowers}, all valid and distinct, plus one Monarque Edict`);
ok(onlyOwn, 'after round 6 the player may take only the Berserker’s exact power');

// the surge
{
  const run = newBaseRun('hades', 'surge'); run.round = 6; run.wins = 5; run.berserker = buildBerserker(run);
  const cfg = buildDuelCfg(run);
  ok(cfg.stage === 'BERSERKER' && cfg.hud.berserker === true && cfg.foe.boost === BERSERK_BOOST && cfg.foe.start.hp === 150 + trialFor(6).stats.hp, 'duel config marks the Berserker: boost 1.5, 150 HP');
  const eng = createStoryEngine(cards, { ...cfg, random: () => 0.37 });
  const foe = eng.state.players[1], me = eng.state.players[0];
  ok(foe.hp === 150 + trialFor(6).stats.hp && foe.maxHp === foe.hp && foe.ki === BERSERKER.soul + trialFor(6).stats.soul && foe.maxKi === BERSERKER.maxSoul + trialFor(6).stats.soul, 'Berserker starts with +50% HP and Soul and the caps to hold them');
  ok(me.hp === PROGRESSION.player[6][0] && me.maxHp === me.hp && me.ki === PROGRESSION.player[6][1] && me.maxKi === me.ki + PROGRESSION.headroom, 'the player enters round 6 at their grown HP and Soul, with caps to match');
  foe.hp = 120; eng.state.currentPlayer = foe.id; foe.ki = 30;
  const heal = foe.hand.find((c) => c.story && c.story.rider.hp); if (heal) { try { eng.useWildcard(foe.id, heal.id, {}); } catch { /* staged */ } ok(foe.hp >= 120 && foe.hp <= 150, 'a heal never drags the Berserker below its own starting health'); }
  // scaling math
  for (const id of ['coatlicue', 'surtr', 'baba-yaga']) {
    const base = powerCard(id, 3), big = powerCard(id, 3, 'x', BERSERK_BOOST);
    const sum = (r) => ['hp', 'ki', 'oppKi', 'oppDmg', 'others', 'nextPower'].reduce((t, k) => t + (r[k] ?? 0), 0);
    ok(sum(big.story.rider) > sum(base.story.rider) && big.story.rider.self === base.story.rider.self && big.story.kiCost === base.story.kiCost, `${id}: effects scale up by half, own HP cost and Soul price do not`);
  }
  ok(describePower(POWER_OF.coatlicue, 3, BERSERK_BOOST).text !== describePower(POWER_OF.coatlicue, 3).text, 'boosted power text shows the larger numbers');
  // player power from the claimed berserker power
  run.powers.push(run.berserker.fighterId); run.berserkPower = run.berserker.fighterId; run.round = 7;
  ok(buildDuelCfg(run).human.boosted.length === 0 && buildDuelCfg(run).human.powers.includes(run.berserkPower), 'the claimed berserker power is an ordinary collected power (no effect boost) in the final bouts');
  ok(buildDuelCfg({ ...run, berserkPower: null }).human.boosted.length === 0, 'the player’s own powers are never boosted by Monarque');
  ok(buildDuelCfg(run).human.surged.includes(run.berserkPower) && buildDuelCfg({ ...run, berserkPower: null }).human.surged.length === 0, 'only the claimed berserker power carries the +40% HP and Soul surge');
  { const c = powerCard(run.berserkPower, 3, 'x', 1, 0.4); ok(c.story.surge === 0.4 && /40% max HP and Soul/.test(c.description), 'the surge is stated on the card'); }
}

// stat progression: the player grows, every foe stays a step above, the gap widens, the final lifts the player to the Berserker's body
{
  const P = PROGRESSION, hp = (t, r) => t[r][0], soul = (t, r) => t[r][1];
  const rounds = [1, 2, 3, 4, 5, 6];
  ok(rounds.slice(1).every((r) => hp(P.player, r) > hp(P.player, r - 1) && soul(P.player, r) >= soul(P.player, r - 1)), 'the player grows after every win (HP strictly, Soul never shrinks)');
  ok(rounds.slice(1).every((r) => hp(P.foe, r) > hp(P.foe, r - 1) && soul(P.foe, r) >= soul(P.foe, r - 1)), 'opponents grow round over round too');
  ok(rounds.every((r) => hp(P.foe, r) > hp(P.player, r) && soul(P.foe, r) > soul(P.player, r)), 'every opponent has more HP and Soul than the player');
  ok(hp(P.foe, 6) - hp(P.player, 6) > hp(P.foe, 1) - hp(P.player, 1) && soul(P.foe, 6) - soul(P.player, 6) > soul(P.foe, 1) - soul(P.player, 1), 'the gap widens toward the Berserker');
  ok(hp(P.player, 1) < 100 && P.player[1][1] < 14, 'the player starts frailer than the old flat 100 HP / 14 Soul');
  ok(P.playerFinal[0] === P.player[6][0] && P.playerFinal[1] === P.player[6][1], 'the final body equals round 6; the +40% comes only from playing the Berserker power');
  ok(P.monarque.every(([h, s]) => h > P.playerFinal[0] && s > P.playerFinal[1]), 'Monarque stays above the player in all three bouts');
  ok(P.monarque.every(([h, s], i) => i === 0 || (h < P.monarque[i - 1][0] && s < P.monarque[i - 1][1])), 'Monarque fades bout over bout');
  for (const r of rounds) {
    const run = newBaseRun('hades', `prog-${r}`); run.round = r; run.wins = r - 1; if (r === 6) run.berserker = buildBerserker(run);
    const cfg = buildDuelCfg(run), eng = createStoryEngine(cards, { ...cfg, random: () => 0.37 });
    const [me, foe] = eng.state.players;
    ok(me.hp === hp(P.player, r) && me.maxHp === me.hp && me.ki === soul(P.player, r) && me.maxKi === me.ki + P.headroom, `round ${r}: the player starts at ${hp(P.player, r)} HP / ${soul(P.player, r)} Soul with matching caps`);
    const tilt = tiltStart(foeStart(r), trialFor(r));
    ok(foe.hp === tilt.hp && foe.maxHp === foe.hp && foe.ki === tilt.ki && foe.hp > me.hp && foe.ki > me.ki, `round ${r}: the opponent starts at ${tilt.hp} HP / ${tilt.ki} Soul (progression + trial tilt), above the player`);
  }
  {
    const run = newBaseRun('hades', 'prog-final'); run.round = 7; run.berserkPower = run.powers[0];
    for (let b = 0; b < 3; b++) {
      run.boutsLost = b; const eng = createStoryEngine(cards, { ...buildDuelCfg(run), random: () => 0.37 }); const [me, gm] = eng.state.players;
      ok(me.hp === P.playerFinal[0] && me.maxHp === me.hp && me.ki === P.playerFinal[1] && me.maxKi === P.player[6][1] + P.berserkerHeadroom, `final bout ${b + 1}: the player fights with the round-6 body (${me.hp} HP / ${me.ki} Soul, cap ${me.maxKi})`);
      const mt = tiltStart(monarqueStart(b), trialFor(7, b));
      ok(gm.hp === mt.hp && gm.maxHp === gm.hp && gm.ki === mt.ki && gm.hp > me.hp && gm.ki > me.ki, `final bout ${b + 1}: Monarque is higher (${gm.hp} HP / ${gm.ki} Soul)`);
    }
  }
  {
    // healing respects the lower per-run cap instead of the old flat 100
    const run = newBaseRun('hades', 'prog-heal'); run.round = 1; const eng = createStoryEngine(cards, { ...buildDuelCfg(run), random: () => 0.37 }); const me = eng.state.players[0];
    ok(me.maxHp === hp(P.player, 1) && me.maxHp < 100 && me.maxKi === soul(P.player, 1) + P.headroom && me.maxKi < 20, 'caps are per run: round 1 healing and Soul stop at the round-1 caps, not 100 / 20');
  }
}

// pacing: early encounters are shorter (higher HP-loss multiplier), late ones keep full length, and it reaches the engine
{
  const P = PROGRESSION;
  ok(P.pace.slice(2).every((v, i) => v <= P.pace[i + 1]) && P.pace[1] > P.pace[6], 'pace eases off round over round: early fights are the quickest');
  ok(P.paceFinal.every((v) => v > 0.5 && v < 1.5) && P.pace.slice(1).every((v) => v > 0.5 && v < 1.5), 'pace stays in a sane range');
  const run = newBaseRun('hades', 'pace'); run.round = 1; const cfg = buildDuelCfg(run);
  ok(cfg.pace === P.pace[1] && createStoryEngine(cards, { ...cfg, random: () => 0.37 }).story.pace === P.pace[1], 'round 1 duel carries its pace into the engine');
  run.round = 7; ok(buildDuelCfg(run).pace === P.paceFinal[0], 'the final carries its own pace');
}

// narration hygiene
{
  const lines = ALL_NARRATION();
  ok(lines.length > 50 && lines.every((t) => typeof t === 'string' && t.trim().length > 1), `all ${lines.length} authored lines are non-empty`);
  ok(fill('I am {name}!', 'Kali') === 'I am Kali!' && !lines.some((t) => /undefined|\[object|\[Player Name\]/.test(fill(t, 'Kali'))), 'placeholders resolve; no stray tokens');
  ok(INTRO_CHOICES.length === 2 && INTRO_CHOICES[1].id === 'refuse', 'intro offers accept / refuse');
  ok(ROUND_LINES.length === 7 && WIN_LINES.length === 6, 'Monarque has progression lines for every round');
}
process.exit(fails ? 1 : 0);
