import curatedPacks from '../word-packs.json' with {type:'json'};
import {
 freshRoom,validatePacks,TEAMS,OPPONENT,MAX_PLAYERS,livePlayers,validation,
 startGame,sendClue,vote,unvote,evaluateVotes,endTurn,resolveCard,setPause,
 expireTimer,balance,changeTeam,setSpymaster,swapWord,publicSnapshot,seriesWinner,error
} from './engine.js';

const ABC='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const secureRandom=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
function secret(bytes=24){const data=crypto.getRandomValues(new Uint8Array(bytes));return Array.from(data,b=>b.toString(16).padStart(2,'0')).join('');}
function code(){const b=crypto.getRandomValues(new Uint8Array(6));return Array.from(b,v=>ABC[v%ABC.length]).join('');}
function validCode(s){return typeof s==='string'&&/^[A-HJ-NP-Z2-9]{6}$/.test(s);}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
function allowedOrigin(o,env){if(!o)return true;try{const u=new URL(o);return u.origin==='https://adityasuresh109.github.io'||u.origin===env?.ALLOWED_ORIGIN||(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u.origin));}catch{return false;}}
function cors(response,origin){const h=new Headers(response.headers);h.set('access-control-allow-origin',origin||'https://adityasuresh109.github.io');h.set('vary','Origin');h.set('access-control-allow-methods','GET, POST, OPTIONS');h.set('access-control-allow-headers','content-type');return new Response(response.body,{status:response.status,headers:h});}
async function bodyOf(request){const raw=await request.text();if(raw.length>4096)error('Request is too large.');return raw?JSON.parse(raw):{};}
export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(!allowedOrigin(origin,env))return json({error:'Use the official AD Arcade game page to connect.'},403);
  if(request.method==='OPTIONS')return cors(new Response(null,{status:204}),origin);
  if(url.pathname==='/health'){
   let available=false;try{validatePacks(curatedPacks);available=true;}catch{}
   return cors(json({ok:true,service:'decryptit',version:'0.1.0',wordPacksReady:available}),origin);
  }
  if(url.pathname==='/api/socket'){
   const roomCode=(url.searchParams.get('code')||'').toUpperCase();
   if(!validCode(roomCode)||request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'A valid room code and WebSocket are required.'},426);
   return env.ROOMS.getByName(roomCode).fetch(new Request('https://room.internal/socket',{headers:request.headers}));
  }
  try{
   if(url.pathname==='/api/create'&&request.method==='POST'){
    const data=await bodyOf(request);
    for(let i=0;i<10;i++){
     const roomCode=code(),stub=env.ROOMS.getByName(roomCode);
     const res=await stub.fetch(new Request('https://room.internal/create',{method:'POST',body:JSON.stringify({code:roomCode,...data})}));
     if(res.status===409)continue;return cors(res,origin);
    }
    return cors(json({error:'Unable to create a unique room. Please try again.'},503),origin);
   }
   if(url.pathname==='/api/join'&&request.method==='POST'){
    const data=await bodyOf(request);const roomCode=String(data.code||'').toUpperCase();
    if(!validCode(roomCode))return cors(json({error:'Enter a valid six-character room code.'},400),origin);
    return cors(await env.ROOMS.getByName(roomCode).fetch(new Request('https://room.internal/join',{method:'POST',body:JSON.stringify(data)})),origin);
   }
   return cors(json({error:'Unknown endpoint.'},404),origin);
  }catch(e){return cors(json({error:e.message||'Unexpected request error.'},400),origin);}
 }
};

// All room mutations are serialized, persisted in DO storage, and projected per audience.
export class AgencyRoom {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.room=null;this.pending=Promise.resolve();}
 async load(){if(!this.room)this.room=await this.ctx.storage.get('room')||null;return this.room;}
 async persist(){await this.ctx.storage.put('room',this.room);await this.schedule();}
 sockets(){return this.ctx.getWebSockets();}
 send(ws,payload){try{ws.send(JSON.stringify(payload));}catch{ /* Socket may already have closed. */ }}
 authenticated(){return this.sockets().filter(w=>w.deserializeAttachment()?.authorized);}
 presenceToken(token){return this.authenticated().some(w=>{const a=w.deserializeAttachment();return a.type==='player'&&a.token===token;});}
 hostOnline(){return this.authenticated().some(w=>w.deserializeAttachment().type==='host');}
 spyPresent(){const r=this.room;if(!r)return true;return TEAMS.every(t=>livePlayers(r).some(p=>p.team===t&&p.role==='SPYMASTER'&&p.online));}
 async schedule(){if(!this.room)return;
  const now=Date.now(),active=this.authenticated().length>0;
  const next=[this.room.deadline,active?now+15000:null].filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b)[0];
  if(next)await this.ctx.storage.setAlarm(Math.max(now+100,next));else await this.ctx.storage.deleteAlarm?.();
 }
 refreshPauses(now=Date.now()){
  const r=this.room;if(!r||!['CLUE','GUESS','PAUSED'].includes(r.phase))return;
  setPause(r,'HOST_OFFLINE',!this.hostOnline(),now);
  setPause(r,'SPYMASTER_OFFLINE',!this.spyPresent(),now);
 }
 refreshOnline(){if(!this.room)return;for(const p of this.room.players)p.online=!p.removed&&this.presenceToken(p.token);}
 viewer(a){const r=this.room;if(a.type==='host')return {host:true};if(a.type==='tv')return {tv:true};return r.players.find(p=>p.token===a.token)||null;}
 broadcast(){if(!this.room)return;for(const ws of this.authenticated()){const a=ws.deserializeAttachment(),v=this.viewer(a);if(v)this.send(ws,publicSnapshot(this.room,v));else this.send(ws,{type:'error',message:'Seat expired — please rejoin.'});}}
 async fetch(request){const path=new URL(request.url).pathname;
  try{
   if(path==='/socket'){
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return json({error:'WebSocket required'},426);
    await this.load();if(!this.room||this.room.phase==='ENDED')return json({error:'Room unavailable or session ended.'},404);
    const pair=new WebSocketPair();const [client,server]=Object.values(pair);
    this.ctx.acceptWebSocket(server);server.serializeAttachment({authorized:false,at:Date.now()});
    await this.schedule();return new Response(null,{status:101,webSocket:client});
   }
   if(request.method!=='POST')return json({error:'POST required.'},405);
   const data=await bodyOf(request);await this.load();
   if(path==='/create'){
    if(this.room)return json({error:'Room code collision.'},409);
    const hostToken=secret();this.room=freshRoom({code:data.code,hostToken,mode:data.mode||'family',bestOf:data.bestOf??3,timer:data.timer??120,packs:curatedPacks,rand:secureRandom});
    await this.persist();return json({code:this.room.code,token:hostToken});
   }
   if(path==='/join'){
    if(!this.room||this.room.phase==='ENDED')return json({error:'Room not found or session ended. Confirm the code with the host.'},404);
    if(typeof data.token==='string'){
     const p=this.room.players.find(x=>x.token===data.token);
     if(p)return json({code:this.room.code,token:p.token,id:p.id,rejoined:true});
     return json({error:'Seat token no longer valid. Ask the host to restore your seat.'},401);
    }
    if(this.room.phase!=='LOBBY')return json({error:'Game already started. Ask the host to restore your seat or start the next game.'},409);
    if(livePlayers(this.room).length>=MAX_PLAYERS)return json({error:'Room full (30 players maximum).'},409);
    const name=String(data.name||'').trim().replace(/[\u0000-\u001f<>]/g,'').slice(0,24);
    if(!name) return json({error:'Enter your name to join.'},400);
    const team=TEAMS.includes(data.team)?data.team:(livePlayers(this.room).filter(x=>x.team==='RED').length<=livePlayers(this.room).filter(x=>x.team==='BLUE').length?'RED':'BLUE');
    const p={id:secret(6),name,team,role:'OPERATIVE',token:secret(),online:false,removed:false};
    this.room.players.push(p);await this.persist();this.broadcast();
    return json({code:this.room.code,token:p.token,id:p.id,rejoined:false});
   }
   return json({error:'Unknown room API.'},404);
  }catch(e){return json({error:e.message||'Room request failed.'},400);}
 }
 async webSocketMessage(ws,raw){
  // Promise chain excludes race conditions between simultaneous majority votes.
  const next=this.pending.catch(()=>{}).then(()=>this.processMessage(ws,raw));this.pending=next;
  try{await next;}catch(e){this.send(ws,{type:'error',message:e.message||'Action failed. Retry or ask the host.'});}
 }
 async processMessage(ws,raw){
  if(typeof raw!=='string'||raw.length>2048)error('Message too large or not text.');
  let m;try{m=JSON.parse(raw);}catch{error('Malformed message — reconnect to the room.');}
  await this.load();if(!this.room||this.room.phase==='ENDED')error('Session has ended. Ask the host for a new room code.');
  const a=ws.deserializeAttachment()||{};
  if(!a.authorized){
   if(m.type!=='auth'||Date.now()-(a.at||0)>12000)error('Authentication timed out — reload the page.');
   let identity;
   if(m.role==='tv')identity={type:'tv'};
   else if(m.token===this.room.hostToken)identity={type:'host'};
   else if((identity=this.room.players.find(p=>p.token===m.token)))identity={type:'player',token:m.token};
   else error('Seat not recognized — rejoin with your room code.');
   ws.serializeAttachment({...identity,authorized:true,lastSeen:Date.now()});
   this.refreshOnline();this.refreshPauses();await this.persist();
   this.send(ws,{type:'ready'});this.broadcast();return;
  }
  a.lastSeen=Date.now();ws.serializeAttachment(a);
  if(m.type==='ping'){this.send(ws,{type:'pong',at:Date.now()});return;}
  const r=this.room;const viewer=this.viewer(a);
  if(!viewer)error('Your seat is no longer available — ask the host to restore it.');
  if(a.type==='tv')error('The TV display is read-only.');
  if(a.type==='player'&&viewer.removed)error('Host removed your seat. Ask them to restore it.');
  if(a.type==='host')this.hostAction(m);
  else this.playerAction(m,viewer);
  this.refreshOnline();this.refreshPauses();await this.persist();this.broadcast();
 }
 playerAction(m,p){const r=this.room;
  switch(m.type){
   case 'send_clue':sendClue(r,p,m.word,m.number);return;
   case 'vote':vote(r,p,m.cardId);return;
   case 'unvote':unvote(r,p);return;
   case 'done':vote(r,p,'DONE');return;
   default:error('That action is not available to players.');
  }
 }
 hostAction(m){const r=this.room;const p=r.players.find(x=>x.id===m.playerId);
  switch(m.type){
   case 'assign_team':if(!p||p.removed)error('Choose an active player.');changeTeam(r,p,m.team);break;
   case 'auto_balance':balance(r);break;
   case 'set_spymaster':setSpymaster(r,p);break;
   case 'set_options':
    if(r.phase!=='LOBBY')error('Change game options in the lobby only.');
    if(m.mode!==undefined){if(!['family','nsfw','mixed'].includes(m.mode))error('Unknown pack.');r.mode=m.mode;}
    if(m.bestOf!==undefined){if(![1,3,5,7].includes(m.bestOf))error('Choose an odd best-of (1/3/5/7).');r.bestOf=m.bestOf;}
    if(m.timer!==undefined){if(![0,60,90,120,180].includes(m.timer))error('Invalid timer.');r.timer=m.timer;}
    break;
   case 'start_game':startGame(r,secureRandom);break;
   case 'next_game':if(r.phase!=='GAME_OVER')error('Finish the current game first.');startGame(r,secureRandom);break;
   case 'new_series':if(!['LOBBY','GAME_OVER'].includes(r.phase))error('Finish this game before resetting the series.');r.series={RED:0,BLUE:0};r.phase='LOBBY';r.board=[];r.winner=null;r.notice=null;r.gameIndex=0;break;
   case 'void_clue':if(r.phase!=='GUESS')error('Void a clue after it has been sent.');endTurn(r,Date.now(),'CLUE_VOIDED');break;
   case 'force_resolve':resolveCard(r,m.cardId);break;
   case 'swap_word':swapWord(r,m.cardId,secureRandom);break;
   case 'reshuffle':
    if(!['CLUE','GUESS','PAUSED'].includes(r.phase))error('Only a running game can be reshuffled.');
    r.phase='LOBBY';r.pauses=[];r.pausedPhase=null;r.gameIndex=Math.max(0,r.gameIndex-1);startGame(r,secureRandom);r.notice={message:'RESHUFFLED',at:Date.now()};break;
   case 'pause':if(!['CLUE','GUESS','PAUSED'].includes(r.phase))error('No active game to pause.');setPause(r,'MANUAL',true);break;
   case 'resume':setPause(r,'MANUAL',false);break;
   case 'remove_player':if(!p||p.removed)error('Choose an active player.');p.removed=true;p.online=false;delete r.votes[p.id];evaluateVotes(r);break;
   case 'restore_player':if(!p||!p.removed)error('Choose a removed player.');p.removed=false;break;
   case 'end_session':r.phase='ENDED';r.deadline=null;r.notice={message:'SESSION_ENDED',at:Date.now()};break;
   default:error('Unknown host control.');
  }
 }
 async closeSocket(ws){
  const next=this.pending.catch(()=>{}).then(async()=>{
   await this.load();if(!this.room)return;
   this.refreshOnline();this.refreshPauses();evaluateVotes(this.room);await this.persist();this.broadcast();
  });this.pending=next;await next;
 }
 async webSocketClose(ws){await this.closeSocket(ws);}
 async webSocketError(ws){await this.closeSocket(ws);}
 async alarm(){
  const next=this.pending.catch(()=>{}).then(async()=>{
   await this.load();if(!this.room)return;
   const now=Date.now();
   for(const ws of this.authenticated()){
    const a=ws.deserializeAttachment();if(now-(a.lastSeen||0)>45000){try{ws.close(4000,'Connection timed out');}catch{}}
   }
   this.refreshOnline();this.refreshPauses(now);evaluateVotes(this.room,now);expireTimer(this.room,now);
   await this.persist();this.broadcast();
  });this.pending=next;await next;
 }
}
