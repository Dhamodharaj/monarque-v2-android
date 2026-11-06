# Implementation notes: MONARQUE: Cards of the Fallen

## Architecture
- **Engine (unchanged rules)**: `src/game/GameEngine.js`, `AIEngine.js`, `AITurn.js`, `Dealer.js`. Effect IDs (`SENZU`, `FINAL_ATONEMENT`, ...) are internal compatibility IDs. Battle Mode runs on the engine directly.
- **Presentation layer**: `src/game/lexicon.js` (`L()` display translator with a story/battle mode), `presentation.js` (event copy), UI components and `src/monarque-theme.css` (palette override, loaded last).
- **Data**: `data-src/*.json` (supplied) -> `scripts/build-monarque-data.mjs` -> `src/data/cards.json` (83 records) + `src/data/monarque.generated.js`. `ENGINE_EFFECT` is the only Monarque-ID to engine-ID bridge.
- **Story Mode** (`src/story/`): `powers.js` (32 contender powers; `P()` maps `soul/oppSoul` to engine `ki/oppKi` and Monarque family IDs to engine families), `roster.js`, `storyFlow.js` (7 encounters, save keys `monarque.story.*`), `duel.js` (story engine factory, Monarque's three bouts), `storyAI.js` (temperament), `reactions.js` (dialogue, four Monarque stages), `StoryApp.jsx`/`Opening.jsx`/`StoryHud.jsx`.
- A contender power is an engine wild card (its family) plus a rider; Steps I/II/III (from wins) strengthen the rider and trim the Soul price, read narratively as Resistance / Adaptation / Stability.

## Terminology
Both modes: Soul (the engine's internal `ki` field, same values, caps and costs), Gather Soul (the internal charge action), Edict, Whim, Omen, Bound Being. Story Mode also calls wild cards Powers and the player a Contender. The old resource name is not shown anywhere; it survives only as internal field/ID names. Essence is presentation-only (the transfer beat after a win); there is no new currency or hidden modifier.

## Temperament AI (real decisions)
Sovereign never spends its own HP without a lethal window; Deceiver opens with blinding/seal/foresight; Devourer presses harder as the foe weakens and half-values healing while healthy; Ancient holds everything in rounds 1-2 and fires only high-value powers after. Covered by `scripts/test-temperament.mjs`.

## Verification actually run
`npm test` (build:data, validate-cards, validate-monarque-data, legacy-audit, survival, special mechanics, soul costs, power facts, gather soul, AI sims, regressions, story and story-flow, temperament, trials, adaptation, emotes): all pass. `sim-story` (70 runs, 0 stuck) and `sim-final` run clean. UI bundled with esbuild and exercised in headless Chromium (home, contender select, opening, live duel): no page errors.

## Individual Soul costs
Each bound being has a `soulCost`. Story Mode stamps its cards `costMode: 'SOUL'` and `getCardCost` then returns that value; Battle Mode and any card without a valid `soulCost` use the tier cost. Values, rubric and rules: `docs/SOUL_COSTS.md`. They are first-pass balance values; the story simulations were re-run after the change.

## Power facts (presentation only)
`src/game/powerFacts.js` builds six rows for the activation sheet (`WildcardSheet.jsx`): Soul cost, HP cost, Duration, Can it be countered?, Spent?, and Changes (this round or later). Numbers come from the card the engine will resolve, so Steps and the berserk surge are shown correctly. No rule changed. `scripts/test-power-facts.mjs` fires all 32 powers at all 3 Steps and checks every stated cost, duration and seal length against the engine, plus the counter claims (Unbreaking cancels HP loss, Soul loss cannot be blocked, a Blinding Eclipse blocks your power that round).
What "countered" means here: the engine has no counter action, so once a power is used the foe cannot answer it. The only things that stop it are before use (the foe's Blinding Eclipse, an Edict lockout, one power per round) and Unbreaking, which cancels HP loss. A power is spent for the duel and returns at the start of the next one; in Battle Mode an Edict is spent for the match.

## Known limitations
- `vite build` could not run in the authoring sandbox (package registry blocked); the esbuild bundle was used for the browser check. Run `npm install && npm run build` locally.
- No art ships for cards, contenders, Edicts, Whims or Omens (none supplied, none generated): sigil/initial fallbacks are used and the browser logs 404s for those image URLs. Add files at the paths in the data (`/cards/<id>.webp`, `/story/fighters/<id>.webp`).
- Six round images exist for seven encounters; the final reuses the Round 6 backdrop.
- Contenders are fighters, not playable cards. They have no `power`, `rank` or `powerGroup` fields (removed from `data-src/contender_cards_32.json`, `roster.js` and the shop), and no stand-in stats are invented. In the Gallery they are reference-only (not purchasable), like Edicts, Whims and Omens, which also show no Power/Rank. A contender's combat identity is its signature power (`powers.js`, three Steps) plus the bound-being deck it plays. Power, Rank and tier exist only on the 60 bound beings. `build-monarque-data.mjs` and `validate-monarque-data.mjs` fail if a contender gains any of these fields.
- The Essence Fragment boon from the original spec is not implemented (the Berserker replaced the Corrupted warrior). Soul costs per power follow `contender_powers_rows.js`, not per-card costs in `story.txt`.
- The supplied powers file says mechanics are unchanged per slot of the earlier build; they are not (families and costs differ). The supplied file was used as written.
- Audio filenames and the legacy audio set predate the rename; audio is not regenerated. All modes use the shipped dark soundtrack.

## Round 4 changes
- Roster replaced by the supplied contender_cards_32.json / contender_powers_rows.js; 32 contender portraits in `public/story/fighters/`. Rarity in the data equals the power grade (S legendary, A epic, B rare, C common) and is checked.
- Battle setup rebuilt (`src/setup.css`, `su-*` classes): the hall image fills the screen and changes with the selection.
- Card faces: art fills the card; name plus P/R on one slim strip (`src/final-fixes.css`). Round reveal shows name and stats only.
- Story HUD renders into `#story-hud-slot` under the Powers panel. Old saves that reference removed contenders are discarded; an error boundary replaces any blank screen with a reset button.
- Story select no longer defaults to a hard-coded contender id (this crashed the screen with the new roster).

## Performance pass
- `src/perf.css` (loaded last): no backdrop-filter, no endless box-shadow/filter animations, isolated cards, no full-screen filters on story screens. Headless battle table: ~13 fps -> 60 fps.
- Contender portraits resized to 512px (5.9 MB -> 2.1 MB); Monarque image is WebP (1 MB -> 138 KB).

## Round 8 — 60 bound beings, 12-card hands
- Bound beings: `data-src/bound_being_cards_60.json` (60 records, ranks 1–60) with art in `public/cards/` (512px webp). Registry is now 83 records.
- Hands are 12 cards in 2- and 4-player matches; draws are limited to 3 per match (min deck 4×12 + 4×3 = 60).
- Cooldowns scaled for the smaller hand: 2 rounds after a top-two finish, 1 after a bottom finish; +1 Powerful, +2 OP.
- The roster has 7 Elusive (Weak) beings; a 4-player deal needs 8 Last Stands, so the dealer binds the weakest NORMAL being as the 8th (`Dealer.js`).
- Contender `powerImage` is the contender's own portrait (set in the build script); no separate power art.
- Round reveal sized by viewport height (`final-fixes.css`, round 8 block). Gallery fallback tile is now hidden unless an image fails.

## Round 9 — legibility, table talk, stronger opponents
- `final-fixes.css` round 9: thin edges on every panel/meter/chip, text halos on see-through panels, bordered table cards, preview frame is square (matches the art).
- Gallery: CONTENDERS tab (the 32 contenders, art and lore, priced by rarity). Edict / Omen / Whim art added under `public/story/{edicts,omens,whims}`.
- `src/story/chatter.js`: Battle Mode AI seats talk as their contender (own lines, then temperament lines), never revealing cards or calls. Bubble shows on the seat's panel for ~5s.
- `AIEngine`: public card counting, expected-placement scoring (HP + discounted Soul from the placement tables), win-chance, per-temperament persona (`setPersona`). `scripts/sim-ai-vs.mjs` A/B: upgraded seat wins ~49% of 4-player matches vs three original-heuristic AIs (25% is even).


## Story revision: screenplay narration, Berserker (supersedes spec sections 9 and 12.8)
- `docs/STORY_SCREENPLAY.md` is canonical. `MONARQUE_STORY_SPEC.md` and the screenplay now both describe the Berserker (sections 9 and 12.8 were rewritten to match the shipped game); `src/story/narration.js` is the text actually played.
- Round 6 is the **Berserker**: chosen **uniformly at random** from fighters the player has NOT beaten (never the player, never a power the player holds). An earlier build ranked the archive by rating and favored the top, so the same fighter (Hades) kept returning; the rating weighting is gone. Rules: 150 HP, 21 opening Soul (caps raised to 150 / 30 via per-player `maxHp` / `maxKi`), own power plus one more, all effects x1.5 (`BERSERK_BOOST`; costs the wielder pays are not scaled), Step III.
- After the Berserker falls the player may take only its exact power (`run.berserkPower`). It fights at x1.5 in the final bouts. No power is ever granted by Monarque.
- Old saves: `run.champion` is ignored; a round-6 save without `run.berserker` builds one on load.
- Balance (`npm run sim:story`, 150 runs): Round 6 first-try win about 45%, previously about 49%.
- `npm test` now includes `scripts/test-story-flow.mjs` (Berserker rules, surge maths, narration hygiene).
- Known: a fresh `npm install` pulls a Vite whose CSS minifier rejects a rule in `src/arena-theme.css`; `vite build --minify false` works. Not changed here.

## Cleanup and author credit (current build)
- Removed the old `docs/legacy-v12/` notes archive, the pre-change balance snapshot (`BALANCE_REPORT_BEFORE.*`), the one-off transformation brief (`MONARQUE_IMPLEMENTATION_BRIEF.md`) and unused code (`src/components/RoundWinner.jsx`, `src/game/Deck.js`). `src/utils/validators.js` stays because `scripts/test-special-mechanics.mjs` imports it.
- Author credit "dhamo ss" (`AUTHOR` in `src/config/gameConfig.js`): shown on the main menu (`.game-signature`), as the closing beat of the ending cutscene (`ENDING` in `narration.js`), on the ending screen (`.sm-credit`), in the Battle Mode footer and in `index.html` (`meta author`).
- Berserker selection is uniformly random from fighters never faced and not held; `scripts/test-story-flow.mjs` checks both the exclusions and the variety (32 different fighters over 120 seeds).

## Emoji replies read the table (`src/story/emoteReply.js`)
- When the player taps a rival's bubble and sends an emoji, the rival no longer answers from a fixed emoji-to-reply table. `readTable()` builds the situation from what is already on screen (who took the last round, who placed above whom, the Health that round cost, both Health totals) and `answerEmote()` combines it with what the emoji means (`INTENT`: taunt, anger, fear, confusion, threat, shock).
- A rival that won the round gloats and states the cost ("That round cost you 15 Health."); one that lost can be sore and says what it cost it; one below 30% Health answers from the corner; before any round it invents no result; the same emoji sent three times in 30 s is called out. Voice follows the contender's style (feral, sly, regal, still); Monarque uses the regal voice. A still being may stay silent about 15% of the time.
- Used by Battle Mode (`BattleChatter.react`) and Story Mode (`ReactionTracker.react`, which records the last round in `observe`). Fixed a bug where a rival that had just won the round answered a kiss with the sourness reserved for a rival that had lost.
- `scripts/test-emotes.mjs` covers the reported case (rival wins, player sends a kiss, never a sour line), the losing, cornered, no-round and repeat cases for all four styles, and the Battle and Story wiring. All reply lines are part of the dialogue hygiene audit.

