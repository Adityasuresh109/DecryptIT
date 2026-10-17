import test from 'node:test';
import assert from 'node:assert/strict';
import {freshRoom,newBoard,startGame,sendClue,vote,unvote,resolveCard,endTurn,expireTimer,setPause,swapWord,publicSnapshot,seriesWinner,validation,majority,OPPONENT,TEAMS,validatePacks,evaluateVotes,shuffle} from '../worker/engine.js';

const packs={family:Array.from({length:400},(_,i)=>`FAMILY_${String(i).padStart(3,'0')}`),nsfw:Array.from({length:400},(_,i)=>`ADULT_${String(i).padStart(3,'0')}`)};
function setup(players=14,mode='family',bestOf=3){const r=freshRoom({code:'ABCDEF',hostToken:'HOST',packs,mode,bestOf,timer:120,rand:Math.random});
 r.players=Array.from({length:players},(_,i)=>({id:'P'+i,team:i%2?'BLUE':'RED',role:i<2?(i===0?'SPYMASTER':'OPERATIVE'):'OPERATIVE',online:true,removed:false}));
 // Set one spymaster per team.
 r.players.forEach(p=>p.role='OPERATIVE');r.players[0].role='SPYMASTER';r.players[1].role='SPYMASTER';
 startGame(r,Math.random,100);return r;}
const spy=(r,t)=>r.players.find(p=>p.team===t&&p.role==='SPYMASTER');
const ops=(r,t)=>r.players.filter(p=>p.team===t&&p.role==='OPERATIVE');
const card=(r,color)=>r.board.find(p=>p.color===color&&!p.revealed)?.id;
const take=(r,t)=>{r.turnTeam=t;r.phase='CLUE';};

test('validates EXACT 400+400 packs; protects no-duplicate invariant',()=>{
 assert.equal(validatePacks(packs).family.length,400);
 assert.throws(()=>validatePacks({family:[],nsfw:[]}),/400/);
 assert.equal(validatePacks({...packs,nsfw:[...packs.nsfw.slice(1),'FAMILY_000']}).nsfw.length,400);
});

test('10 consecutive Mixed Bag boards have 10–15 adult words, 25 unique, and no session repeats',()=>{
 const r=setup(14,'mixed');let all=new Set();
 for(let i=0;i<10;i++){
  if(i)r.board=newBoard(r).board;
  assert.equal(r.board.length,25);assert.equal(new Set(r.board.map(x=>x.word)).size,25);
  const adult=r.board.filter(c=>c.source==='nsfw').length;assert.ok(adult>=10&&adult<=15,adult);
  for(const w of r.board){assert.equal(all.has(w.word),false,'No reused word before pack cycles');all.add(w.word);}
 }
});

test('majority threshold, vote changes, spymaster cannot vote and Done banks rest',()=>{
 const r=setup(16);const t=r.turnTeam;const p=ops(r,t);assert.equal(p.length,7);assert.equal(majority(r,t),4);
 sendClue(r,spy(r,t),'Animals',4,101);const a=card(r,t),b=card(r,'BYSTANDER');
 vote(r,p[0],b);vote(r,p[0],a);assert.equal(r.votes[p[0].id],a);
 assert.throws(()=>vote(r,spy(r,t),a),/operatives/);
 vote(r,p[1],a);vote(r,p[2],a);assert.equal(r.board[a].revealed,false);
 vote(r,p[3],a,105);assert.equal(r.board[a].revealed,true);assert.equal(r.budget,3);
 const nextOps=ops(r,t);for(let i=0;i<4;i++)vote(r,nextOps[i],'DONE',110);
 assert.equal(r.phase,'CLUE');assert.equal(r.bank[t],3);
});

test('bank math: 3 new, 2 reveals (correct and civilian) -> 1 bank, then spend across next clue',()=>{
 const r=setup();const t=r.turnTeam;sendClue(r,spy(r,t),'Animals',3,101);
 resolveCard(r,card(r,t),102);assert.equal(r.budget,2);
 resolveCard(r,card(r,'BYSTANDER'),103);assert.equal(r.bank[t],1);assert.equal(r.phase,'CLUE');
 take(r,t);sendClue(r,spy(r,t),'Countries',2,104);assert.equal(r.budget,3);assert.equal(r.bankInBudget,1);
 resolveCard(r,card(r,t),105);resolveCard(r,card(r,t),106);assert.equal(r.budget,1);
 resolveCard(r,card(r,t),107);assert.equal(r.budget,0);assert.equal(r.phase,'CLUE');assert.equal(r.bank[t],0);
 assert.ok(r.board.filter(c=>c.revealed&&c.color===t).length===4);
});

test('wrong team last card win is checked on EVERY reveal',()=>{
 const r=setup();const t=r.turnTeam,other=OPPONENT[t];r.board.filter(c=>c.color===other).slice(0,-1).forEach(c=>c.revealed=true);
 sendClue(r,spy(r,t),'Countries',2,102);resolveCard(r,card(r,other),103);
 assert.equal(r.phase,'GAME_OVER');assert.equal(r.winner,other);assert.equal(r.series[other],1);
});

test('assassin kills instantly; series score increments only once',()=>{
 const r=setup(14,'family',3),t=r.turnTeam;sendClue(r,spy(r,t),'Animal',1,101);resolveCard(r,card(r,'ASSASSIN'),102);
 assert.equal(r.phase,'GAME_OVER');assert.equal(r.winner,OPPONENT[t]);assert.equal(r.winReason,'ASSASSIN');assert.equal(r.series[OPPONENT[t]],1);
 assert.throws(()=>resolveCard(r,0),/during GAME_OVER/);
});

test('snapshot anti-leak: operative/TV have no unrevealed keys or previous clues; spies do',()=>{
 const r=setup();const t=r.turnTeam;
 sendClue(r,spy(r,t),'RememberThisOldClue',1,120);endTurn(r,130);
 sendClue(r,spy(r,r.turnTeam),'LatestClue',3,140);
 const operative=publicSnapshot(r,ops(r,t)[0]),tv=publicSnapshot(r,{tv:true}),spymaster=publicSnapshot(r,spy(r,t));
 for(const v of [operative,tv]){
  assert.equal('history' in v,false);
  assert.equal(JSON.stringify(v).includes('RememberThisOldClue'),false);
  assert.ok(v.board.some(c=>!c.revealed));
  for(const c of v.board)if(!c.revealed)assert.equal('color' in c,false);
 }
 assert.equal(spymaster.history.length,2);
 assert.equal(spymaster.board.filter(c=>c.color==='ASSASSIN').length,1);
 assert.equal(operative.currentClue.word,'LatestClue');
});

test('timer ends guessing, banks unused; clue expiry auto-pass with no free guesses',()=>{
 const r=setup();const t=r.turnTeam;sendClue(r,spy(r,t),'Animals',5,101);resolveCard(r,card(r,t),102);
 assert.equal(expireTimer(r,121000),true);assert.equal(r.phase,'CLUE');assert.equal(r.bank[t],4);assert.equal(r.notice.message,'TIME_UP');
 const u=r.turnTeam,oldBank=r.bank[u];assert.equal(expireTimer(r,242000),true);assert.equal(r.turnTeam,t);assert.equal(r.bank[u],oldBank);
});

test('host pause, connection pause, and same countdown remaining after resume',()=>{
 const r=setup();r.deadline=120000;r.remainingMs=120000;setPause(r,'MANUAL',true,30000);
 assert.equal(r.phase,'PAUSED');assert.equal(r.remainingMs,90000);setPause(r,'SPYMASTER_OFFLINE',true,30001);
 setPause(r,'MANUAL',false,40000);assert.equal(r.phase,'PAUSED');setPause(r,'SPYMASTER_OFFLINE',false,50000);
 assert.equal(r.phase,'CLUE');assert.equal(r.deadline,140000);
});

test('swap keeps category, avoids duplicates, key untouched; reshuffle new key and 25 cards',()=>{
 const r=setup(14,'mixed'),id=card(r,'BYSTANDER'),c=r.board[id];const old=c.word,col=c.color,source=c.source;
 swapWord(r,id);assert.notEqual(c.word,old);assert.equal(c.color,col);assert.equal(c.source,source);
 assert.equal(new Set(r.board.map(x=>x.word)).size,25);
 const next=newBoard(r);assert.equal(new Set(next.board.map(x=>x.word)).size,25);
 assert.equal(next.board.filter(c=>c.color===next.start).length,9);assert.equal(next.board.filter(c=>c.color==='ASSASSIN').length,1);
});

test('offline operative is dropped from majority count; disconnect can resolve existing majority',()=>{
 const r=setup(16);const t=r.turnTeam,p=ops(r,t);sendClue(r,spy(r,t),'Plan',3,101);const a=card(r,t);
 vote(r,p[0],a);vote(r,p[1],a);vote(r,p[2],a);assert.equal(r.board[a].revealed,false);
 p[3].online=false;p[4].online=false;assert.equal(majority(r,t),3);
 evaluateVotes(r,102);assert.equal(r.board[a].revealed,true);
});

test('best-of series declares winner on second game in best-of-three',()=>{
 const r=setup();const t=r.turnTeam;
 for(let i=0;i<2;i++){
  sendClue(r,spy(r,t),'One',9,100+i*5);
  for(const c of r.board.filter(c=>c.color===t))resolveCard(r,c.id,101+i*5);
  assert.equal(r.series[t],i+1);if(i===0){r.phase='LOBBY';startGame(r,()=>.2,200);r.turnTeam=t;}
 }
 assert.equal(seriesWinner(r),t);assert.throws(()=>startGame(r),/Series is over/);
});

test('input validation refuses invalid single-token clues, amounts and phases',()=>{
 const r=setup(),t=r.turnTeam;
 assert.throws(()=>sendClue(r,spy(r,t),'two words',2),/one word/);
 assert.throws(()=>sendClue(r,spy(r,t),'Animals',0),/1 through 9/);
 assert.throws(()=>sendClue(r,spy(r,t),'Animals',2.5),/1 through 9/);
 assert.throws(()=>vote(r,ops(r,t)[0],1),/during CLUE/);
 sendClue(r,spy(r,t),'Valid',1);
 assert.throws(()=>sendClue(r,spy(r,t),'ValidAgain',1),/during GUESS/);
});

test('start requires even Red/Blue team count without overriding host-designated roles',()=>{
 const r=setup(8);r.phase='LOBBY';r.players[2].team='BLUE';
 assert.throws(()=>validation(r),/balanced within one player/);
});
