import fs from 'node:fs';
import { GameEngine } from '../src/game/GameEngine.js';
import { AIEngine } from '../src/game/AIEngine.js';
import { takeAiTurn } from '../src/game/AITurn.js';
const cards=JSON.parse(fs.readFileSync(new URL('../src/data/cards.json',import.meta.url),'utf8'));
const N=Number(process.argv[2]||40);const mode=Number(process.argv[3]||4);
const rng=(seed)=>()=>{seed=(seed+0x6D2B79F5)|0;let x=Math.imul(seed^(seed>>>15),1|seed);x=(x+Math.imul(x^(x>>>7),61|x))^x;return((x^(x>>>14))>>>0)/4294967296;};
const agg={rounds:[],fallbacks:0,wild:{},curse:{},gm:{},crazy:{},winSeat:[0,0,0,0],stalls:0,draws:0,pass:0};
for(let g=1;g<=N;g++){
  const r=rng(g*7919);const e=new GameEngine(cards,{random:r});e.createMatch(mode);e.startMatch();
  const ais=e.state.players.map(()=>new AIEngine(cards,r));let guard=0;
  while(e.state.phase!=='MATCH_COMPLETE'&&guard++<4000){
    const id=e.state.currentPlayer;const idx=e.state.players.findIndex(p=>p.id===id);
    try{takeAiTurn(e,ais[idx],id,{onAction:(t,x)=>{if(t==='AI_FALLBACK'){agg.fallbacks++;agg.msgs=agg.msgs||{};agg.msgs[x?.message]=(agg.msgs[x?.message]||0)+1;}if(t==='DRAW')agg.draws++;}});}catch(err){agg.stalls++;console.log('STALL',g,err.message);break;}
  }
  if(e.state.phase!=='MATCH_COMPLETE'){agg.stalls++;continue;}
  agg.rounds.push(e.state.roundNumber);agg.winSeat[e.state.players.findIndex(p=>p.id===e.state.winner)]++;
  for(const ev of e.state.eventLog){
    if(ev.type==='WILDCARD_USED')agg.wild[ev.effectId]=(agg.wild[ev.effectId]||0)+1;
    if(ev.type==='CURSE_OUTCOME')agg.curse[ev.outcome]=(agg.curse[ev.outcome]||0)+1;
    if(ev.type==='GM_POWER')agg.gm[ev.effectId]=(agg.gm[ev.effectId]||0)+1;
    if(ev.type==='CRAZY_ROUND')agg.crazy[ev.effectId]=(agg.crazy[ev.effectId]||0)+1;
  }
}
const s=[...agg.rounds].sort((a,b)=>a-b);const q=p=>s[Math.floor(p*(s.length-1))];
console.log(JSON.stringify({games:agg.rounds.length,median:q(.5),p10:q(.1),p90:q(.9),max:s.at(-1),mean:(s.reduce((a,b)=>a+b,0)/s.length).toFixed(1),stalls:agg.stalls,aiFallbacks:agg.fallbacks,msgs:agg.msgs,draws:agg.draws,winSeat:agg.winSeat,wild:agg.wild,curse:agg.curse,gm:agg.gm,crazy:agg.crazy},null,1));
