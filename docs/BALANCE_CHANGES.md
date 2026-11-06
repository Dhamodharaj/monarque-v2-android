# Balance changes (from the 4.7 simulations)

Evidence: `docs/BALANCE_REPORT.md` (current report), `docs/BALANCE_FINDINGS.md` (diagnosis), `docs/BALANCE_GATHER_WHATIF.md` (tuning sweep).
Reproduce: `npm run sim:balance` (about 17 minutes on two cores). Fast loop for one power: `node scripts/sim-balance.mjs --only tune --fighters kali,lucifer --n 150 --field 8`.

## What changed and why

| Change | Where | Why (measured) |
|---|---|---|
| **Gather Soul costs 11 HP** (was 5). Still +4 Soul, 3-round cooldown, locked at 20 HP or less. | `src/config/gameConfig.js` | Gathering whenever allowed beat the AI **66-71%** of duels. A lost round costs about 11.7 HP, so a flat 5 was cheaper than playing most follower rounds. At 11, always-gather measured 47-54% and never-gather 52-56% across independent samples: a real choice, neither dominant nor a trap. (At 12 it tipped toward a trap: always 46%, never 56%.) |
| **Fixed-stat Wish powers now wait for a matching call.** Absolute Measure boosts one stat (Kali, Briareus: Power; Chiyou, Lucifer: Rank). The AI used to fire them on any call, wasting them. | `src/story/storyAI.js` | They fired at round ~1.4 on any call. They now fire when the call matches (first use ~2). |
| **The AI calls the stat its held Wish boosts** when it leads. | `src/story/storyAI.js`, `src/game/AITurn.js` | RANK is only 26% of calls, so Rank-stat powers (Chiyou, Lucifer) almost never landed. |
| Coatlicue heals less: 20/24/28 HP to **16/19/22** | `powers.js`, `data-src/contender_powers_rows.js` | Consistently top of the field (58-59% over three samples). Now 54%. |
| Lucifer costs **2 Soul** (was 3), Soul drain 2/2/3 | same | Weakest in the field (43%). The cost cut helped (44-50% across samples) but it is **still the lowest contender**; watch it, and consider a stronger rider. |
| Chiyou costs **1 Soul** (was 2), self-damage 4/3/2 (was 6/4/3) | same | Weak across three samples (43%). Now ~49%. |
| Tiamat costs **2 Soul** at Step I (was 3), self-damage 3/3/2 (was 5/5/4) | same | Weak in both measures (44-46%). |
| Kali self-damage 5/4/3 (was 15/12/10) | same | 15 HP for one doubled card was never worth it (45% at every sample). |
| Briareus self-damage 5/4/3 (was 8/6/5) | same | Same reason. |
| In-game Gather Soul text and tests read the numbers from config | `Tour.jsx`, `CoachBar.jsx`, tests | They hard-coded "-5 HP". |

## Before and after

| Measure | Before | After |
|---|---|---|
| Seat 1 win rate (mirror duels) | 50.6% | 49.2% (no seat edge either way) |
| Always-gather vs the AI | 66-71% | 47-54% |
| Spread of contender win rates vs pure noise | 1.5x noise, 4 outliers | about 1.0x noise, no outliers |
| Weakest / strongest contender (round robin) | 43.0% / 57.8% | 44.4% / 54.8% |
| Campaign full clear (70 runs, AI as player) | 44% | 40% (within noise) |
| Median duel length | 20 rounds | 19 rounds |

## Deliberately not changed

- **The leader edge (69% of rounds).** Leadership alternates, so no seat is favoured. It was the root cause of the Gather problem, and fixing Gather's price addresses the symptom. Changing it touches the core rules; try it only with human playtesting.
- **POWER vs RANK.** Always-RANK ties the AI while spending ~10 less Soul; always-POWER loses. That is an AI habit (it calls POWER 71%), not a rule to patch. It may be worth teaching the AI to call RANK more.
- **Apep, Perchta, Camazotz, Shuten-dōji.** About 60% against a no-power foe, but 52-54% against the field, so they are strong only relative to having nothing. Single-sample ablation numbers moved by up to 8 points between runs, so I did not tune on them.
- **Power grades (S to C).** They do not predict strength (correlation near 0). They are left as flavour. Re-grade from `BALANCE_REPORT.md` if you want them to mean something.
- **Round 6 (Berserker)** stays hard (first-try win ~23-35%) because it is designed as a boss.

## Caveats

Everything is measured with the game's own AI on both sides. Treat the numbers as diagnostics, not final player balance. Each round-robin pairing has only 12 games, and single powers carry roughly +/-5 points of noise per run.

## Stat progression (HP and Soul grow through the run)

Story Mode no longer starts everyone at a flat 100 HP / 14 Soul. All numbers live in `src/story/progression.js`.

| Round | Player HP / Soul | Opponent HP / Soul |
|---|---|---|
| 1 | 90 / 13 | 96 / 14 |
| 2 | 94 / 13 | 104 / 15 |
| 3 | 98 / 14 | 110 / 16 |
| 4 | 102 / 14 | 122 / 17 |
| 5 | 106 / 15 | 132 / 19 |
| 6 (Berserker) | 110 / 15 | 150 / 21 |
| Final (Berserker power) | 150 / 21 | Monarque 228 / 31, then 210 / 28, then 196 / 26 |

- Each fighter's HP cap is its starting HP; the Soul cap is its starting Soul + 6 (+9 for the Berserker and Monarque).
- The opponent is always ahead and the gap widens each round; Monarque stays above the player but fades bout by bout.
- AI-pilot simulation (250 runs, `node scripts/sim-story.mjs 250`), first-try win rate by round: 70 / 69 / 60 / 57 / 47 / 44 %.
  Final bouts: 36 / 54 / 70 % each, 91 % to win at least one of the three. Median duel length unchanged (19 rounds).
  Before: 69 / 70 / 74 / 61 / 56 / 23 % (a sudden spike at the Berserker) and 97 % in the final.
- Pacing (`PROGRESSION.pace`): a multiplier on every HP loss in a duel, higher = shorter. Median duel length by encounter went
  17 / 19 / 19 / 21 / 21 / 22 / 29 rounds to 14 / 16 / 18 / 19 / 21 / 23 / 28 (R1..R6, Final) with the pace table 1.3 / 1.25 / 1.12 / 1.08 / 1.0 / 0.96.
  Win rates are unchanged within noise. `sim-story.mjs` now prints p10 / median / p90 per encounter.
- To retune without editing code: `PROG='{"foe":[...]}' node scripts/sim-story.mjs 200`.

## Encounter trials (each fight tests a different skill)

`src/story/trials.js`. A trial only turns existing knobs: how the opponent's AI calls POWER/RANK, how it treats Soul, when it fires its
powers, and a small HP/Soul tilt on the progression table. No new characters and no new combat rules. Every briefing and the in-duel HUD
say what the duel tests and how to counter it.

| Encounter | Trial | Skill | What the opponent does |
|---|---|---|---|
| Round 1 | Creature of habit | Adaptation | Repeats its previous call ~95% of the time: notice it and use it |
| Round 2 | War of attrition | Resource management | +3 Soul, keeps a deep reserve, wins slowly with cheap cards |
| Round 3 | Unreadable | POWER/RANK prediction | Switches stats unpredictably (repeats ~40%), so you cannot plan around the next call |
| Round 4 | The patient blade | Timing | Holds its powers until round 9 or until someone is hurt, then fires every round |
| Round 5 | All in | Risk management | Aggressive, spends Soul down to nothing, fires powers early (-7 HP to compensate) |
| Round 6 | No slips (Berserker) | Card selection | No mistakes, no noise: every wasted card is a lost round |
| Final I | He learns | Adaptation | Habit, then reverses to alternating calls from round 8 |
| Final II | Crushing pressure | Resource management | +1 Soul, thrifty, never wastes Soul |
| Final III | Nothing to lose | Risk management | Gambles its own HP and Soul for the kill |

AI-pilot simulation (250 runs): first-try win 74 / 68 / 62 / 53 / 44 / 46 %; final bouts 40 / 45 / 65 %, 88 % to win at least one.
Duel lengths keep the pacing ramp. The simulated player AI does not exploit tendencies the way a human can, so human win rates on the
habit and prediction trials should be higher. Tune a trial without editing code:
`TRIALS='{"HABIT":{"stats":{"hp":4,"soul":1}}}' node scripts/sim-story.mjs 200`. `npm run test:trials` checks the behaviours above.
