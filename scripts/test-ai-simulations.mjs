import fs from 'node:fs';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/game/GameEngine.js';
import { AIEngine } from '../src/game/AIEngine.js';
const registry=JSON.parse(fs.readFileSync(new URL('../src/data/cards.json',import.meta.url),'utf8'));
for(let seed=1;seed<=8;seed++){
 let n=seed;const random=()=>{n=(n*48271)%2147483647;return n/2147483647;};
 const engine=new GameEngine(registry,{random});engine.createMatch(4,['AI One','AI Two','AI Three','AI Four']);engine.state.players.forEach(p=>p.type='AI');engine.startMatch();const ai=new AIEngine(registry,random);let steps=0;
 while(engine.state.phase!=='MATCH_COMPLETE'&&steps++<2500){const state=engine.getState();const p=state.players.find(x=>x.id===state.currentPlayer);if(state.phase==='GM_DECREE'){engine.decreeAct(p.id,ai.chooseDecree(p,state,engine.decreeOptions(p.id)));continue;}if(state.phase==='CALLING_STAT'){
   const wild=ai.chooseWildcard(p,state);if(wild){const before=state.roundNumber;engine.useWildcard(p.id,wild.cardId,wild.options);if(engine.state.phase==='MATCH_COMPLETE'||engine.state.roundNumber!==before)continue;}
   const fresh=engine.getState();const current=fresh.players.find(x=>x.id===fresh.currentPlayer);engine.callStat(current.id,ai.chooseCall(current,fresh));
  }else if(state.phase==='PLAYING_CARD'){
   const card=ai.chooseCard(p,state);if(card)engine.playCard(p.id,card,ai.chooseBoost(p,card,state));else engine.passTurn(p.id);
  }else throw new Error(`Unexpected phase ${state.phase}`);
 }
 assert.equal(engine.state.phase,'MATCH_COMPLETE',`AI simulation ${seed} stalled`);assert.equal(engine.state.players.filter(p=>p.hp>0).length,1);console.log(`PASS seeded AI simulation ${seed}: ${engine.state.roundNumber} rounds`);
}
