# Soul Costs of the 60 Bound Beings

Story Mode charges each bound being its own **Soul cost** (`soulCost` in `data-src/bound_being_cards_60.json`). Battle Mode is unchanged and keeps the tier costs (Elusive 0, Normal 1, Powerful 3, OP 5).

## How it works

- `getCardCost` (`src/game/CardTiers.js`) returns the tier cost unless the card is marked `costMode: 'SOUL'`. The Story Mode engine marks every card it deals, so the engine, the AI and every cost badge in the UI agree.
- A being with no valid `soulCost` falls back to its tier cost. Last Stand cards (Elusive, or a Normal being bound as a Last Stand) always cost 0, because they are only playable at 0 Soul.
- Tier still drives cooldowns, boost budgets, the Binding Seal's price and the Last Stand rule. Only the Soul paid to invoke a card changed.
- `scripts/validate-cards.mjs` requires a non-negative integer inside the tier band below. `scripts/test-soul-costs.mjs` checks the engine actually charges it.

## Bands and rubric

| Tier | Band | Average |
|---|---|---|
| OP | 4–6 | 5.00 (Battle Mode tier cost 5) |
| Powerful | 2–4 | 3.00 (Battle Mode tier cost 3) |
| Normal | 1–2 | 1.28 (Battle Mode tier cost 1) |
| Elusive (Last Stand) | 0 | 0.00 (Battle Mode tier cost 0) |

Each tier starts from its Battle Mode cost. A being is moved up when its nature is hard to channel (unstable, fractured, devouring, curse- or plague-bearing, or it bends something fundamental) and down when it is cooperative, bound to a single duty or simple in nature (spec section 5.2: Power, Nature, Stability, Complexity). Averages per tier stay close to the old tier cost so the Soul economy is not shifted. These are first-pass balancing values: edit the JSON, run `npm test`.

## Values

### OP

| Cost | Beings |
|---:|---|
| 6 | Satan, Abaddon |
| 4 | Leviathan, Jörmungandr |

### Powerful

| Cost | Beings |
|---:|---|
| 4 | Yamata no Orochi, The Wendigo, Ophanim, Legion |
| 3 | Hannya, The Dullahan, Medusa, Gashadokuro, Rakshasa, Kraken, Nidhogg, Echidna, Charybdis |
| 2 | Wanyūdō, Talos, Umibōzu, Minotaur |

### Normal

| Cost | Beings |
|---:|---|
| 2 | The Grin, Ankou, Vetala, The Plague Doctor, The Sluagh, Lamashtu, Rougarou, Nuckelavee, Asag |
| 1 | Jorōgumo, Yuki-onna, Rusalka, Asanbosam, Kuntilanak, Valravn, The Draugr, Tikbalang, The Golem, El Silbón, Dearg-due, Krasue, Bake-kujira, The Aswang, Manananggal, Mapinguari, Pishacha, Boitatá, Cerberus, Scylla, Black Annis, The Tsuchigumo, Strigoi Mort |

### Elusive (Last Stand)

| Cost | Beings |
|---:|---|
| 0 | The Jiangshi, The Rake, Okiku the Doll, Mikoshi-nyūdō, Jenny Greenteeth, Nachzehrer, Nasnas |
