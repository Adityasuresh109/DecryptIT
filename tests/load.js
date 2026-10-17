// Repeatable 25-client, in-process Durable Object protocol benchmark (no third-party dependencies).
// Real Cloudflare + physical Safari/Android devices must still be checked before a live party.
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {AgencyRoom} from '../worker/index.js';
import {freshRoom} from '../worker/engine.js';
if(!globalThis.crypto){const {webcrypto}=await import('node:crypto');globalThis.crypto=webcrypto;}
const packs={family:Array.from({length:400},(_,i)=>`SAFE${i}`),nsfw:Array.from({length:400},(_,i)=>`AFTERDARK${i}`)};
const timings=[];
for(let trial=0;trial<5;trial++){
 const sockets=[],store=new Map();let alarm;
 const ctx={getWebSockets:()=>sockets.filter(w=>w.readyState===1),storage:{get:async k=>store.get(k),put:async(k,v)=>store.set(k,structuredClone(v)),setAlarm:async n=>{alarm=n},deleteAlarm:async()=>{alarm=null}}};
 const room=new AgencyRoom(ctx,{});
 room.room=freshRoom({code:'ABCDEF',hostToken:'host-secret',mode:'mixed',packs});
 const r=room.room;
 r.players=Array.from({length:25},(_,i)=>({id:`id${i}`,name:`Agent ${i}`,token:`tk${i}`,team:i%2?'BLUE':'RED',role:i<2?'SPYMASTER':'OPERATIVE',online:false,removed:false}));
 function socket(){let a={authorized:false,at:Date.now()};const w={readyState:1,messages:0,last:null,serializeAttachment(x){a=x},deserializeAttachment(){return a},send(s){this.messages++;this.last=JSON.parse(s)},close(){this.readyState=3}};sockets.push(w);return w;}
 async function act(w,m){await room.webSocketMessage(w,JSON.stringify(m));if(w.last?.type==='error')throw Error(w.last.message);}
 const start=performance.now();const host=socket();await act(host,{type:'auth',token:'host-secret'});
 const clients=[];for(let i=0;i<25;i++){const w=socket();await act(w,{type:'auth',token:`tk${i}`});clients.push(w);}
 await act(host,{type:'start_game'});const t=r.turnTeam;
 await act(clients[r.players.findIndex(p=>p.team===t&&p.role==='SPYMASTER')],{type:'send_clue',word:'Mission',number:9});
 const opIndex=r.players.flatMap((p,i)=>p.team===t&&p.role==='OPERATIVE'?[i]:[]),majority=Math.floor(opIndex.length/2)+1;
 for(const c of r.board.filter(x=>x.color===t))for(const i of opIndex.slice(0,majority))await act(clients[i],{type:'vote',cardId:c.id});
 assert.equal(r.phase,'GAME_OVER');assert.equal(r.series[t],1);
 const duration=performance.now()-start,messages=sockets.reduce((n,w)=>n+w.messages,0);
 timings.push({trial:trial+1,players:25,gameMs:Math.round(duration),outgoingSnapshots:messages});
}
const max=Math.max(...timings.map(x=>x.gameMs));
console.log(JSON.stringify({method:'in-process DO protocol mock; NOT live Cloudflare or physical phones',trials:timings,maxMs:max},null,2));
