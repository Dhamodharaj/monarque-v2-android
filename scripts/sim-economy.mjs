// Balance telemetry: how fighters are eliminated, how often Ki hits 0, which tiers get played, event frequency, leader rotation.
import fs from 'node:fs';
import { GameEngine } from '../src/game/GameEngine.js';
import { AIEngine } from '../src/game/AIEngine.js';
import { takeAiTurn } from '../src/game/AITurn.js';
import { classifyCard } from '../src/game/CardTiers.js';
const cards=JSON.parse(fs.readFileSync(new URL('../src/data/cards.json',import.meta.url),'utf8'));
const chars=cards.filter(c=>c.type==='CHARACTER');
const N=Number(process.argv[2]||60),mode=Number(process.argv[3]||4);
const rng=(seed)=>()=>{seed=(seed+0x6D2B79F5)|0;let x=Math.imul(seed^(seed>>>15),1|seed);x=(x+Math.imul(x^(x>>>7),61|x))^x;return((x^(x>>>14))>>>0)/4294967296;};
const A={games:0,rounds:[],elim:{HP:0,LAST_STAND:0},kiZeroRoundStarts:0,roundStarts:0,tier:{WEAK:0,NORMAL:0,POWERFUL:0,OP:0},passes:0,gm:0,crazy:0,leaderBreaks:0,leaderChecks:0,stalls:0,fallbacks:0,winnerTier:{WEAK:0,NORMAL:0,POWERFUL:0,OP:0},rounds1stHp:[],minKiAvg:[]};
for(let g=1;g<=N;g++){
  const r=rng(g*104729);const e=new GameEngine(cards,{random:r});e.createMatch(mode);e.startMatch();
  const ais=e.state.players.map(()=>new AIEngine(cards,r));let guard=0,lastRound=0,prevLeader=null,prevRoundNo=0;
  while(e.state.phase!=='MATCH_COMPLETE'&&guard++<4000){
    const s=e.state;
    if(s.roundNumber!==lastRound&&s.phase==='CALLING_STAT'){
      lastRound=s.roundNumber;A.roundStarts++;if(s.players.some(p=>p.hp>0&&p.ki===0))A.kiZeroRoundStarts++;for(const p of s.players)if(p.hp>0){A.kiSum=(A.kiSum||0)+p.ki;A.kiN=(A.kiN||0)+1;if(p.ki<=3)A.kiLow=(A.kiLow||0)+1;}
      if(prevLeader){ // expected leader: next alive after previous leader in direction
        const n=s.players.length;let i=s.players.findIndex(p=>p.id===prevLeader);let exp=null;for(let k=0;k<n;k++){i=(i+s.direction+n)%n;if(s.players[i].hp>0){exp=s.players[i].id;break;}}
        A.leaderChecks++;if(exp!==s.currentPlayer)A.leaderBreaks++;
      }
      prevLeader=s.currentPlayer;
    }
    const id=s.currentPlayer;const idx=s.players.findIndex(p=>p.id===id);
    try{takeAiTurn(e,ais[idx],id,{onAction:(t)=>{if(t==='AI_FALLBACK')A.fallbacks++;}});}catch{A.stalls++;break;}
    const lr=e.state.lastRound;if(lr&&lr.round!==A._seen){A._seen=lr.round;for(const pl of lr.placements){if(pl.card.isPass){A.passes++;continue;}const t=classifyCard(pl.card,chars);A.tier[t]=(A.tier[t]||0)+1;if(pl.place===1)A.winnerTier[t]++;}}
  }
  if(e.state.phase!=='MATCH_COMPLETE'){A.stalls++;continue;}
  A.games++;A.rounds.push(e.state.roundNumber);A._seen=0;
  for(const ev of e.state.eventLog){if(ev.type==='ELIMINATION')A.elim[ev.reason]++;if(ev.type==='GM_POWER')A.gm++;if(ev.type==='CRAZY_ROUND')A.crazy++;}
}
const s=A.rounds.sort((a,b)=>a-b);const tot=Object.values(A.tier).reduce((a,b)=>a+b,0);
const pct=(o)=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,(100*v/Math.max(1,Object.values(o).reduce((a,b)=>a+b,0))).toFixed(0)+'%']));
console.log(JSON.stringify({games:A.games,medianRounds:s[Math.floor(s.length/2)],p10:s[Math.floor(s.length*.1)],p90:s[Math.floor(s.length*.9)],eliminations:A.elim,hpShare:(100*A.elim.HP/Math.max(1,A.elim.HP+A.elim.LAST_STAND)).toFixed(0)+'%',avgKi:(A.kiSum/A.kiN).toFixed(1),fightersAtKi3orLess:(100*A.kiLow/A.kiN).toFixed(0)+'%',roundsWithSomeoneAtKi0:(100*A.kiZeroRoundStarts/A.roundStarts).toFixed(0)+'%',playedTierShare:pct(A.tier),winnerTierShare:pct(A.winnerTier),passesPerGame:(A.passes/A.games).toFixed(1),gmPerGame:(A.gm/A.games).toFixed(1),crazyPerGame:(A.crazy/A.games).toFixed(1),leaderRotationBreaks:`${A.leaderBreaks}/${A.leaderChecks}`,stalls:A.stalls,fallbacks:A.fallbacks},null,1));
