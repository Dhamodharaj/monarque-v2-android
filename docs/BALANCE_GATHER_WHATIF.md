# Gather Soul what-if sweep

Raw output of the tuning sweep: the source was copied, the Gather Soul numbers changed, and only the never/always policy tests were run (500 duels per policy, both seats, no powers). Each win rate is the forced side against the normal AI. Different seeds from the main report, so the base row differs by sampling noise (about 5 points).

```
== base (HP -5, Soul +4, cooldown 3)
never	500	48.0% (44%–52%)	gather/duel 0.00	HP given 0.0	duel 19.7 rounds
always	500	70.8% (67%–75%)	gather/duel 5.16	HP given 25.8	duel 21.1 rounds
== hp8 (HP -8, Soul +4, cooldown 3)
never	500	50.2% (46%–55%)	gather/duel 0.00	HP given 0.0	duel 19.6 rounds
always	500	61.8% (57%–66%)	gather/duel 4.91	HP given 39.2	duel 20.0 rounds
== hp10 (HP -10, Soul +4, cooldown 3)
never	500	51.6% (47%–56%)	gather/duel 0.00	HP given 0.0	duel 19.5 rounds
always	500	56.4% (52%–61%)	gather/duel 4.69	HP given 46.9	duel 19.3 rounds
== hp12 (HP -12, Soul +4, cooldown 3)
never	500	52.6% (48%–57%)	gather/duel 0.00	HP given 0.0	duel 19.5 rounds
always	500	51.2% (47%–56%)	gather/duel 4.49	HP given 53.9	duel 18.6 rounds
== cd5 (HP -5, Soul +4, cooldown 5)
never	500	48.8% (44%–53%)	gather/duel 0.00	HP given 0.0	duel 19.7 rounds
always	500	65.8% (62%–70%)	gather/duel 3.46	HP given 17.3	duel 20.3 rounds
== hp8cd5 (HP -8, Soul +4, cooldown 5)
never	500	50.4% (46%–55%)	gather/duel 0.00	HP given 0.0	duel 19.6 rounds
always	500	63.8% (59%–68%)	gather/duel 3.33	HP given 26.7	duel 19.4 rounds
== hp8ki3 (HP -8, Soul +3, cooldown 3)
never	500	52.6% (48%–57%)	gather/duel 0.00	HP given 0.0	duel 19.7 rounds
always	500	63.4% (59%–68%)	gather/duel 5.01	HP given 40.0	duel 20.4 rounds
```

Reproduce a variant: copy `src/` and `scripts/sim-balance.mjs`, edit `charge` in `src/config/gameConfig.js`, then `node scripts/sim-balance.mjs --only policy --policies never,always`.
