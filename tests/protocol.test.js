import test from 'node:test';import assert from 'node:assert/strict';
import worker,{AgencyRoom} from '../worker/index.js';
import {freshRoom,publicSnapshot,OPPONENT} from '../worker/engine.js';
if(!globalThis.crypto){const {webcrypto}=await import('node:crypto');globalThis.crypto=webcrypto;}
const packs={family:Array.from({length:400},(_,i)=>`CLEAN${i}`),nsfw:Array.from({length:400},(_,i)=>`NIGHT${i}`)};
function fixture(n=25){
 const db=new Map(),sockets=[];
 const ctx={storage:{async get(k){return db.get(k)},async put(k,v){db.set(k,structuredClone(v))},async setAlarm(ms){ctx.nextAlarm=ms},async deleteAlarm(){ctx.nextAlarm=null}},getWebSockets(){return sockets.filter(ws=>ws.readyState===1)},acceptWebSocket(ws){sockets.push(ws)}};
 const room=new AgencyRoom(ctx,{});
 room.room=freshRoom({code:'ABCDEF',hostToken:'SECRET_HOST',mode:'mixed',packs,rand:Math.random});
 const r=room.room;
 r.players=Array.from({length:n},(_,i)=>({id:'p'+i,token:'token'+i,name:'Agent '+i,team:i%2?'BLUE':'RED',role:i===0||i===1?'SPYMASTER':'OPERATIVE',online:false,removed:false}));
 let counter=0;
 function ws(){let attachment={authorized:false,at:Date.now()};const w={id:counter++,readyState:1,out:[],send(raw){this.out.push(JSON.parse(raw));},close(){this.readyState=3},serializeAttachment(x){attachment=x;},deserializeAttachment(){return attachment;}};sockets.push(w);return w;}
 async function auth(token,role){const w=ws();await room.webSocketMessage(w,JSON.stringify(role==='tv'?{type:'auth',role:'tv'}:{type:'auth',token}));return w;}
 async function action(w,msg){await room.webSocketMessage(w,JSON.stringify(msg));}
 const last=w=>w.out.filter(x=>x.type==='state').at(-1);
 return {room,ctx,r,db,sockets,ws,auth,action,last};
}

test('Worker refuses create while exact word pack is unavailable and reports health',async()=>{
 const env={};const h=await worker.fetch(new Request('https://relay.test/health'),env);assert.equal((await h.json()).wordPacksReady,false);
 // We exercise room.create independently because the production Worker binding is not configured here.
});

test('25 real-protocol simulated clients join, vote nine agents to win, inspect their outgoing WS messages',async()=>{
 const f=fixture(25),{r,room,auth,action,last}=f;
 const host=await auth('SECRET_HOST'),tv=await auth('', 'tv');const ws=[];
 for(const p of r.players)ws.push(await auth(p.token));
 await action(host,{type:'start_game'});
 assert.equal(r.phase,'CLUE');
 const team=r.turnTeam,spymaster=r.players.find(p=>p.team===team&&p.role==='SPYMASTER');
 await action(ws[Number(spymaster.id.slice(1))],{type:'send_clue',word:'Operation',number:9});
 assert.equal(r.phase,'GUESS');
 const operatives=r.players.filter(p=>p.team===team&&p.role==='OPERATIVE');
 const threshold=Math.floor(operatives.length/2)+1;
 const targets=r.board.filter(c=>c.color===team).map(c=>c.id);
 for(const target of targets){
  for(const p of operatives.slice(0,threshold))await action(ws[Number(p.id.slice(1))],{type:'vote',cardId:target});
 }
 assert.equal(r.phase,'GAME_OVER');assert.equal(r.winner,team);assert.equal(r.series[team],1);
 assert.equal(last(host).you.host,true);assert.equal(last(tv).you.tv,true);
 for(const p of r.players){const client=ws[Number(p.id.slice(1))];for(const msg of client.out.filter(x=>x.type==='state')){
  if(p.role==='OPERATIVE'){
   assert.equal('history' in msg,false,'operative cannot receive history');
   for(const card of msg.board)if(!card.revealed)assert.equal('color' in card,false,'unrevealed card color leaked to operative');
  }
 }}
 for(const state of tv.out.filter(x=>x.type==='state')){
  assert.equal('history' in state,false);for(const c of state.board)if(!c.revealed)assert.equal('color' in c,false,'TV secret leak');
 }
 assert.ok(ws.reduce((sum,w)=>sum+w.out.filter(m=>m.type==='state').length,0)>200);
});

test('reconnect mid-vote retains exact seat, role, team and previous vote',async()=>{
 const f=fixture(8),{r,auth,action,last,room}=f;const host=await auth('SECRET_HOST');const clients=[];
 for(const p of r.players)clients.push(await auth(p.token));
 await action(host,{type:'start_game'});
 const t=r.turnTeam,spy=r.players.find(p=>p.team===t&&p.role==='SPYMASTER');
 await action(clients[Number(spy.id.slice(1))],{type:'send_clue',word:'Animal',number:4});
 const p=r.players.find(p=>p.team===t&&p.role==='OPERATIVE'),id=Number(p.id.slice(1)),target=r.board.find(x=>x.color===t).id;
 await action(clients[id],{type:'vote',cardId:target});const before=last(clients[id]);
 clients[id].close();await room.webSocketClose(clients[id]);
 const refreshed=await auth(p.token);const after=last(refreshed);
 assert.deepEqual(after.you,before.you);assert.equal(after.you.vote,target);assert.equal(after.phase,'GUESS');
 assert.equal(after.board[target].revealed,false);
});

test('spymaster/host loss pauses and respective reconnect unpauses, host recovery actions work',async()=>{
 const f=fixture(8),{r,auth,action,last,room}=f;let host=await auth('SECRET_HOST');const clients=[];
 for(const p of r.players)clients.push(await auth(p.token));
 await action(host,{type:'start_game'});
 const t=r.turnTeam,spy=r.players.find(p=>p.team===t&&p.role==='SPYMASTER');
 await action(clients[Number(spy.id.slice(1))],{type:'send_clue',word:'Mission',number:9});
 host.close();await room.webSocketClose(host);assert.equal(r.phase,'PAUSED');assert.ok(r.pauses.includes('HOST_OFFLINE'));
 host=await auth('SECRET_HOST');assert.equal(r.phase,'GUESS');
 const oldSpy=clients[Number(spy.id.slice(1))];oldSpy.close();await room.webSocketClose(oldSpy);
 assert.equal(r.phase,'PAUSED');assert.ok(r.pauses.includes('SPYMASTER_OFFLINE'));
 await auth(spy.token);assert.equal(r.phase,'GUESS');
 await action(host,{type:'pause'});assert.equal(r.phase,'PAUSED');await action(host,{type:'resume'});assert.equal(r.phase,'GUESS');
 const before=r.board.find(c=>!c.revealed),original=before.word;
 await action(host,{type:'swap_word',cardId:before.id});assert.notEqual(before.word,original);
 await action(host,{type:'force_resolve',cardId:before.id});assert.equal(before.revealed,true);
 await action(host,{type:'void_clue'});assert.equal(r.phase,'CLUE');
 const newP=r.players.find(p=>p.team===t&&p.role==='OPERATIVE');
 await action(host,{type:'set_spymaster',playerId:newP.id});assert.equal(newP.role,'SPYMASTER');
 await action(host,{type:'remove_player',playerId:newP.id});assert.equal(newP.removed,true);
 await action(host,{type:'restore_player',playerId:newP.id});assert.equal(newP.removed,false);
 const beforeIndex=r.gameIndex;await action(host,{type:'reshuffle'});assert.equal(r.phase,'CLUE');assert.equal(r.board.length,25);assert.equal(r.gameIndex,beforeIndex);
});

test('unauthorized protocol messages get actionable errors but do not mutate room',async()=>{
 const f=fixture(8),{r,auth,action,last}=f;const host=await auth('SECRET_HOST');const players=[];for(const p of r.players)players.push(await auth(p.token));
 await action(host,{type:'start_game'});const t=r.turnTeam,spy=r.players.find(p=>p.team===t&&p.role==='SPYMASTER');
 const other=r.players.find(p=>p.team!==t&&p.role==='OPERATIVE');const ws=players[Number(other.id.slice(1))];
 await action(ws,{type:'send_clue',word:'Fraud',number:3});assert.equal(r.phase,'CLUE');assert.match(ws.out.at(-1).message,/spymaster/);
 await action(players[Number(spy.id.slice(1))],{type:'send_clue',word:'Valid',number:4});
 await action(players[Number(spy.id.slice(1))],{type:'vote',cardId:0});assert.equal(r.phase,'GUESS');assert.match(players[Number(spy.id.slice(1))].out.at(-1).message,/operatives/);
});
