// One AI action step. Everything is wrapped so an AI exception can never freeze the match:
// every failed choice degrades to a cheaper/safer legal action, ending with a pass.
export function takeAiTurn(engine, ai, playerId, hooks = {}) {
  const note = (type, extra) => { try { hooks.onAction?.(type, extra); } catch { /* ignore */ } };
  const get = () => engine.getView(playerId);
  const me = (st) => st.players.find(p => p.id === playerId);
  const safe = (fn, fallback) => { try { return fn(); } catch (err) { note('AI_FALLBACK', { message: err?.message }); return fallback; } };
  let live = get();
  if (live.currentPlayer !== playerId || live.phase === 'MATCH_COMPLETE') return;
  if (live.phase === 'GM_DECREE') {
    const opts = engine.decreeOptions(playerId);
    const choice = safe(() => ai.chooseDecree(me(live), live, opts), null);
    if (choice && safe(() => { engine.decreeAct(playerId, choice); return true; }, false)) { note('DECREE'); return; }
    engine.decreeAct(playerId, engine.defaultDecreeChoice(playerId)); note('DECREE'); return;
  }
  const startRound = live.roundNumber;
  const turnChanged = () => { const st = get(); return st.phase === 'MATCH_COMPLETE' || st.roundNumber !== startRound || st.currentPlayer !== playerId; };

  // Optional shop draw (one per round, any own turn).
  if (safe(() => ai.shouldDraw(me(live), live), false)) {
    safe(() => { engine.drawCard(playerId); note('DRAW'); }, null);
    live = get();
  }
  // Optional Wildcard (any own turn).
  const wild = safe(() => ai.chooseWildcard(me(live), live), null) ?? safe(() => hooks.pickWildcard?.(me(live), live) ?? null, null);
  if (wild) {
    let ok = false;
    for (const wid of [wild.cardId, ...(wild.alternates ?? [])]) { ok = safe(() => { engine.useWildcard(playerId, wid, wild.options ?? {}); return true; }, false); if (ok) break; }
    if (ok) { note('WILDCARD'); if (turnChanged()) return; live = get(); }
  }

  if (live.phase === 'CALLING_STAT') {
    const call = safe(() => hooks.pickWildcard?.pickCall?.(me(live), live) ?? null, null) ?? safe(() => ai.chooseCall(me(live), live), 'POWER');
    safe(() => engine.callStat(playerId, call), null);
    if (get().phase === 'CALLING_STAT') engine.callStat(playerId, 'POWER');
    note('CALL', { call });
    return;
  }
  if (live.phase !== 'PLAYING_CARD') return;
  const player = me(live);
  if (safe(() => ai.shouldCharge(player, live), false) && safe(() => { engine.chargeTurn(playerId); note('CHARGE'); return true; }, false)) return;
  let chosen = safe(() => ai.chooseCard(player, live), null);
  if (chosen && hooks.mistake && Math.random() < hooks.mistake) { // story difficulty ramp: an early opponent sometimes plays a worse legal card
    // A slip is the next-best play by the AI's own judgement (never a random card, which could be the exact opposite of what the round needs, e.g. in an inverted round).
    const alts = safe(() => ai.alternatives?.(player, live, chosen, 2), null) ?? [];
    for (const cid of alts) { if (safe(() => { engine.playCard(playerId, cid, {}); return true; }, false)) return; }
  }
  if (chosen) {
    const boost = safe(() => ai.chooseBoost(player, chosen, live, live.currentCall), { powerKi: 0, rankKi: 0 });
    if (safe(() => { engine.playCard(playerId, chosen, boost); return true; }, false)) return;
    if (safe(() => { engine.playCard(playerId, chosen, {}); return true; }, false)) return;
  }
  // Fallback: any card the engine accepts, cheapest first, then pass.
  const candidates = [...player.hand].filter(c => c.type !== 'WILDCARD').sort((a, b) => (a.power - b.power));
  for (const c of candidates) { if (safe(() => { engine.playCard(playerId, c.id, {}); return true; }, false)) return; }
  engine.passTurn(playerId);
}
