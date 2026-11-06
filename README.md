# MONARQUE: Cards of the Fallen

*A game by dhamo ss.*

A grimdark single-player card duel. You are a contender in Monarque's court: five knockout rounds, a Berserker
sixth round, then Monarque himself in three bouts. Built on the existing React + Vite card engine; the combat rules,
Battle Mode and engine effect IDs are unchanged and sit behind a presentation layer.

## Run
```
npm install
npm run dev        # local game
npm run build      # production bundle
npm test           # data build, validators, legacy audit and all test suites (story flow, Berserker, trials, emotes ...)
```

## What is in the game
- **Story Mode**: 32 contenders (each with one power and three Steps: Resistance, Adaptation, Stability), seven encounters
  (Rounds 1-5 knockout, Round 6 Berserker, Final Monarque in 3 bouts). Soul is the resource every card is paid in; Gather Soul trades HP for Soul on a skipped round.
- **Battle Mode**: the original 2- and 4-player match, same rules, same numbers, same Soul vocabulary.
- **Contenders are fighters, not cards**: they have no Power, Rank or tier. Each fights with one signature power (three Steps) and the Bound Being cards in its deck; only Bound Beings carry Power and Rank.
- **Soul costs**: in Story Mode every Bound Being is invoked at its own Soul cost (`soulCost`, see `docs/SOUL_COSTS.md`); Battle Mode keeps the tier costs.
- **Power facts**: before a power or Edict is used, its sheet states the Soul cost, HP cost, duration, whether it can be countered, whether it is spent for the duel and whether it affects this round or later ones (`src/game/powerFacts.js`). The same six facts are shown in short form on each power button in hand, in the spotlight when anyone (including the foe) activates a power, and in the round log.
- **Balance**: `npm run sim:balance` runs the targeted simulations (seat, power ablation, round robin, POWER/RANK, Soul, HP sacrifice) and writes `docs/BALANCE_REPORT.md`; conclusions are in `docs/BALANCE_FINDINGS.md`.
- **Cards**: 60 Bound Beings, 8 Edicts, 8 Whims, 7 Omens (83 records in `src/data/cards.json`) and 32 contender powers.
- **Temperament AI**: Sovereign, Deceiver, Devourer and Ancient change real power-use decisions (`src/story/storyAI.js`).
- **Emoji replies**: send an emoji to a rival's bubble and it answers from what is actually happening (who won the last round, what it cost, who leads, who is cornered), in its own voice (`src/story/emoteReply.js`).
- **Monarque** speaks in four registers: contempt, unease (as you grow), hubris (Round 6) and fractured (final).
- **Narration**: the screenplay in `docs/STORY_SCREENPLAY.md` is played from `src/story/narration.js` by `Opening.jsx` (black-screen intro, the cell, Monarque's offer with an accept/refuse choice) and `Cutscene.jsx` (the Berserker reveal, the turning point, the final blow, the ending).
- **Berserker (Round 6)**: a sealed warrior from the tournament archive, picked at random from contenders you have never faced and whose power you do not hold (never someone you beat, and no rating bias toward the strongest). Monarque pours a third of his power into them: +50% HP, Soul and power effects (`BERSERKER` in `src/story/storyFlow.js`). You take only that exact power, and it keeps its +50% in the final bouts. Your own powers always come from you, never from Monarque.

## Data pipeline
`data-src/*.json` (supplied) -> `node scripts/build-monarque-data.mjs` -> `src/data/cards.json` + `src/data/monarque.generated.js`.
The 32 power rows live in `src/story/powers.js` (copied from `data-src/contender_powers_rows.js`; `P()` maps Monarque IDs and
`soul`/`oppSoul` onto the engine's internal effect IDs and rider fields). `ENGINE_EFFECT` in the build script is the single bridge.

## Terminology
Story Mode: Soul, Gather Soul, Power, Edict, Whim, Omen, Contender, Bound Being, Step I-III.
Both modes use Soul and Gather Soul; the old resource name appears nowhere a player can read it.
Engine effect IDs (e.g. `SENZU`, `FINAL_ATONEMENT`) are internal compatibility IDs and are never displayed.

## Art
No card, contender, Edict, Whim or Omen art ships; those use sigil/initial fallbacks. Supplied backdrops live in `public/ui/`.

See `docs/IMPLEMENTATION_NOTES.md` for architecture, verification and known limitations.

## Deploying to Netlify
`netlify.toml` already holds the build (`npm run build`), the publish folder (`dist`), Node 22, security headers (CSP, nosniff, frame and referrer policy, HSTS) and cache rules.
- Connect the repo, or run `npm install && npm run build` and drag the `dist` folder onto app.netlify.com.
- The Story dev panel and the `?debug` engine hook only exist on the dev server (`npm run dev`); `vite build` strips them, so verify production behaviour with `npm run build && npm run preview`.
- After the first deploy, open the browser console on the live site and confirm there are no Content-Security-Policy messages while you play a match with sound on.
- Do not add a catch-all `/* /index.html` redirect: a missing file must stay a real 404 so the audio and image fallbacks work.
- The soundtrack credit (menu and ending) is a licence requirement; keep it when you remove dev tools.

## Credits
Game by **dhamo ss** (main menu, ending and in-game footer). Music: "Unsolved Investigation" by isaiah658 (see docs/CREDITS.md).

## Copyright and asset protection
© 2026 dhamo ss. All rights reserved: see `LICENSE`. Third-party credits are in `docs/CREDITS.md`.
- `netlify/edge-functions/protect-assets.js` returns 403 when another website tries to embed the game's art or audio
  (hotlinking). Delete that file to turn it off. It runs once per asset request, so on Netlify's free plan watch the
  Edge Functions invocation quota.
- `X-Robots-Tag: noimageindex` and `public/robots.txt` keep the art out of search-engine image results.
- Nothing can stop a determined person from saving what their own browser downloads. The `LICENSE` is what lets you
  file a takedown (Netlify, GitHub, itch.io, Google) against copies.

### Invisible watermark
Every image under `public/` also carries a hidden, keyed watermark (`scripts/wmlib.py`), added by `scripts/watermark-images.py`.
- Check a suspect image: `python3 scripts/detect-watermark.py suspect.png`. It survives re-saving, WebP/JPEG recompression,
  screenshots and scaling down to roughly half size; it does NOT survive cropping, rotation or heavy editing.
- The secret key is `scripts/.wm-key` (git-ignored, never deployed). **Back it up privately.** Without it you cannot prove
  ownership, and anyone who gets it can find and strip the mark. Do not commit it or share it.
- Run the stamping script only on copies of your unstamped originals (it re-encodes images); stamped files are skipped.
