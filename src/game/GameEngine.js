import { Player } from './Player.js';
import { Trick } from './Trick.js';
import { GAME_CONFIG } from '../config/gameConfig.js';
import { classifyCard, getCardCost } from './CardTiers.js';
import { WILDCARD_CARDS, CRAZY_ROUNDS, GM_POWERS } from './SpecialCards.js';
import { CALLS, TOTAL, DIRECTIONS, PHASES, MODES, compareCards, statScore, getNextPlayerIndex } from './Rules.js';
import { dealOpeningHands } from './Dealer.js';
import { twistOf } from './twists.js';
import { DRAMA } from './drama.js';

// Survival-first Ki Clash engine. The UI is a view of this state; UI timing never resolves rules.
export class GameEngine {
  constructor(cards, options = {}) {
    this.cards = [...cards].filter(c => !c.type || c.type === 'CHARACTER'); this.wildcards = (cards.filter(c => c.type === 'WILDCARD').length ? cards.filter(c => c.type === 'WILDCARD') : WILDCARD_CARDS).map(c => ({...c})); this.random = options.random ?? Math.random; this.story = options.story ?? null; this.twist = twistOf(options.twist); this.drama = Boolean(options.drama); this.registry = cards; this.eventSeq = 0; if(this.story)this.cards=this.cards.map(c=>({...c,costMode:'SOUL'})); // Story Mode: each bound being is invoked at its own Soul cost
    this.state = { matchId:null, mode:null, players:[], reserveDeck:[], currentPlayer:null, direction:1, currentCall:null, currentTrick:null, phase:PHASES.LOBBY, winner:null, turnNumber:0, roundNumber:0, publicHistory:[], domainInversionRounds:0, events:[] };
  }
  createMatch(mode, playerNames=[]) {
    if (![2,4].includes(mode)) throw new Error(`Unsupported mode: ${mode}`);
    const names = playerNames.length===mode ? playerNames : ['Player',...Array.from({length:mode-1},(_,i)=>`System ${i+1}`)];
    this.state={matchId:`match-${Date.now()}-${Math.floor(this.random()*1e9)}`,mode,players:names.map((name,index)=>new Player({id:`player-${index+1}`,name,type:index===0?'HUMAN':'AI',initialCoins:2,initialHp:100,initialKi:GAME_CONFIG.survival.startingKi})),reserveDeck:[],currentPlayer:null,direction:this.random()<.5?DIRECTIONS.CLOCKWISE:DIRECTIONS.COUNTER_CLOCKWISE,currentCall:null,currentTrick:null,phase:PHASES.MODE_SELECTED,winner:null,turnNumber:0,roundNumber:0,publicHistory:[],domainInversionRounds:0,events:[],eventLog:[],drawnThisRound:[],scheduledGm:null,lastRound:null,activeEffects:{},wildcardUsedThisRound:[],wildcardLockout:false,solarFlareLeader:null,finalAtonement:false,shenronUsed:false,curse:{ownerId:null,severity:0,attemptsInCycle:0,lockedUntilRound:0,destroyed:false,reserveDraws:0},sealedCards:{},banishedCards:[],gmInterventions:0,crazyRoundsPlayed:0,lastEventType:null,previousEventType:null,entertainment:50,decree:null,gmHistory:[],crazyHistory:[],roundsSinceEvent:0,roundDamage:[],revealedScouter:{},noApexBlocked:{},roundWildcards:[],placementHistory:[],stagnantRounds:0,hpSnapshot:{}};
    return this.getState();
  }
  startMatch(){
    this.#assertPhase(PHASES.MODE_SELECTED); this.state.phase=PHASES.DEALING;
    const dealt=dealOpeningHands({characters:this.cards.map(c=>({...c,type:'CHARACTER'})),wildcards:this.story?[]:this.wildcards.map(c=>({...c})),playerCount:this.state.players.length,random:this.random,tierOf:c=>this.#cardTier(c)});
    this.state.players.forEach((pl,i)=>{pl.hand=dealt.hands[i];pl.lastStandTotal=pl.hand.filter(c=>c.lastStand).length;if(this.story){for(const pc of (this.story.powers?.[pl.id]??[]))pl.hand.push({...pc});const st=this.story.start?.[pl.id];if(st){if(st.hp)pl.hp=st.hp;if(st.ki!=null)pl.ki=st.ki;if(st.maxHp)pl.maxHp=st.maxHp;if(st.maxKi)pl.maxKi=st.maxKi;}}});if(this.story){const ch=this.state.players.find(pl=>pl.hand.some(c=>c.effectId==='CURSE'));if(ch)this.state.curse.ownerId=ch.id;}this.state.reserveDeck=dealt.reserve;this.state.curse.ownerId=dealt.curseHolderIndex>=0?this.state.players[dealt.curseHolderIndex].id:null;
    this.state.currentPlayer=this.state.players[Math.floor(this.random()*this.state.players.length)].id;this.state.hpSnapshot=Object.fromEntries(this.state.players.map(p=>[p.id,p.hp]));
    this.state.twist=this.twist?.id??null;this.state.drama=this.drama;if(this.twist)this.state.events.push(`Match twist: ${this.twist.name}. ${this.twist.blurb}`); this.state.phase=PHASES.MATCH_READY; this.#beginRound(); return this.getState();
  }
  callStat(playerId,call){this.#assertCurrentPlayer(playerId);this.#assertPhase(PHASES.CALLING_STAT);if(!Object.values(CALLS).includes(call))throw new Error(`Invalid call: ${call}`);const eff=this.state.activeEffects.totalMight?TOTAL:call;this.state.currentCall=eff;this.state.currentTrick=new Trick(playerId,eff,this.state.players.filter(p=>p.hp>0).map(p=>p.id)); this.state.currentTrick.boosts={};this.state.phase=PHASES.PLAYING_CARD;return this.getState();}
  playCard(playerId,cardId,boost={}){
    this.#assertCurrentPlayer(playerId);this.#assertPhase(PHASES.PLAYING_CARD);const p=this.#getPlayer(playerId);if(p.hp<=0)throw new Error('Eliminated players cannot act.');
    let legal=p.hand.filter(c=>this.#isPlayable(p,c));
    if(this.state.solarFlareLeader&&this.state.solarFlareLeader!==playerId){if((Number(boost.powerKi)||0)+(Number(boost.rankKi)||0)>0){const boostedLegal=legal.filter(c=>{try{this.#validateBoost(c,boost,p.ki-this.#effectiveCardCost(c));return true;}catch{return false;}});if(!boostedLegal.length)throw new Error('No legal blind card can support that boost. Reset boosts and try again.');legal=boostedLegal;}cardId=legal.length?legal[Math.floor(this.random()*legal.length)].id:null;}
    if(!cardId || !p.hand.some(c=>c.id===cardId) || p.hand.find(c=>c.id===cardId)?.type==='WILDCARD' || this.state.sealedCards[cardId] || !p.canPlayCard(cardId,this.state.roundNumber) || this.#effectiveCardCost(p.hand.find(c=>c.id===cardId))>p.ki || this.#isBlockedByCrazy(p,p.hand.find(c=>c.id===cardId)) || (p.hand.find(c=>c.id===cardId)?.lastStand&&p.ki>0)){if(legal.length)throw new Error('That card is unavailable or costs more Ki than you have.');return this.passTurn(playerId);}
    const card=p.hand.find(c=>c.id===cardId);const cost=this.#effectiveCardCost(card);
    const buff=this.#validateBoost(card,boost,p.ki-cost); p.ki=Math.max(0,p.ki-cost-buff.cost); let basePower=card.power,baseRank=card.rank;const wish=this.state.activeEffects.absolutePower;if(wish&&wish.playerId===playerId&&wish.round===this.state.roundNumber){if(wish.stat==='POWER')basePower=Math.min(999,basePower*2);else baseRank=Math.max(1,Math.floor(baseRank/2));} let zPow=0,zRank=0;if(this.state.activeEffects.zenkai||this.state.activeEffects.ZENKAI){const alive=this.state.players.filter(x=>x.hp>0).sort((a,b)=>a.hp-b.hp);if(alive.length>1&&alive[0].id===playerId&&alive[0].hp<alive[1].hp){zPow=100;zRank=8;}}const nbP=p.nextBonus?.power??0,nbR=p.nextBonus?.rank??0;if(p.nextBonus)p.nextBonus=null;const played={...card,zenkai:zPow>0,power:Math.min(999,basePower+buff.power+zPow+nbP),rank:Math.max(1,baseRank-buff.rank-zRank-nbR),basePower:card.power,baseRank:card.rank,boostKi:buff.cost,boostPower:buff.power,boostRank:buff.rank};
    p.hand=p.hand.filter(c=>c.id!==cardId);p.lastPlayedCardId=cardId;this.state.currentTrick.addPlay(playerId,played);this.state.currentTrick.boosts[playerId]=buff;
    if(this.state.currentTrick.size<this.#requiredPlays(this.state.currentTrick)){this.state.currentPlayer=this.#nextTrickPlayerId(playerId,this.state.currentTrick);return this.getState();}
    this.state.phase=PHASES.RESOLVING_TRICK;this.#resolveRound();return this.getState();
  }
  chargeTurn(playerId){return this.passTurn(playerId,{charge:true});}
  hasLegalMove(playerId){const p=this.state.players.find(x=>x.id===playerId);return Boolean(p&&p.hand.some(c=>this.#isPlayable(p,c)));}
  /** Gather Soul: responders any time the rules allow; a round leader only when no card is playable (so a stuck leader is never dead-ended). */
  canCharge(playerId){const s=this.state,p=s.players.find(x=>x.id===playerId),c=GAME_CONFIG.charge;if(!p||s.currentPlayer!==playerId||p.hp<=c.minHp||(s.roundNumber-(p.lastChargeRound??-99))<c.cooldownRounds||s.solarFlareLeader)return false;const responder=s.phase===PHASES.PLAYING_CARD&&s.currentTrick&&s.currentTrick.leaderId!==playerId;const stuckLeader=s.phase===PHASES.CALLING_STAT&&!this.hasLegalMove(playerId);return Boolean(responder||stuckLeader);}
  passTurn(playerId,opts={}){this.#assertCurrentPlayer(playerId);const charge=Boolean(opts.charge);if(charge&&!this.canCharge(playerId))throw new Error(`Charge is unavailable: only responders with more than ${GAME_CONFIG.charge.minHp} HP, once every ${GAME_CONFIG.charge.cooldownRounds} rounds.`);if(this.state.phase===PHASES.CALLING_STAT){const lp=this.#getPlayer(playerId);if(lp.hand.some(c=>this.#isPlayable(lp,c)))throw new Error(charge?'A leader can only gather Soul when no card is playable.':'Passing is only allowed when no legal affordable character card is available.');this.callStat(playerId,CALLS.POWER);}this.#assertPhase(PHASES.PLAYING_CARD);const p=this.#getPlayer(playerId);const legal=p.hand.filter(c=>this.#isPlayable(p,c));if(!charge&&legal.length)throw new Error('Passing is only allowed when no legal affordable character card is available.');const hpLoss=charge?GAME_CONFIG.charge.hp:GAME_CONFIG.passHpLoss,kiGain=charge?GAME_CONFIG.charge.ki:1;if(!this.#isImmune(playerId))p.hp=Math.max(0,p.hp-hpLoss);p.ki=Math.min(p.maxKi??20,p.ki+kiGain);if(charge){p.lastChargeRound=this.state.roundNumber;this.state.events.push(`${p.name} charged Ki instead of fighting.`);this.#emit('CHARGE',{playerId,hp:hpLoss,ki:kiGain});}this.state.currentTrick.addPlay(playerId,{id:`pass-${playerId}-${this.state.roundNumber}`,character:charge?'Charging Ki':'No legal move',form:charge?'Charge':'Pass',title:charge?'Voluntary Ki charge':'Ki recovery pass',power:-1,rank:999,isPass:true,charge,hpLoss,kiGain,image:''});this.#checkEliminations({weak:false});{const alive=this.state.players.filter(x=>x.hp>0);if(alive.length<=1){this.state.winner=alive[0]?.id??null;this.state.currentTrick=null;this.state.currentCall=null;this.state.phase=PHASES.MATCH_COMPLETE;return this.getState();}}if(this.state.currentTrick.size<this.#requiredPlays(this.state.currentTrick)){this.state.currentPlayer=this.#nextTrickPlayerId(playerId,this.state.currentTrick);return this.getState();}this.state.phase=PHASES.RESOLVING_TRICK;this.#resolveRound();return this.getState();}
  drawCard(playerId){this.#assertCurrentPlayer(playerId);if(this.state.phase!==PHASES.CALLING_STAT&&this.state.phase!==PHASES.PLAYING_CARD)throw new Error(`Action unavailable during phase ${this.state.phase}.`);if(this.state.drawnThisRound.includes(playerId))throw new Error('You can buy only one card per round.');const p=this.#getPlayer(playerId);if(!this.state.reserveDeck.length)throw new Error('Reserve is empty.');if(p.drawsUsed>=GAME_CONFIG.draw.maxDrawsPerPlayerPerMatch)throw new Error('Draw limit reached.');if(p.coins<3)throw new Error('You need 3 coins to draw.');if(p.hand.length>=18)throw new Error('Your hand is full.');if(p.hand.filter(c=>c.type==='WILDCARD').length>=3)throw new Error('Drawing is disabled while you hold three Wildcards.');const eligible=this.state.reserveDeck.filter(c=>p.hand.length<18&&(c.type!=='WILDCARD'||p.hand.filter(x=>x.type==='WILDCARD').length<3)); if(!eligible.length)throw new Error('No eligible cards remain to draw.'); const wildcardCount=eligible.filter(c=>c.type==='WILDCARD').length; const characterCount=eligible.length-wildcardCount; let wantWildcard=wildcardCount>0&&(characterCount===0||this.random()<0.30); let candidates=eligible.filter(c=>(c.type==='WILDCARD')===wantWildcard);if(!candidates.length)candidates=eligible;let card=candidates[Math.floor(this.random()*candidates.length)];const curseIndex=this.state.reserveDeck.findIndex(c=>c.effectId==='CURSE');if(!this.state.curse.ownerId&&!this.state.curse.destroyed&&curseIndex>=0){this.state.curse.reserveDraws=(this.state.curse.reserveDraws??0)+1;if(this.state.curse.reserveDraws>=5)card=this.state.reserveDeck[curseIndex];}const idx=this.state.reserveDeck.findIndex(c=>c.id===card.id);this.state.reserveDeck.splice(idx,1);p.coins-=3;p.drawsUsed++;this.state.drawnThisRound.push(playerId);this.#emit('DRAW',{playerId,wildcard:card.type==='WILDCARD'}); if(card.effectId==='SHENRON_WISH'&&this.state.shenronUsed){p.ki=Math.min(p.maxKi??20,p.ki+2);return {...card,banished:true};}p.hand.push({...card});if(card.effectId==='CURSE')this.state.curse.ownerId=p.id;if(card.type!=='WILDCARD')p.lockCardUntil(card.id,this.state.roundNumber+1);return card;}
  getState(){return structuredClone({...this.state,players:this.state.players.map(p=>({...p,lockedCardIds:Object.keys(p.lockedUntilTurn).filter(id=>p.lockedUntilTurn[id]>this.state.roundNumber),hand:p.hand,capturedCards:p.capturedCards}))});}
  /**
   * Per-viewer projection of the state. Hidden information is removed:
   * opponent hands/Ki, reserve order, the leader's call (until Public Forecast or match end),
   * unrevealed card stats on the table, other players' Scouter data and No-Apex lists.
   * The UI and the AI consume this instead of the raw state.
   */
  getView(viewerId){
    const s=this.getState();
    const over=s.phase==='MATCH_COMPLETE';
    const forecast=Boolean(s.activeEffects?.publicForecast||s.activeEffects?.PUBLIC_FORECAST);
    s.players=s.players.map(p=>({...p,lastStandLeft:p.hand.filter(c=>c.lastStand).length+((s.currentTrick?.plays??[]).filter(pl=>pl.playerId===p.id&&pl.card.lastStand).length)}));
    s.players=s.players.map(p=>{
      if(p.id===viewerId||over)return p;
      return {...p,ki:null,hand:p.hand.map((c,i)=>({id:`hidden-${p.id}-${i}`,type:'HIDDEN',hidden:true}))};
    });
    s.reserveDeck=s.reserveDeck.map((c,i)=>({id:`reserve-${i}`,type:'HIDDEN',hidden:true}));
    const leaderId=s.currentTrick?.leaderId;
    const knowsCall=over||forecast||leaderId===viewerId||Boolean(s.activeEffects?.totalMight);
    if(!knowsCall){s.currentCall=null;if(s.currentTrick)s.currentTrick.call=null;}
    if(s.currentTrick&&!over&&!forecast){
      s.currentTrick.plays=s.currentTrick.plays.map(pl=>{if(pl.playerId===viewerId||pl.card.isPass)return pl;const {power,rank,basePower,baseRank,boostKi,boostPower,boostRank,...rest}=pl.card;return {...pl,card:rest};});
      s.currentTrick.boosts=s.currentTrick.boosts?.[viewerId]?{[viewerId]:s.currentTrick.boosts[viewerId]}:{};
    }
    s.revealedScouter=s.revealedScouter?.[viewerId]?{[viewerId]:s.revealedScouter[viewerId]}:{};
    s.noApexBlocked=s.noApexBlocked?.[viewerId]?{[viewerId]:s.noApexBlocked[viewerId]}:{};
    if(s.decree?.bids)s.decree.bids=s.decree.bids[viewerId]!=null?{[viewerId]:s.decree.bids[viewerId]}:{};
    s.viewerId=viewerId;
    return s;
  }
  #statScore(card,call){return statScore(card,call);}
  #nextLeaderAfter(fromId){const ps=this.state.players;let next=ps.findIndex(p=>p.id===fromId);for(let i=0;i<ps.length;i++){next=(next+this.state.direction+ps.length)%ps.length;if(ps[next].hp>0)break;}return ps[next].id;}
  #resolveRound(){
    const s=this.state,trick=s.currentTrick,inverted=s.domainInversionRounds>0,call=trick.call,fx=s.activeEffects,EV=GAME_CONFIG.events;
    const score=play=>{const v=this.#statScore(play.card,call);return inverted?-v:v;};
    const ordered=[...trick.plays].sort((a,b)=>score(b)-score(a));
    const rankedOrder=ordered.filter(x=>!x.card.isPass),passPlays=ordered.filter(x=>x.card.isPass),rankedCount=rankedOrder.length;
    const placement=[...rankedOrder.map((play,i)=>({...play,place:i+1})),...passPlays.map(play=>({...play,place:rankedCount+1}))];
    const table=this.#placementTable(rankedCount),arena=this.#arenaMultiplier();
    const before=Object.fromEntries(s.players.map(pl=>[pl.id,{hp:pl.hp,ki:pl.ki,coins:pl.coins}]));
    const lossMult=arena*(this.story?.pace??1)*(fx.highStakes?EV.highStakes.lossMult:1)*(fx.timeChamber?EV.timeChamber.lossMult:1)*(this.twist?.lossMult??1)*(s.reckoning?DRAMA.reckoningMult:1),gainMult=fx.highStakes?EV.highStakes.gainMult:1;
    s.publicHistory.push(...trick.plays.map(play=>({playerId:play.playerId,card:play.card})));s.publicHistory=s.publicHistory.slice(-16);
    const bountyRow=fx.bounty?placement.find(x=>x.playerId===fx.bounty.targetId&&!x.card.isPass):null;
    const shielded=[];
    for(const result of placement){
      const p=this.#getPlayer(result.playerId);if(result.card.isPass)continue;
      const changes={...(table[result.place-1]??table.at(-1))};
      if(changes.hp<0)changes.hp=Math.max(GAME_CONFIG.maxRoundHpLoss,Math.round(changes.hp*lossMult));else changes.hp=Math.round(changes.hp*gainMult);
      if(this.twist?.kiGainMul&&changes.ki>0)changes.ki=Math.floor(changes.ki*this.twist.kiGainMul);
      if(this.drama&&changes.hp<0&&p.breathShield===s.roundNumber)changes.hp=Math.ceil(changes.hp*DRAMA.breathCut);
      if(result.card.lastStand&&GAME_CONFIG.lastStand.shield&&changes.hp<0){changes.hp=0;shielded.push(p.id);}
      const immune=this.#isImmune(p.id);
      p.hp=Math.max(0,Math.min(p.maxHp??100,p.hp+(immune&&changes.hp<0?0:changes.hp)));p.ki=Math.max(0,Math.min(p.maxKi??20,p.ki+changes.ki));p.coins=Math.max(0,p.coins+changes.coins);
      if(result.place===1)p.roundsWon++;
      if(bountyRow&&p.id!==bountyRow.playerId){if(result.place<bountyRow.place){p.hp=Math.min(p.maxHp??100,p.hp+EV.bounty.hp);p.ki=Math.min(p.maxKi??20,p.ki+EV.bounty.ki);}}
      const tier=this.#cardTier(result.card),cd=GAME_CONFIG.cooldowns,cooldown=(result.place<=2?cd.top:cd.bottom)+(cd.tierExtra[tier]??0)+(this.twist?.cooldownAdd??0);
      if(result.card.lastStand){
        p.ki=Math.min(p.maxKi??20,p.ki+GAME_CONFIG.lastStand.kiBonus);
        s.banishedCards.push({...this.#baseCard(result.card),lastStand:true,ownerId:p.id,reason:'last-stand',round:s.roundNumber});
        s.events.push(`${p.name} made a Last Stand (${result.card.character}).`);
        this.#emit('LAST_STAND',{playerId:p.id,shielded:shielded.includes(p.id),ki:GAME_CONFIG.lastStand.kiBonus,card:{id:result.card.id,character:result.card.character,image:result.card.image}});
      }else{p.hand.push(this.#baseCard(result.card));p.lockCardUntil(result.card.id,s.roundNumber+cooldown+1);}
    }
    {const w=rankedOrder.length>=3&&!inverted?placement[0]:null;
      if(w&&!w.card.isPass){const TI={WEAK:0,NORMAL:1,POWERFUL:2,OP:3},GS=GAME_CONFIG.giantSlayer,wt=TI[this.#cardTier(w.card)]??1;
        const foe=placement.filter(x=>x.playerId!==w.playerId&&!x.card.isPass).map(x=>({x,t:TI[this.#cardTier(x.card)]??1})).sort((a,b)=>b.t-a.t)[0];
        if(foe&&foe.t-wt>=GS.gapTiers){const gp=this.#getPlayer(w.playerId);gp.hp=Math.min(gp.maxHp??100,gp.hp+GS.hp);gp.ki=Math.min(gp.maxKi??20,gp.ki+GS.ki);s.events.push(`${gp.name} slays a giant: ${w.card.character} beat ${foe.x.card.character}!`);
          this.#emit('GIANT_SLAYER',{playerId:gp.id,hp:GS.hp,ki:GS.ki,card:{id:w.card.id,character:w.card.character,image:w.card.image},victim:{playerId:foe.x.playerId,character:foe.x.card.character}});}}}
    if(bountyRow){const last=placement.filter(x=>!x.card.isPass).at(-1);if(last&&last.playerId===bountyRow.playerId&&rankedCount>=3&&!this.#isImmune(last.playerId)){const t=this.#getPlayer(last.playerId);t.hp=Math.max(0,t.hp-EV.bounty.lastPenalty);}this.#emit('BOUNTY_RESULT',{targetId:fx.bounty.targetId,place:bountyRow.place,ranked:rankedCount,beaten:placement.filter(x=>!x.card.isPass&&x.place<bountyRow.place).map(x=>x.playerId)});}
    const questDone=this.#resolveSideQuest(placement,before,call);
    const curseBefore=s.curse.ownerId;this.#resolveCurse(placement,call,inverted);this.#updateEntertainment(placement);
    this.#lastBreath();
    const deltas=Object.fromEntries(s.players.map(pl=>[pl.id,{hp:pl.hp-before[pl.id].hp,ki:pl.ki-before[pl.id].ki,coins:pl.coins-before[pl.id].coins}]));
    const mafubaRound=Boolean(s.mafubaUserId),leader=this.#getPlayer(trick.leaderId),wishActive=Boolean(fx.wishRound),winnerId=placement[0]?.card?.isPass?null:placement[0]?.playerId??null;
    s.domainInversionRounds=Math.max(0,s.domainInversionRounds-1);this.#decrementEffects();
    s.lastRound={round:s.roundNumber,call,inverted,arena,mafuba:mafubaRound,deltas,curseOwnerBefore:curseBefore,curseOwnerAfter:s.curse.ownerId,shielded,questDone,banished:s.banishedCards.filter(b=>b.round===s.roundNumber).map(b=>b.id),placements:placement.map(x=>({playerId:x.playerId,card:x.card,place:x.place,score:score(x)}))};
    this.#emit('ROUND_RESULT',{winnerId:placement[0]?.playerId??null,call,inverted});
    s.placementHistory.push({round:s.roundNumber,placements:placement.map(x=>({playerId:x.playerId,place:x.place})),hp:Object.fromEntries(s.players.map(p=>[p.id,p.hp]))});s.placementHistory=s.placementHistory.slice(-8);
    this.#checkEliminations({weak:true});this.#dropDeadCurse();
    const alive=s.players.filter(p=>p.hp>0);
    if(alive.length<=1){s.winner=alive[0]?.id??null;s.currentTrick=null;s.currentCall=null;s.phase=PHASES.MATCH_COMPLETE;return;}
    const nextLeader=this.#nextLeaderAfter(leader.id);
    s.currentTrick=null;s.currentCall=null;s.mafubaUserId=null;s.mafubaTargetPlayerId=null;
    const winner=winnerId&&this.#getPlayer(winnerId);
    if(wishActive&&winner&&winner.hp>0){
      const lastRow=[...placement].filter(x=>!x.card.isPass).at(-1),victim=lastRow&&lastRow.playerId!==winnerId&&this.#getPlayer(lastRow.playerId).hp>0?lastRow.playerId:null;
      this.#startDecree({kind:'WISH',effectId:'WISH_ROUND',order:[winnerId],victimId:victim&&this.#stealable(this.#getPlayer(victim)).length?victim:null,then:{leaderId:nextLeader}});return;
    }
    s.currentPlayer=nextLeader;this.#beginRound();
  }
  #dropDeadCurse(){const s=this.state;if(s.curse.ownerId&&this.#getPlayer(s.curse.ownerId).hp<=0){const dead=this.#getPlayer(s.curse.ownerId);dead.hand=dead.hand.filter(c=>c.effectId!=='CURSE');if(!s.curse.destroyed&&!s.reserveDeck.some(c=>c.effectId==='CURSE'))s.reserveDeck.push({...this.wildcards.find(c=>c.effectId==='CURSE')});s.curse.ownerId=null;s.curse.attemptedThisRound=false;}}
  #stealable(p){const s=this.state;return p.hand.filter(c=>c.type!=='WILDCARD'&&!c.lastStand&&!s.sealedCards[c.id]&&(p.lockedUntilTurn[c.id]??0)<=s.roundNumber);}
  #resolveSideQuest(placement,before,call){
    const s=this.state,q=s.activeEffects.sideQuest;if(!q)return null;
    const top=placement[0];if(!top||top.card.isPass)return null;
    const winner=this.#getPlayer(top.playerId);let ok=false;
    if(q.type==='WIN_CALL')ok=call===q.call;
    else if(q.type==='WIN_CHEAP')ok=this.#cardCost(top.card)<=1;
    else if(q.type==='WIN_BOOSTED')ok=(top.card.boostKi??0)>0;
    else if(q.type==='UPSET'){const alive=Object.entries(before).filter(([id])=>this.#getPlayer(id).hp>0);const minHp=Math.min(...alive.map(([,v])=>v.hp));ok=before[winner.id].hp<=minHp&&alive.length>1;}
    if(!ok)return null;
    const R=GAME_CONFIG.events.sideQuest;winner.hp=Math.min(winner.maxHp??100,winner.hp+R.hp);winner.ki=Math.min(winner.maxKi??20,winner.ki+R.ki);
    s.events.push(`${winner.name} completed the Side Quest.`);this.#emit('SIDE_QUEST_DONE',{playerId:winner.id,quest:q.type,hp:R.hp,ki:R.ki});
    return {playerId:winner.id,hp:R.hp,ki:R.ki};
  }
  getWildcardCards(playerId){return this.#getPlayer(playerId).hand.filter(c=>c.type==='WILDCARD').map(c=>{const reason=this.#wildcardBlock(playerId,c.effectId,c);return {...c,usable:reason==='',reason};});}
  useWildcard(playerId,cardId,options={}){
    this.#assertCurrentPlayer(playerId);if(this.state.phase==='MATCH_COMPLETE'||this.state.finalAtonement)throw new Error('The round or match has ended.');
    const p=this.#getPlayer(playerId),card=p.hand.find(c=>c.id===cardId&&c.type==='WILDCARD');if(!card)throw new Error('That Wildcard is not in your hand.');{const why=this.#wildcardBlock(playerId,card.effectId,card);if(why)throw new Error(why);}
    if(card.monarqueKind){ // one of Monarque's Whims / Omens, played from his hand like a Wildcard
      if(card.monarqueKind==='WHIM'){this.gmIntervene(card.effectId,{});}
      else{const n=this.state.crazyRoundsPlayed;this.startCrazyRound(card.effectId,{force:true});if(this.state.crazyRoundsPlayed===n)throw new Error('That omen cannot be spoken now.');}
      p.hand=p.hand.filter(c=>c.id!==cardId);this.state.wildcardUsedThisRound.push(playerId);this.state.events.push(`${p.name} spoke ${card.title}.`);return this.getState();
    }
    const e=card.effectId;let success=true;const st=card.story??null,R=st?.rider??{};const startKi=p.ki;if(st&&p.ki<st.kiCost)throw new Error(`Needs ${st.kiCost} Ki.`);const riderLog=[];
    if(e==='CURSE'){if(this.state.curse.ownerId!==playerId||this.state.roundNumber<this.state.curse.lockedUntilRound)throw new Error('The Curse is not ready to attempt.');this.state.curse.attemptsInCycle++;this.state.curse.attemptedThisRound=true;this.state.wildcardUsedThisRound.push(playerId);this.state.roundWildcards.push({playerId,effectId:e,cardId});this.state.events.push(`${p.name} invoked the Curse.`);this.#emit('WILDCARD_USED',{playerId,effectId:e,card:this.#wildBrief(card),detail:{}});return this.getState();}
    if(e==='OTHER_WORLD'){if(this.state.domainInversionRounds>0)throw new Error('The Other World is already active.');this.state.domainInversionRounds=R.rounds??2;this.state.activeEffects.otherWorld=R.rounds??2;}
    else if(e==='SENZU'){if(!st){p.hp=Math.min(p.maxHp??100,p.hp+25);p.ki=Math.min(p.maxKi??20,p.ki+5);}for(const [id,unlock] of Object.entries(p.lockedUntilTurn)){if(this.state.sealedCards[id])continue;if(st&&!R.cdClear&&!R.cdMinus)continue;p.lockedUntilTurn[id]=st&&R.cdClear?this.state.roundNumber:Math.max(this.state.roundNumber,unlock-(st?R.cdMinus:1));}}
    else if(e==='FINAL_ATONEMENT'){const faSelf=st?(R.self??15):15,faOthers=st?(R.others??17):17;p.hp=Math.max(0,p.hp-(this.#isImmune(playerId)?0:faSelf));for(const other of this.state.players)if(other.id!==playerId&&other.hp>0)other.hp=Math.max(0,other.hp-(this.#isImmune(other.id)?0:faOthers));if(st)this.#applyRider(p,R,riderLog,true);this.state.finalAtonement=true;this.state.events.push(`${p.name} unleashed Final Atonement.`);const roundLeader=this.state.roundLeaderId??playerId;this.#emit('WILDCARD_USED',{playerId,effectId:e,card:this.#wildBrief(card),detail:{self:faSelf,others:faOthers,story:st?{name:st.name,fighter:st.fighter}:null}});this.state.winner=null;for(const play of this.state.currentTrick?.plays??[]){const owner=this.#getPlayer(play.playerId);owner.hand.push(this.#baseCard(play.card));owner.lockCardUntil(play.card.id,this.state.roundNumber+2);}this.state.currentTrick=null;this.state.currentCall=null;this.#finishEarlyRound(roundLeader);}
    else if(e==='SHENRON_WISH'){const wish=st?.wish??options.wish;if(st&&st.stat)options={...options,stat:st.stat};if(!['IMMORTALITY','ABSOLUTE_POWER','DIVINE_DESTRUCTION'].includes(wish))throw new Error('Choose a valid Shenron wish.');if(!st&&p.ki<4)throw new Error('Shenron’s Wish costs 4 Ki.');if(wish==='ABSOLUTE_POWER'&&!this.state.currentTrick)throw new Error('Absolute Power requires a current round.');if(!st){p.ki-=4;this.state.shenronUsed=true;}if(wish==='IMMORTALITY')this.state.activeEffects.immortality={playerId,rounds:R.rounds??2};if(wish==='ABSOLUTE_POWER'){const stat=options.stat==='RANK'?'RANK':'POWER';this.state.activeEffects.absolutePower={playerId,stat,round:this.state.roundNumber};}if(wish==='DIVINE_DESTRUCTION'){for(const other of this.state.players.filter(x=>x.id!==playerId&&x.hp>0)){const eligible=other.hand.filter(c=>c.type!=='WILDCARD'&&!c.lastStand&&!this.state.sealedCards[c.id]&&(other.lockedUntilTurn[c.id]??0)<=this.state.roundNumber);if(eligible.length){const target=eligible[Math.floor(this.random()*eligible.length)];other.hand=other.hand.filter(c=>c.id!==target.id);this.state.banishedCards.push({...target,ownerId:other.id,reason:'divine-destruction'});}}}}
    else if(e==='SCOUTER'){const target=this.#getPlayer(options.targetId);if(target.id===playerId||target.hp<=0)throw new Error('Choose an active opponent.');const rd=this.state.roundNumber;const chars=target.hand.filter(c=>c.type!=='WILDCARD'&&!c.lastStand);const brief=c=>({id:c.id,character:c.character,form:c.form,image:c.image,power:c.power,rank:c.rank,cost:this.#effectiveCardCost(c),ready:!this.state.sealedCards[c.id]&&(target.lockedUntilTurn[c.id]??0)<=rd});this.state.revealedScouter[playerId]={round:rd,targetId:target.id,ki:target.ki,hp:target.hp,handCount:target.hand.length,wildcards:target.hand.filter(c=>c.type==='WILDCARD').length,lastStandLeft:target.hand.filter(c=>c.lastStand).length,cooling:chars.filter(c=>!brief(c).ready).length,topPower:[...chars].sort((a,b)=>b.power-a.power).slice(0,3).map(brief),topRank:[...chars].sort((a,b)=>a.rank-b.rank).slice(0,2).map(brief)};this.state.revealedScouter[playerId].highestPower=this.state.revealedScouter[playerId].topPower[0]??null;this.state.revealedScouter[playerId].lowestRank=this.state.revealedScouter[playerId].topRank[0]??null;}
    else if(e==='SOLAR_FLARE'){if(playerId!==this.state.currentTrick?.leaderId&&this.state.phase!=='CALLING_STAT')throw new Error('Solar Flare is leader-only.');this.state.solarFlareLeader=playerId;}
    else if(e==='MAFUBA'){const targetPlay=this.state.currentTrick?.plays.find(x=>x.card.id===options.targetCardId);if(!targetPlay)throw new Error('Choose a visible character card to seal.');if(!st&&this.state.players.filter(x=>x.hp>0).length<3)throw new Error('Mafuba needs at least three fighters still standing.');const mafubaCost=st?0:(GAME_CONFIG.mafubaKi[this.#cardTier(targetPlay.card)]??3);if(p.ki<mafubaCost)throw new Error(`Mafuba needs ${mafubaCost} Ki to seal that card.`);p.ki-=mafubaCost;options.paidKi=mafubaCost;this.state.sealedCards[targetPlay.card.id]={ownerId:targetPlay.playerId,releaseRound:this.state.roundNumber+GAME_CONFIG.mafubaSealRounds+1,ordinaryUnlock:this.#getPlayer(targetPlay.playerId).lockedUntilTurn[targetPlay.card.id]??0};this.#getPlayer(targetPlay.playerId).hand.push(this.#baseCard(targetPlay.card));this.#getPlayer(targetPlay.playerId).lockCardUntil(targetPlay.card.id,this.state.roundNumber+GAME_CONFIG.mafubaSealRounds+1);this.state.mafubaTargetPlayerId=targetPlay.playerId;this.state.mafubaUserId=playerId;this.state.currentTrick.plays=this.state.currentTrick.plays.filter(x=>x.card.id!==targetPlay.card.id);}
    else throw new Error(`Unknown Wildcard effect: ${e}`);
    if(e==='SHENRON_WISH'&&!st){for(const owner of this.state.players){const duplicates=owner.hand.filter(c=>c.effectId==='SHENRON_WISH'&&c.id!==cardId);owner.hand=owner.hand.filter(c=>c.effectId!=='SHENRON_WISH'||c.id===cardId);for(const copy of duplicates){if(owner.ki<20)owner.ki=Math.min(owner.maxKi??20,owner.ki+2);else owner.coins+=2;}}this.state.reserveDeck=this.state.reserveDeck.filter(c=>c.effectId!=='SHENRON_WISH');}
    if(success){if(st){if(e!=='SHENRON_WISH'||st.kiCost){p.ki=Math.max(0,p.ki-st.kiCost);}if(e!=='FINAL_ATONEMENT')this.#applyRider(p,R,riderLog,false);if(st.surge){const gh=Math.round((p.maxHp??100)*st.surge),gk=Math.round((p.maxKi??20)*st.surge),bh=p.hp,bk=p.ki;p.hp=Math.min(p.maxHp??100,p.hp+gh);p.ki=Math.min(p.maxKi??20,p.ki+gk);if(p.hp>bh)riderLog.push(`+${p.hp-bh} HP`);if(p.ki>bk)riderLog.push(`+${p.ki-bk} Ki`);}}p.hand=p.hand.filter(c=>c.id!==cardId);if(e!=='FINAL_ATONEMENT'){this.state.wildcardUsedThisRound.push(playerId);this.state.roundWildcards.push({playerId,effectId:e,cardId});}this.state.events.push(`${p.name} activated ${card.title}.`);if(e!=='FINAL_ATONEMENT')this.#emit('WILDCARD_USED',{playerId,effectId:e,card:this.#wildBrief(card),detail:{...options,story:st?{name:st.name,fighter:st.fighter,applied:riderLog}:null}});if(e==='MAFUBA'&&this.state.currentTrick){if(this.#requiredPlays(this.state.currentTrick)<2)this.#finishMafubaNoRanking(playerId);else if(this.state.currentTrick.size>=this.#requiredPlays(this.state.currentTrick)){this.state.phase=PHASES.RESOLVING_TRICK;this.#resolveRound();}else this.state.currentPlayer=this.#nextTrickPlayerId(playerId,this.state.currentTrick);}}return this.getState();
  }
  boostPreview(playerId,cardId,powerKi=0,rankKi=0){const p=this.#getPlayer(playerId),card=p.hand.find(c=>c.id===cardId);if(!card||card.type==='WILDCARD')throw new Error('Choose a character card.');return this.#validateBoost(card,{powerKi,rankKi},p.ki-this.#effectiveCardCost(card));}
  /** Game Master intervention (v9 rework). Interactive powers open a decree phase; the others resolve at once. */
  gmIntervene(effectId,options={}){
    const s=this.state,EV=GAME_CONFIG.events;
    if(s.phase!==PHASES.CALLING_STAT)throw new Error('GM intervention is not eligible now.');
    const active=s.players.filter(p=>p.hp>0),leader=this.#getPlayer(s.currentPlayer);
    const bySeat=this.#seatOrder(leader.id);
    const trailing=[...active].sort((a,b)=>a.hp-b.hp)[0],champion=[...active].sort((a,b)=>b.hp-a.hp)[0];
    const brief=c=>({id:c.id,character:c.character,image:c.image,power:c.power,rank:c.rank,type:c.type,effectId:c.effectId,title:c.title});
    let detail={},interactive=null;
    if(effectId==='DRAGON_BALL_DRAFT'){
      const want=Math.min(active.length+1,s.reserveDeck.length);if(want<2)throw new Error('The reserve is too small to draft from.');
      const wildOk=c=>c.type==='WILDCARD'&&c.effectId!=='CURSE'&&!(c.effectId==='SHENRON_WISH'&&s.shenronUsed);
      const chars=s.reserveDeck.filter(c=>c.type!=='WILDCARD'),wilds=s.reserveDeck.filter(wildOk);
      const pool=[];if(wilds.length&&this.random()<0.5&&want>=3)pool.push(wilds[Math.floor(this.random()*wilds.length)]);
      for(const c of this.#shuffle(chars)){if(pool.length>=want)break;pool.push(c);}
      if(pool.length<2)throw new Error('Not enough cards to draft.');
      s.reserveDeck=s.reserveDeck.filter(c=>!pool.includes(c));
      const order=[...active].sort((a,b)=>a.hp-b.hp||bySeat.indexOf(a.id)-bySeat.indexOf(b.id)).filter(p=>p.hand.length<GAME_CONFIG.survival.maxHand).map(p=>p.id);
      if(!order.length){s.reserveDeck.push(...pool);throw new Error('All hands are full.');}
      interactive={kind:'DRAFT',order,pool:pool.map(c=>({...c})),picks:[]};detail={pool:pool.map(brief),order};
    }else if(effectId==='SACRED_AUCTION'){
      const order=bySeat.filter(id=>this.#getPlayer(id).hp>0&&this.#getPlayer(id).ki>=1);if(order.length<2)throw new Error('Not enough fighters with Ki to bid.');
      interactive={kind:'AUCTION',order,bids:{}};detail={order,maxBid:EV.auction.maxBid};
    }else if(effectId==='TRAINING_ARC'){
      const order=bySeat.filter(id=>{const p=this.#getPlayer(id);return p.hp>0&&p.hand.some(c=>c.type!=='WILDCARD'&&!c.lastStand);});if(order.length<2)throw new Error('Nobody has cards to train.');
      interactive={kind:'TRAINING',order,done:[]};detail={order,power:EV.training.power,rank:EV.training.rank};
    }else if(effectId==='BOUNTY_HUNT'){
      if(active.length<3||champion.hp-active.filter(p=>p.id!==champion.id).reduce((m,p)=>Math.max(m,p.hp),0)<0)throw new Error('No clear champion.');
      const second=[...active].sort((a,b)=>b.hp-a.hp)[1];if(champion.hp-(second?.hp??0)<8)throw new Error('The champion is not far enough ahead.');
      s.activeEffects.bounty={targetId:champion.id};detail={targetId:champion.id,hp:EV.bounty.hp,ki:EV.bounty.ki,penalty:EV.bounty.lastPenalty};
    }else if(effectId==='SIDE_QUEST'){
      const lowest=trailing.id;
      const quests=[{type:'WIN_CALL',call:'RANK',text:'Win the round on a RANK call.'},{type:'WIN_CALL',call:'POWER',text:'Win the round on a POWER call.'},{type:'WIN_CHEAP',text:'Win with a card that costs 1 Ki or less.'},{type:'WIN_BOOSTED',text:'Win with a Ki-boosted card.'},{type:'UPSET',text:'Win while having the lowest HP.'}];
      const pick=options.quest??quests[Math.floor(this.random()*quests.length)];
      s.activeEffects.sideQuest={...pick,round:s.roundNumber};detail={quest:pick,reward:EV.sideQuest,lowestId:lowest};
    }else if(effectId==='TIME_CHAMBER'){
      let cleared=0;for(const t of active)for(const [id,unlock] of Object.entries(t.lockedUntilTurn)){if(s.sealedCards[id]||unlock<=s.roundNumber)continue;t.lockedUntilTurn[id]=s.roundNumber;cleared++;}
      const gains=active.map(t=>{const b=t.ki;t.ki=Math.min(t.maxKi??20,t.ki+EV.timeChamber.ki);return {playerId:t.id,amount:t.ki-b};});
      if(!cleared&&gains.every(g=>g.amount===0))throw new Error('Nothing for the Time Chamber to do.');
      s.activeEffects.timeChamber=EV.timeChamber.rounds;detail={cleared,gains,rounds:EV.timeChamber.rounds,lossMult:EV.timeChamber.lossMult};
    }else if(effectId==='CURSE_INJECTION'){
      if(s.curse.destroyed||s.curse.ownerId||active.length<=2||s.roundNumber>15)throw new Error('Curse injection is not appropriate now.');
      const idx=s.reserveDeck.findIndex(c=>c.effectId==='CURSE');
      if(idx<0||leader.hand.filter(c=>c.type==='WILDCARD').length>=3)throw new Error('Curse cannot be injected.');
      leader.hand.push(s.reserveDeck.splice(idx,1)[0]);s.curse.ownerId=leader.id;detail.targetId=leader.id;
    }else if(effectId==='DIVINE_SWAP'){
      const hi=champion,lo=trailing;if(!hi||!lo||hi.id===lo.id||hi.hp===lo.hp)throw new Error('No distinct trailing player.');
      const a=this.#stealable(hi),b=this.#stealable(lo);if(!a.length||!b.length)throw new Error('No eligible cards to swap.');
      const best=c=>c.power+(81-c.rank)*8;const ca=[...a].sort((x,y)=>best(y)-best(x))[0],cb=[...b].sort((x,y)=>best(y)-best(x))[0];
      if(ca.id===cb.id)throw new Error('Nothing to swap.');
      hi.hand=hi.hand.filter(c=>c.id!==ca.id);lo.hand=lo.hand.filter(c=>c.id!==cb.id);hi.hand.push(cb);lo.hand.push(ca);
      detail={aId:hi.id,bId:lo.id,cardFromA:brief(ca),cardFromB:brief(cb)};
    }else if(effectId==='GM_GIFT'){
      if(!this.story)throw new Error('The Game Master has no gift to give.');
      const target=active.length>1&&trailing.hp<champion.hp?trailing:[...active].sort((a,b)=>a.ki-b.ki)[0];
      const owned=new Set(target.hand.filter(c=>c.type==='WILDCARD').map(c=>c.effectId));
      const pool=this.wildcards.filter(c=>['SENZU','OTHER_WORLD','SOLAR_FLARE','SCOUTER'].includes(c.effectId)&&!owned.has(c.effectId));
      if(!pool.length)throw new Error('Nothing to gift.');
      const gift=pool[Math.floor(this.random()*pool.length)];
      target.hand.push({...gift,id:`${gift.id}#gift${s.roundNumber}`,gift:true});
      detail={targetId:target.id,card:brief(gift)};
    }else throw new Error(`Unknown GM power ${effectId}`);
    s.gmInterventions++;s.gmHistory.push(effectId);s.lastGm={effectId,round:s.roundNumber,targetId:detail?.targetId??null,giftTitle:detail?.card?.title??null};s.lastEventType='GM';s.roundsSinceEvent=0;s.events.push(`Game Master: ${effectId}.`);
    this.#emit('GM_POWER',{effectId,detail,card:this.#special('GM_POWER',effectId)});
    if(interactive)this.#startDecree({...interactive,effectId});
    return this.getState();
  }
  #seatOrder(fromId){const ps=this.state.players,n=ps.length;let i=ps.findIndex(p=>p.id===fromId);const out=[];for(let k=0;k<n;k++){out.push(ps[(i+k*this.state.direction+n*n)%n].id);}return out;}
  #startDecree(d){
    const s=this.state;s.decree={...d,idx:0};s.phase=PHASES.GM_DECREE;s.currentPlayer=d.order[0];
    this.#emit('DECREE_START',{kind:d.kind,effectId:d.effectId,order:d.order,pool:d.pool?.map(c=>({id:c.id,character:c.character,image:c.image,power:c.power,rank:c.rank,type:c.type,effectId:c.effectId,title:c.title}))});
  }
  /** Legal choices for the actor of the current decree (used by the AI and as a safe fallback). */
  decreeOptions(playerId){
    const s=this.state,d=s.decree;if(!d||s.currentPlayer!==playerId)return null;const p=this.#getPlayer(playerId),EV=GAME_CONFIG.events;
    if(d.kind==='DRAFT')return {kind:'DRAFT',cards:d.pool.filter(c=>c.type!=='WILDCARD'||p.hand.filter(x=>x.type==='WILDCARD').length<GAME_CONFIG.survival.maxWildcards).map(c=>c.id)};
    if(d.kind==='AUCTION')return {kind:'AUCTION',maxBid:Math.min(EV.auction.maxBid,p.ki)};
    if(d.kind==='TRAINING')return {kind:'TRAINING',cards:p.hand.filter(c=>c.type!=='WILDCARD'&&!c.lastStand&&(c.power<999||c.rank>1)).map(c=>c.id),power:EV.training.power,rank:EV.training.rank};
    if(d.kind==='WISH'){const w=['HEAL','KI','RECALL'];if(d.victimId&&this.#getPlayer(d.victimId).hp>0&&this.#stealable(this.#getPlayer(d.victimId)).length&&p.hand.length<GAME_CONFIG.survival.maxHand)w.push('THIEF');return {kind:'WISH',wishes:w,victimId:d.victimId};}
    return null;
  }
  defaultDecreeChoice(playerId){
    const o=this.decreeOptions(playerId);if(!o)return {};
    if(o.kind==='DRAFT')return {cardId:o.cards[0]??null};
    if(o.kind==='AUCTION')return {bid:0};
    if(o.kind==='TRAINING'){const p=this.#getPlayer(playerId);const mine=p.hand.filter(x=>o.cards.includes(x.id));const c=[...mine.filter(x=>x.power<999)].sort((a,b)=>b.power-a.power)[0];if(c)return {cardId:c.id,stat:'POWER'};const r=mine.find(x=>x.rank>1);return {cardId:(r??mine[0])?.id,stat:'RANK'};}
    return {wish:'HEAL'};
  }
  decreeAct(playerId,choice={}){
    const s=this.state,d=s.decree;
    if(s.phase!==PHASES.GM_DECREE||!d)throw new Error('There is no decree to answer.');
    this.#assertCurrentPlayer(playerId);
    const p=this.#getPlayer(playerId),EV=GAME_CONFIG.events,opts=this.decreeOptions(playerId);
    if(d.kind==='DRAFT'){
      const id=choice.cardId;
      if(id==null){if(opts.cards.length)throw new Error('Pick a card from the table.');}
      else{
        if(!opts.cards.includes(id))throw new Error('That card cannot be drafted.');
        const card=d.pool.find(c=>c.id===id);d.pool=d.pool.filter(c=>c.id!==id);p.hand.push({...card});
        if(card.effectId==='CURSE')s.curse.ownerId=p.id;
        d.picks.push({playerId:p.id,cardId:card.id});this.#emit('DECREE_PICK',{kind:'DRAFT',playerId:p.id,card:{id:card.id,character:card.character,image:card.image,type:card.type,effectId:card.effectId}});
      }
    }else if(d.kind==='AUCTION'){
      const bid=Math.max(0,Math.floor(Number(choice.bid)||0));if(bid>opts.maxBid)throw new Error(`You can bid at most ${opts.maxBid} Ki.`);
      d.bids[p.id]=bid;this.#emit('DECREE_PICK',{kind:'AUCTION',playerId:p.id});
    }else if(d.kind==='TRAINING'){
      const card=p.hand.find(c=>c.id===choice.cardId&&opts.cards.includes(c.id));if(!card)throw new Error('Choose a character card to train.');
      const stat=choice.stat==='RANK'?'RANK':'POWER';
      if(stat==='POWER'){if(card.power>=999)throw new Error('That card is already at 999 Power.');card.power=Math.min(999,card.power+EV.training.power);}
      else{if(card.rank<=1)throw new Error('That card already has Rank 1.');card.rank=Math.max(1,card.rank-EV.training.rank);}
      card.trained=(card.trained??0)+1;
      this.#emit('DECREE_PICK',{kind:'TRAINING',playerId:p.id,stat,card:{id:card.id,character:card.character,image:card.image,power:card.power,rank:card.rank}});
    }else if(d.kind==='WISH'){
      const wish=choice.wish;if(!opts.wishes.includes(wish))throw new Error('That wish is not available.');
      const W=EV.wish,res={wish,playerId:p.id};
      if(wish==='HEAL'){p.hp=Math.min(p.maxHp??100,p.hp+W.heal);res.hp=W.heal;}
      else if(wish==='KI'){p.ki=Math.min(p.maxKi??20,p.ki+W.ki);res.ki=W.ki;}
      else if(wish==='RECALL'){let n=0;for(const id of Object.keys(p.lockedUntilTurn)){if(s.sealedCards[id])continue;if(p.lockedUntilTurn[id]>s.roundNumber){p.lockedUntilTurn[id]=s.roundNumber;n++;}}res.cleared=n;}
      else if(wish==='THIEF'){const v=this.#getPlayer(d.victimId),pool=this.#stealable(v);const c=pool[Math.floor(this.random()*pool.length)];v.hand=v.hand.filter(x=>x.id!==c.id);p.hand.push(c);res.victimId=v.id;res.card={id:c.id,character:c.character,image:c.image};}
      this.#emit('DECREE_RESULT',{kind:'WISH',...res});s.events.push(`${p.name} wished for ${wish}.`);
    }
    d.idx++;
    if(d.kind==='DRAFT'&&!d.pool.length)d.idx=d.order.length;
    if(d.idx<d.order.length){s.currentPlayer=d.order[d.idx];return this.getState();}
    this.#finishDecree();return this.getState();
  }
  #finishDecree(){
    const s=this.state,d=s.decree,EV=GAME_CONFIG.events;
    if(d.kind==='DRAFT'&&d.pool.length){s.reserveDeck.push(...d.pool);s.reserveDeck=this.#shuffle(s.reserveDeck);}
    if(d.kind==='AUCTION'){
      const bids={};for(const p of s.players)if(p.hp>0)bids[p.id]=d.bids[p.id]??0;
      for(const [id,b] of Object.entries(bids)){const p=this.#getPlayer(id);p.ki=Math.max(0,p.ki-b);}
      const top=Math.max(0,...Object.values(bids)),tied=Object.entries(bids).filter(([,b])=>b===top);let winnerId=null;
      if(top>=1&&tied.length===1){winnerId=tied[0][0];const w=this.#getPlayer(winnerId);w.hp=Math.min(w.maxHp??100,w.hp+EV.auction.heal);w.ki=Math.min(w.maxKi??20,w.ki+EV.auction.kiBack);}
      this.#emit('DECREE_RESULT',{kind:'AUCTION',bids,winnerId,tie:top>=1&&tied.length>1,heal:EV.auction.heal,ki:EV.auction.kiBack});
    }
    const then=d.then;s.decree=null;
    if(d.kind==='WISH'){s.currentPlayer=then.leaderId;this.#beginRound();return;}
    s.phase=PHASES.CALLING_STAT;s.currentPlayer=s.roundLeaderId;
    this.#emit('DECREE_END',{kind:d.kind,effectId:d.effectId});
  }
  startCrazyRound(forced=null,opts={}){
    const s=this.state,C=GAME_CONFIG.events.crazy;
    if(s.phase!==PHASES.CALLING_STAT||(!opts.force&&(s.roundNumber<C.from||s.crazyRoundsPlayed>=C.max)))return this.getState();
    const active=s.players.filter(p=>p.hp>0),hpSpread=Math.max(...active.map(p=>p.hp))-Math.min(...active.map(p=>p.hp));
    const ok=e=>{if(e.effectId==='BACKWARDS'&&s.domainInversionRounds>0)return false;if(e.effectId==='ZENKAI'&&hpSpread<10)return false;if(e.effectId==='WISH_ROUND'&&active.length<2)return false;if(e.effectId==='NO_APEX'&&active.some(p=>p.hand.filter(c=>c.type!=='WILDCARD').length<3))return false;return true;};
    const recent=s.crazyHistory??(s.crazyHistory=[]);
    let pool=CRAZY_ROUNDS.filter(ok);const fresh=pool.filter(e=>!recent.slice(-2).includes(e.effectId));if(fresh.length)pool=fresh;
    const event=forced?CRAZY_ROUNDS.find(e=>e.effectId===forced):pool[Math.floor(this.random()*pool.length)];if(!event||(forced&&opts.force&&!ok(event)))return this.getState();
    const keys={PUBLIC_FORECAST:'publicForecast',NO_APEX:'noApex',TOTAL_MIGHT:'totalMight',BACKWARDS:'backwards',WISH_ROUND:'wishRound',HIGH_STAKES:'highStakes',ZENKAI:'zenkai'};
    s.activeEffects[keys[event.effectId]]=event.duration;recent.push(event.effectId);
    if(event.effectId==='BACKWARDS')s.domainInversionRounds=Math.max(s.domainInversionRounds,1);
    s.crazyRoundsPlayed++;s.lastEventType='CRAZY';s.roundsSinceEvent=0;
    s.events.push(`Crazy Round: ${event.name} (${event.duration} round${event.duration>1?'s':''}).`);
    this.#emit('CRAZY_ROUND',{effectId:event.effectId,name:event.name,rounds:event.duration,card:this.#special('CRAZY_ROUND',event.effectId)});
    if(event.effectId==='NO_APEX'){
      for(const p of active){
        const el=p.hand.filter(c=>c.type!=='WILDCARD'&&!c.lastStand&&!s.sealedCards[c.id]&&(p.lockedUntilTurn[c.id]??0)<=s.roundNumber);
        const byPower=[...el].sort((a,b)=>b.power-a.power)[0],byRank=[...el].sort((a,b)=>a.rank-b.rank)[0];
        s.noApexBlocked[p.id]=[byPower?.id,byRank?.id].filter(Boolean);
      }
    }
    return this.getState();
  }
  #applyRider(p,R0,log,fin){
    const s=this.state,opps=s.players.filter(x=>x.id!==p.id&&x.hp>0);let R=R0;
    if(R0.gamble){R=R0.gamble[Math.floor(this.random()*R0.gamble.length)];log.push('Lucky roll!');}
    if(R.hp){const b=p.hp;p.hp=Math.min(p.maxHp??100,p.hp+R.hp);if(p.hp>b)log.push(`+${p.hp-b} HP`);}
    if(R.ki){const b=p.ki;p.ki=Math.min(p.maxKi??20,p.ki+R.ki);if(p.ki>b)log.push(`+${p.ki-b} Ki`);}
    if(R.selfDmg&&!this.#isImmune(p.id)){p.hp=Math.max(1,p.hp-R.selfDmg);log.push(`−${R.selfDmg} HP`);}
    for(const o of opps){
      if(R.oppKi&&o.ki>0){const b=o.ki;o.ki=Math.max(0,o.ki-R.oppKi);log.push(`foe −${b-o.ki} Ki`);}
      if(R.oppDmg&&!this.#isImmune(o.id)){const b=o.hp;o.hp=Math.max(1,o.hp-R.oppDmg);log.push(`foe −${b-o.hp} HP`);}
    }
    if(R.nextPower||R.nextRank){p.nextBonus={power:(p.nextBonus?.power??0)+(R.nextPower??0),rank:(p.nextBonus?.rank??0)+(R.nextRank??0)};log.push(`next card ${R.nextPower?`+${R.nextPower} Power`:''}${R.nextPower&&R.nextRank?' ':''}${R.nextRank?`−${R.nextRank} Rank`:''}`);}
    if(R.cdClear&&!fin){for(const id of Object.keys(p.lockedUntilTurn)){if(s.sealedCards[id])continue;p.lockedUntilTurn[id]=s.roundNumber;}log.push('cooldowns cleared');}
    if(R.shield&&!s.activeEffects.immortality){s.activeEffects.immortality={playerId:p.id,rounds:R.shield};log.push(`shielded ${R.shield}r`);}
    if(R.draw){for(let i=0;i<R.draw;i++){const idx=s.reserveDeck.findIndex(c=>c.type!=='WILDCARD');if(idx<0||p.hand.length>=22)break;const c=s.reserveDeck.splice(idx,1)[0];p.hand.push({...c});p.lockCardUntil(c.id,s.roundNumber+1);log.push(`drew ${c.character}`);}}
  }
  #wildcardBlock(playerId,effectId,card=null){
    const st=card?.story??null;
    const s=this.state;
    if(s.phase==='MATCH_COMPLETE')return 'The match is over.';
    if(playerId!==s.currentPlayer)return 'Wait for your turn.';
    if(s.phase!==PHASES.CALLING_STAT&&s.phase!==PHASES.PLAYING_CARD)return 'Not available right now.';
    if(s.wildcardUsedThisRound.includes(playerId))return 'Only one Wildcard per round.';
    if(s.wildcardLockout)return 'Wildcard Lockout is active.';
    if(s.finalAtonement)return 'The round has already ended.';
    if(s.solarFlareLeader&&s.solarFlareLeader!==playerId)return 'Blinded by Solar Flare.';
    const p=this.#getPlayer(playerId);
    if(card?.monarqueKind)return s.phase===PHASES.CALLING_STAT?'':'Monarque speaks only before the round begins.';
    switch(effectId){
      case 'SOLAR_FLARE': if(s.phase===PHASES.PLAYING_CARD&&(playerId!==s.currentTrick?.leaderId||s.currentTrick.plays.length))return 'Leader only, before anyone plays.';break;
      case 'SHENRON_WISH': if(!st&&s.shenronUsed)return 'The wish was already granted.';if(p.ki<(st?st.kiCost:4))return `Needs ${st?st.kiCost:4} Ki.`;break;
      case 'CURSE': if(s.curse.ownerId!==playerId)return 'You do not hold the Curse.';if(s.roundNumber<s.curse.lockedUntilRound)return 'Curse is cooling down.';break;
      case 'OTHER_WORLD': if(s.domainInversionRounds>0)return 'Domain Inversion is already active.';break;
      case 'MAFUBA': if(s.phase!==PHASES.PLAYING_CARD||!(s.currentTrick?.plays.length))return 'Needs a card already on the table.';if(!st&&s.players.filter(x=>x.hp>0).length<3)return 'Needs at least three fighters.';if(p.ki<(st?st.kiCost:1))return `Needs at least ${st?st.kiCost:1} Ki.`;break;
      default: break;
    }
    if(st){const R=st.rider??{};if(p.ki<st.kiCost)return `Needs ${st.kiCost} Ki.`;const selfLoss=(effectId==='FINAL_ATONEMENT'?(R.self??15):0)+(R.selfDmg??0);if(selfLoss&&p.hp<=selfLoss)return 'Too weak to pay the HP price.';}
    return '';
  }
  #canUseWildcard(playerId,effectId){return this.#wildcardBlock(playerId,effectId)==='';}
  #effectiveCardCost(card){return this.#cardCost(card);}
  #validateBoost(card,boost={},availableKi=0){const tier=this.#cardTier(card);const caps={WEAK:{budget:3,power:75,rank:9},NORMAL:{budget:2,power:50,rank:6},POWERFUL:{budget:1,power:25,rank:3},OP:{budget:0,power:0,rank:0}}[tier]??{budget:0,power:0,rank:0};const powerKi=Math.max(0,Math.floor(Number(boost.powerKi)||0)),rankKi=Math.max(0,Math.floor(Number(boost.rankKi)||0)),cost=powerKi+rankKi;if(cost>caps.budget||cost>availableKi||cost>this.#getPlayer(this.state.currentPlayer).ki)throw new Error('Boost exceeds the card or Ki budget.');if(powerKi*25>caps.power||rankKi*3>caps.rank)throw new Error('Boost exceeds this card tier\'s limit.');if(powerKi>0&&card.power+(powerKi-1)*25>=999)throw new Error(`Power is already at the maximum (999) — no more Ki is needed.`);if(rankKi>0&&card.rank-(rankKi-1)*3<=1)throw new Error('Rank is already at the best possible value (1) — no more Ki is needed.');return {power:Math.min(powerKi*25,999-card.power),rank:Math.min(rankKi*3,card.rank-1),cost,powerKi,rankKi};}
  #isBlockedByCrazy(player,card){if(this.state.activeEffects.noApex){const blocked=this.state.noApexBlocked[player.id]??[];return blocked.includes(card.id);}return false;}
  #isImmune(playerId){const im=this.state.activeEffects.immortality;return Boolean(im&&im.playerId===playerId&&im.rounds>0);}
  #resolveCurse(placement,call,inverted){
    const curse=this.state.curse;if(!curse.ownerId||curse.destroyed)return;
    const holder=this.#getPlayer(curse.ownerId);
    const ranked=placement.filter(x=>!x.card.isPass);
    const row=ranked.find(x=>x.playerId===holder.id);
    const mafuba=Boolean(this.state.mafubaUserId);
    if(curse.attemptedThisRound){
      let outcome='VOID';
      if(row&&ranked.length>=2){
        const norm=x=>call==='POWER'?x.card.power/999*100:call==='TOTAL'?statScore(x.card,'TOTAL')/2:(GAME_CONFIG.rankMax+1-x.card.rank)/GAME_CONFIG.rankMax*100;
        const gap=(a,b)=>Math.abs(norm(a)-norm(b));
        const idx=ranked.indexOf(row),n=ranked.length;
        if(idx===0&&gap(ranked[0],ranked[1])>=15){
          curse.destroyed=true;curse.ownerId=null;curse.severity=0;
          holder.hp=Math.min(holder.maxHp??100,holder.hp+10);holder.ki=Math.min(holder.maxKi??20,holder.ki+3);holder.coins+=2;
          for(const o of this.state.players)if(o.id!==holder.id&&o.hp>0&&!this.#isImmune(o.id))o.hp=Math.max(0,o.hp-6);
          holder.hand=holder.hand.filter(c=>c.effectId!=='CURSE');
          this.state.events.push('The Curse was destroyed!');outcome='DESTROYED';
        }else{
          let target=null;
          if(n===4&&idx===2&&gap(ranked[2],ranked[3])>=5)target=ranked[3];
          else if(n===3&&idx===1&&gap(ranked[1],ranked[2])>=5)target=ranked[2];
          else if(n===2&&mafuba&&idx===1&&gap(ranked[0],ranked[1])>=5)target=ranked[0];
          const receiver=target&&this.#getPlayer(target.playerId);
          if(receiver&&receiver.hand.filter(c=>c.type==='WILDCARD').length<3){
            holder.hand=holder.hand.filter(c=>c.effectId!=='CURSE');
            receiver.hand.push({...this.wildcards.find(c=>c.effectId==='CURSE')});
            curse.ownerId=receiver.id;this.state.events.push(`The Curse transferred to ${receiver.name}.`);outcome='TRANSFERRED';
          }else if((n===4&&idx===3&&gap(ranked[2],ranked[3])>=8)||(n===3&&idx===2&&gap(ranked[1],ranked[2])>=8)||(n===2&&!mafuba&&idx===1)){
            curse.severity=Math.min(2,curse.severity+1);outcome='FAILED';
          }else outcome='RETAINED';
        }
        if(curse.attemptsInCycle>=2){curse.lockedUntilRound=this.state.roundNumber+2;curse.attemptsInCycle=0;}
      }else{
        // Holder was voided (Mafuba) or passed: the attempt is not consumed.
        curse.attemptsInCycle=Math.max(0,curse.attemptsInCycle-1);
      }
      curse.attemptedThisRound=false;
      this.state.lastCurseOutcome={round:this.state.roundNumber,outcome,holderId:holder.id,newHolderId:curse.ownerId,severity:curse.severity};
      this.#emit('CURSE_OUTCOME',{outcome,holderId:holder.id,newHolderId:curse.ownerId,severity:curse.severity});
    }
    if(curse.ownerId&&!curse.destroyed){
      const cur=this.#getPlayer(curse.ownerId),drain=1+curse.severity;
      if(!this.#isImmune(cur.id))cur.hp=Math.max(0,cur.hp-drain);
      cur.ki=Math.max(0,cur.ki-drain);
    }
  }
  #updateEntertainment(placement){let delta=0;if(placement.length>1){const score=play=>this.state.currentCall==='RANK'?(GAME_CONFIG.rankMax+1-play.card.rank)/GAME_CONFIG.rankMax*100:this.state.currentCall==='TOTAL'?statScore(play.card,'TOTAL')/2:play.card.power/999*100;const sorted=[...placement].sort((a,b)=>score(b)-score(a));if(Math.abs(score(sorted[0])-score(sorted[1]))<8)delta+=8;}if(this.state.events.at(-1)==='The Curse was destroyed!')delta+=10;if(placement.some(x=>x.card.isPass))delta-=3;const prior=this.state.hpSnapshot??{};const changed=this.state.players.some(p=>Math.abs((prior[p.id]??p.hp)-p.hp)>2);this.state.stagnantRounds=changed?0:this.state.stagnantRounds+1;if(this.state.stagnantRounds>=3)delta-=6;const last=this.state.placementHistory.at(-1);const previousLeader=last?.placements?.[0]?.playerId;const previousHp=last?.hp??prior;const lowest=Object.entries(previousHp).sort((a,b)=>a[1]-b[1])[0]?.[0];if(lowest&&placement[0]?.playerId===lowest)delta+=6;this.state.entertainment=Math.max(0,Math.min(100,this.state.entertainment+delta));}
  #isRunaway(){const history=this.state.placementHistory.slice(-3);if(history.length>=3&&history.every(h=>h.placements[0]?.playerId===history[0].placements[0]?.playerId))return true;const active=this.state.players.filter(p=>p.hp>0).sort((a,b)=>b.hp-a.hp);if(active.length>=2&&active[0].hp-active.at(-1).hp>=30){const leaderWins=history.filter(h=>h.placements[0]?.playerId===active[0].id).length;return leaderWins>=2;}return false;}
  #decrementEffects(){const fx=this.state.activeEffects;for(const key of ['timeChamber','publicForecast','noApex','totalMight','backwards','wishRound','highStakes','zenkai','otherWorld'])if(typeof fx[key]==='number'&&fx[key]>0){fx[key]--;if(!fx[key])delete fx[key];}delete fx.bounty;delete fx.sideQuest;if(fx.immortality){fx.immortality.rounds--;if(fx.immortality.rounds<=0)delete fx.immortality;}if(fx.absolutePower&&fx.absolutePower.round<=this.state.roundNumber)delete fx.absolutePower;this.state.wildcardLockout=false;this.state.solarFlareLeader=null;this.state.wildcardUsedThisRound=[];this.state.roundWildcards=[];this.state.previousEventType=this.state.lastEventType;this.state.lastEventType=null;}
  #finishEarlyRound(playerId){this.state.curse.attemptedThisRound=false;this.#checkEliminations({weak:true});if(this.state.curse.ownerId&&!this.state.curse.destroyed){const cursed=this.#getPlayer(this.state.curse.ownerId);if(!this.#isImmune(cursed.id))cursed.hp=Math.max(0,cursed.hp-(1+this.state.curse.severity));cursed.ki=Math.max(0,cursed.ki-(1+this.state.curse.severity));}this.#checkEliminations({weak:true});if(this.state.curse.ownerId&&this.#getPlayer(this.state.curse.ownerId).hp<=0){const dead=this.#getPlayer(this.state.curse.ownerId);dead.hand=dead.hand.filter(c=>c.effectId!=='CURSE');if(!this.state.curse.destroyed&&!this.state.reserveDeck.some(c=>c.effectId==='CURSE'))this.state.reserveDeck.push({...this.wildcards.find(c=>c.effectId==='CURSE')});this.state.curse.ownerId=null;}const alive=this.state.players.filter(p=>p.hp>0);if(alive.length<=1){this.state.winner=alive[0]?.id??null;this.state.phase=PHASES.MATCH_COMPLETE;return;}const currentIndex=this.state.players.findIndex(p=>p.id===playerId);let next=currentIndex;for(let i=0;i<this.state.players.length;i++){next=(next+this.state.direction+this.state.players.length)%this.state.players.length;if(this.state.players[next].hp>0)break;}this.state.currentPlayer=this.state.players[next].id;this.state.finalAtonement=false;this.state.mafubaUserId=null;this.state.mafubaTargetPlayerId=null;this.state.wildcardUsedThisRound=[];this.state.roundWildcards=[];for(const key of ['noApex','highStakes','totalMight','wishRound','zenkai','bounty','sideQuest'])delete this.state.activeEffects[key];this.state.wildcardLockout=false;this.state.solarFlareLeader=null;this.state.previousEventType=this.state.lastEventType;this.state.lastEventType=null;this.#beginRound();}
  #beginRound(){
    const s=this.state;
    s.roundNumber++;s.turnNumber=s.roundNumber;
    if(this.story&&s.roundNumber>(this.story.maxRounds??50)){const alive=s.players.filter(p=>p.hp>0).sort((a,b)=>b.hp-a.hp||(a.id==='player-1'?-1:1));s.winner=alive[0]?.id??null;s.phase=PHASES.MATCH_COMPLETE;s.currentTrick=null;s.currentCall=null;s.events.push('The Game Master ends the stalemate.');this.#emit('STALEMATE',{winnerId:s.winner});return;}
    if(this.story&&s.roundNumber>(this.story.maxRounds??50)){const alive=s.players.filter(p=>p.hp>0).sort((a,b)=>b.hp-a.hp||(a.id==='player-1'?-1:1));s.winner=alive[0]?.id??null;s.phase=PHASES.MATCH_COMPLETE;s.currentTrick=null;s.currentCall=null;s.events.push('The Game Master ends the stalemate.');this.#emit('STALEMATE',{winnerId:s.winner});return;}
    for(const p of s.players)p.clearExpiredLocks(s.roundNumber);
    for(const [id,seal] of Object.entries(s.sealedCards)){
      if(seal.releaseRound<=s.roundNumber){
        delete s.sealedCards[id];
        const owner=this.#getPlayer(seal.ownerId);
        if(owner.hand.some(c=>c.id===id))owner.lockedUntilTurn[id]=Math.max(owner.lockedUntilTurn[id]??0,seal.ordinaryUnlock??0);
        this.#emit('SEAL_RELEASED',{playerId:seal.ownerId,cardId:id});
      }
    }
    s.hpSnapshot=Object.fromEntries(s.players.map(p=>[p.id,p.hp]));
    if(s.roundNumber>1){const SW=GAME_CONFIG.secondWind;for(const p of s.players)if(p.hp>0&&p.ki<=SW.atKi)p.ki=Math.min(p.maxKi??20,p.ki+SW.gain);}
    this.#twistRound();this.#dramaRound();
    s.revealedScouter={};s.roundLeaderId=s.currentPlayer;s.phase=PHASES.CALLING_STAT;s.currentTrick=null;s.currentCall=null;s.finalAtonement=false;s.noApexBlocked={};
    s.wildcardUsedThisRound=[];s.roundWildcards=[];s.drawnThisRound=[];
    this.#emit('ROUND_START',{round:s.roundNumber,leaderId:s.currentPlayer});
    this.#runEventDirector();
    this.#scheduleGmTelegraph();
  }
  #special(type,effectId){if(effectId==='GM_GIFT')return {id:'gm-gift',title:'Monarque’s Boon',character:'Monarque',form:'Gift',image:'/story/edicts/monarque-boon.webp',description:'Monarque grants an Edict to the vessel that needs it.'};const c=this.registry.find(x=>x.type===type&&x.effectId===effectId);return c?{id:c.id,title:c.title,character:c.character,form:c.form,image:c.image,description:c.description}:null;}
  #gmPool(){
    const fromCards=this.registry.filter(c=>c.type==='GM_POWER').map(c=>({effectId:c.effectId,weight:c.weight??1}));
    const base=(fromCards.length?fromCards:GM_POWERS).map(x=>({effectId:x.effectId,weight:x.weight}));
    if(this.story)base.push({effectId:'GM_GIFT',weight:7});
    return base;
  }
  #gmRound(r){const G=this.story?.gm??GAME_CONFIG.events.gm;return r>=G.from&&(r-G.from)%G.every===0&&this.state.gmInterventions<G.max;}
  #runEventDirector(){
    const s=this.state,EV=GAME_CONFIG.events;
    if(this.story?.noEvents)return; // Monarque's own bout: only what he plays from his hand happens
    const scheduled=Boolean(s.scheduledGm&&s.scheduledGm.round===s.roundNumber);
    s.scheduledGm=null;s.roundsSinceEvent=(s.roundsSinceEvent??0)+1;
    if(scheduled&&s.gmInterventions<(this.story?.gm??EV.gm).max){this.#runGm();return;}
    if(s.roundNumber<EV.crazy.from||this.#gmRound(s.roundNumber)||s.previousEventType==='CRAZY')return;
    const chance=s.roundsSinceEvent>=EV.crazy.pityRounds?1:EV.crazy.chance;
    if(s.crazyRoundsPlayed<EV.crazy.max&&this.random()<chance)this.startCrazyRound();
  }
  #runGm(){
    const s=this.state,active=s.players.filter(p=>p.hp>0);
    const kiStarved=active.filter(p=>p.ki<=4).length,avgKi=active.reduce((n,p)=>n+p.ki,0)/Math.max(1,active.length);
    const curseFree=!s.curse.ownerId&&!s.curse.destroyed,runaway=this.#isRunaway();
    const sizes=active.map(p=>p.hand.length),spread=Math.max(...sizes)-Math.min(...sizes);
    let options=this.#gmPool().map(x=>{
      let w=x.weight;
      if(s.gmHistory.includes(x.effectId))w=Math.max(0.2,w-2.5);
      if(x.effectId==='BOUNTY_HUNT'&&runaway)w+=3;
      if(x.effectId==='DIVINE_SWAP'&&(runaway||s.entertainment<35))w+=2;
      if(x.effectId==='TIME_CHAMBER'&&kiStarved>=2)w+=3;
      if(x.effectId==='SACRED_AUCTION'&&avgKi>=8)w+=2;
      if(x.effectId==='DRAGON_BALL_DRAFT'&&spread>=3)w+=2;
      if(x.effectId==='TRAINING_ARC'&&s.roundNumber<=8)w+=1;
      if(x.effectId==='CURSE_INJECTION'&&curseFree)w+=2;
      return {...x,weight:w};
    });
    while(options.length){
      const total=options.reduce((n,x)=>n+x.weight,0);let roll=this.random()*total;
      const picked=options.find(x=>(roll-=x.weight)<=0)??options[0];
      options=options.filter(x=>x!==picked);
      try{this.gmIntervene(picked.effectId,{});return;}catch{/* try the next power */}
    }
    s.events.push('The Game Master observes this round.');this.#emit('GM_CANCELLED',{});
  }
  #scheduleGmTelegraph(){
    const s=this.state,next=s.roundNumber+1;
    s.scheduledGm=null;
    if(!this.#gmRound(next))return;
    s.scheduledGm={round:next};s.events.push('The Game Master stirs…');this.#emit('GM_TELEGRAPH',{targetRound:next});
  }
  /** Marks fighters as eliminated (HP 0, or both Last-Stand cards spent) and announces it once. */
  /** No way back: can afford nothing, no Last-Stand card, no Edict to lean on, too little HP to gather Soul, and not enough HP left to pass its way (-3 HP, +1 Soul each) up to the cheapest card. Declared lost instead of left stuck. */
  #isHopeless(p){if(p.hp<=0||p.hp>GAME_CONFIG.charge.minHp||p.hand.some(c=>c.lastStand||c.type==='WILDCARD'))return false;const costs=p.hand.map(c=>this.#cardCost(c));if(!costs.length)return true;const need=Math.min(...costs)-p.ki;return need>0&&p.hp<=GAME_CONFIG.passHpLoss*need+5;}
  #checkEliminations({weak=true}={}){
    for(const p of this.state.players){
      if(p.koReason)continue;
      let reason=null;
      if(p.hp<=0)reason='HP';
      else if(weak&&GAME_CONFIG.lastStand.eliminateWhenSpent&&p.ki===0&&p.lastStandTotal>0&&!p.hand.some(c=>c.lastStand)){reason='LAST_STAND';p.hp=0;}
      else if(weak&&this.#isHopeless(p)){reason='STUCK';p.hp=0;}
      if(reason){p.koReason=reason;p.eliminated=true;this.state.events.push(`${p.name} was eliminated (${reason==='HP'?'no HP left':reason==='STUCK'?'no Soul, no Last Stands and too weak to gather Soul':'Last-Stand cards spent'}).`);this.#emit('ELIMINATION',{playerId:p.id,reason});}
    }
  }
  #emit(type,data={}){
    const s=this.state;this.eventSeq+=1;
    s.eventLog.push({seq:this.eventSeq,round:s.roundNumber,type,...data});
    if(s.eventLog.length>300)s.eventLog.splice(0,s.eventLog.length-300);
  }
  #wildBrief(c){return {id:c.id,title:c.title,character:c.character,image:c.image,effectId:c.effectId,story:c.story?{name:c.story.name,fighter:c.story.fighter,step:c.story.step,grade:c.story.grade,kiCost:c.story.kiCost,rider:c.story.rider,wish:c.story.wish,stat:c.story.stat}:null};}
  #baseCard(card){const {basePower,baseRank,boostKi,boostPower,boostRank,...rest}=card;return {...rest,power:basePower??card.power,rank:baseRank??card.rank,type:'CHARACTER'};}
  #isPlayable(p,c){if(c.lastStand&&p.ki>0)return false;return c.type!=='WILDCARD'&&!this.state.sealedCards[c.id]&&p.canPlayCard(c.id,this.state.roundNumber)&&this.#effectiveCardCost(c)<=p.ki&&!this.#isBlockedByCrazy(p,c);}
  #placementTable(n){
    const P=GAME_CONFIG.placements;
    if(n>=4)return P.FOUR_PLAYER;if(n===3)return P.THREE_RANKED;
    if(this.state.mafubaUserId)return P.MAFUBA_TWO;
    return this.state.mode===2?P.TWO_PLAYER:P.DUEL_ENDGAME;
  }
  /** Round-start effects of the match twist: Soul Tide drips Soul, Mirror Rounds schedules a Domain Inversion. */
  #twistRound(){const s=this.state,tw=this.twist;if(!tw)return;
    if(tw.kiPerRound)for(const p of s.players)if(p.hp>0)p.ki=Math.min(p.maxKi??20,p.ki+tw.kiPerRound);
    if(tw.invertEvery&&s.roundNumber>0&&s.roundNumber%tw.invertEvery===0&&s.domainInversionRounds<=0){s.domainInversionRounds=1;s.events.push('Mirror Round: the lower stat wins this round.');this.#emit('TWIST_ROUND',{twist:tw.id,round:s.roundNumber});}
  }
  /** Final Reckoning: two fighters left, both nearly spent. Flagged for the round so losses count x1.5 and the UI can say so. */
  #dramaRound(){const s=this.state;s.reckoning=false;if(!this.drama)return;const alive=s.players.filter(p=>p.hp>0);
    if(alive.length===2&&alive.every(p=>p.hp<=(p.maxHp??100)*DRAMA.reckoningAt)){s.reckoning=true;s.events.push('Final Reckoning: both are nearly spent. Every wound counts for more.');this.#emit('FINAL_RECKONING',{round:s.roundNumber});}
  }
  /** Last Breath: the first time a fighter falls to 25% HP they draw on the Soul they have left, and the next round's blow is halved. */
  #lastBreath(){if(!this.drama)return;const s=this.state;
    for(const p of s.players){if(p.hp<=0||p.breathUsed||p.hp>(p.maxHp??100)*DRAMA.breathAt)continue;
      p.breathUsed=true;p.breathShield=s.roundNumber+1;p.ki=Math.min(p.maxKi??20,p.ki+DRAMA.breathKi);
      s.events.push(`${p.name} draws a Last Breath: +${DRAMA.breathKi} Soul, the next blow is halved.`);this.#emit('LAST_BREATH',{playerId:p.id,ki:DRAMA.breathKi});}
  }
  #arenaMultiplier(){const r=this.state.roundNumber;for(const t of GAME_CONFIG.arenaPressure)if(r>=t.fromRound)return t.mult;return 1;}
  #cardTier(card){return classifyCard(card,this.cards);}
  #cardCost(card){return getCardCost(card,this.cards);}
  #shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  #assertPhase(phase){if(this.state.phase!==phase)throw new Error(`Action unavailable during phase ${this.state.phase}.`);}
  #assertCurrentPlayer(id){if(id!==this.state.currentPlayer)throw new Error('It is not this player\'s turn.');}
  #getPlayer(id){const p=this.state.players.find(x=>x.id===id);if(!p)throw new Error(`Unknown player: ${id}`);return p;}
  #requiredPlays(trick){return trick.participantIds.length-(this.state.mafubaUserId?1:0)-(this.state.mafubaTargetPlayerId?1:0);}
  #finishMafubaNoRanking(playerId){const trick=this.state.currentTrick;for(const play of trick?.plays??[]){const owner=this.#getPlayer(play.playerId);if(!owner.hand.some(c=>c.id===play.card.id)){owner.hand.push(this.#baseCard(play.card));owner.lockCardUntil(play.card.id,this.state.roundNumber+2);}}this.state.curse.attemptedThisRound=false;if(this.state.curse.ownerId){const cursed=this.#getPlayer(this.state.curse.ownerId);if(!this.#isImmune(cursed.id))cursed.hp=Math.max(0,cursed.hp-(1+this.state.curse.severity));cursed.ki=Math.max(0,cursed.ki-(1+this.state.curse.severity));}if(this.state.curse.ownerId&&this.#getPlayer(this.state.curse.ownerId).hp<=0){const dead=this.#getPlayer(this.state.curse.ownerId);dead.hand=dead.hand.filter(c=>c.effectId!=='CURSE');if(!this.state.curse.destroyed&&!this.state.reserveDeck.some(c=>c.effectId==='CURSE'))this.state.reserveDeck.push({...this.wildcards.find(c=>c.effectId==='CURSE')});this.state.curse.ownerId=null;}this.state.publicHistory.push(...(trick?.plays??[]).map(play=>({playerId:play.playerId,card:play.card,sealedResolution:true})));this.state.lastRound={round:this.state.roundNumber,call:trick?.call,placements:[],cancelled:'MAFUBA_NO_RANKING'};this.#checkEliminations({weak:true});const alive=this.state.players.filter(p=>p.hp>0);if(alive.length<=1){this.state.winner=alive[0]?.id??null;this.state.phase=PHASES.MATCH_COMPLETE;this.state.currentTrick=null;this.state.currentCall=null;return;}this.state.domainInversionRounds=Math.max(0,this.state.domainInversionRounds-1);this.#decrementEffects();const leader=this.#getPlayer(trick.leaderId);let next=this.state.players.findIndex(p=>p.id===leader.id);for(let i=0;i<this.state.players.length;i++){next=(next+this.state.direction+this.state.players.length)%this.state.players.length;if(this.state.players[next].hp>0)break;}this.state.currentPlayer=this.state.players[next].id;this.state.currentTrick=null;this.state.currentCall=null;this.state.mafubaUserId=null;this.state.mafubaTargetPlayerId=null;this.#beginRound();}
  #nextTrickPlayerId(id,trick){const ids=trick.participantIds;let i=ids.indexOf(id);for(let n=0;n<ids.length;n++){i=(i+this.state.direction+ids.length)%ids.length;if(ids[i]!==id&&ids[i]!==this.state.mafubaTargetPlayerId&&ids[i]!==this.state.mafubaUserId&&this.#getPlayer(ids[i]).hp>0&&!trick.plays.some(x=>x.playerId===ids[i]))return ids[i];}throw new Error('No eligible player remains in this round.');}
}
