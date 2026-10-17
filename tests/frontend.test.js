import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const SOURCE=readFileSync(new URL('../frontend/app.js',import.meta.url),'utf8').replace(/^import\s+\{qrSVG\}\s+from\s+['"]\.\/qr\.js['"];?\s*/,'');

function browser({hash='',saved={}}={}){
 const elements={
  '#app':{innerHTML:''},'#toast':{textContent:'',hidden:true},
  '#bestof':{value:'3'},'#turntimer':{value:'120'},
  '#joincode':{value:'ABCDEF'},'#agentname':{value:'Guest Agent'},'#teamjoin':{value:'BLUE'},
  '.connection':{className:'',textContent:''}
 };
 const historyCalls=[],sent=[],requests=[],sockets=[];
 const location={origin:'https://adityasuresh109.github.io',pathname:'/DecryptIT/',hash};
 const listeners={};
 const store=new Map(Object.entries(saved));
 const window={
  DECRYPTIT_WORKER_URL:'https://decryptit-agency.adityasuresh2110.workers.dev',
  history:{replaceState(a,b,url){historyCalls.push(url);location.hash=url.startsWith('#')?url:'';}},
  addEventListener(n,fn){(listeners['window:'+n]??=[]).push(fn);},
  open(){}
 };
 const document={
  querySelector(s){return elements[s]||null;},
  querySelectorAll(){return [];},
  addEventListener(n,fn){(listeners[n]??=[]).push(fn);},
  body:{classList:{remove(){},toggle(){}}},
  hidden:false
 };
 class WebSocket {
  static OPEN=1;
  constructor(url){this.url=url;this.readyState=0;sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.onopen?.();});}
  send(value){sent.push(JSON.parse(value));}
  close(){this.readyState=3;}
 }
 const response=(data)=>({ok:true,async json(){return data;}});
 const fetch=async (url,opts={})=>{
  requests.push({url,opts});
  if(url.endsWith('/health'))return response({ok:true,service:'decryptit',wordPacksReady:true});
  if(url.endsWith('/api/create'))return response({code:'ABCDEF',token:'host-token'});
  if(url.endsWith('/api/join'))return response({code:'ABCDEF',token:'guest-token',id:'seat1'});
  throw Error('Unexpected endpoint '+url);
 };
 const sandbox={window,document,location,localStorage:{getItem(k){return store.get(k)??null;},setItem(k,v){store.set(k,v);}},fetch,WebSocket,
  navigator:{clipboard:{writeText:async()=>{}}},qrSVG:()=>'<svg></svg>',
  setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},
  AbortController,Date,Math,Number,String,Error,URL,console,confirm:()=>true};
 const context=vm.createContext(sandbox);
 vm.runInContext(SOURCE,context,{filename:'frontend/app.js'});
 return {elements,store,historyCalls,sent,requests,sockets,location,
  click(act,more={}){
   const target={dataset:{act,...more}};
   for(const fn of listeners.click??[])fn({target:{closest(){return target;}},preventDefault(){}});
  },
  submit(id){for(const fn of listeners.submit??[])fn({target:{id},preventDefault(){}});},
  async idle(){for(let i=0;i<24;i++)await Promise.resolve();}
 };
}

test('landing performs health check and displays server ready rather than falsely offline',async()=>{
 const b=browser();await b.idle();
 assert.match(b.elements['#app'].innerHTML,/DecryptIT/);
 assert.equal(b.elements['.connection'].textContent,'● SERVER READY');
 assert.equal(b.requests[0].url,'https://decryptit-agency.adityasuresh2110.workers.dev/health');
});

test('create game stores token, replaces browser hash and authenticates without history helper collision',async()=>{
 const b=browser();b.click('create');await b.idle();
 assert.equal(b.store.get('agency:ABCDEF:host'),'host-token');
 assert.ok(b.historyCalls.includes('#room=ABCDEF'));
 assert.equal(b.sockets.length,1);
 assert.deepEqual(b.sent.find(m=>m.type==='auth'),{type:'auth',token:'host-token'});
 assert.doesNotMatch(b.elements['#toast'].textContent,/replaceState|history/);
});

test('joining a room stores seat and preserves hash, with no history-shadowing error',async()=>{
 const b=browser({hash:'#join=ABCDEF'});
 b.submit('join-form');await b.idle();
 assert.equal(b.store.get('agency:ABCDEF:player'),'guest-token');
 assert.ok(b.historyCalls.includes('#room=ABCDEF'));
 assert.deepEqual(b.sent.find(m=>m.type==='auth'),{type:'auth',token:'guest-token'});
});

test('refresh with saved seat reconnects and reuses same token without joining anew',async()=>{
 const b=browser({hash:'#room=ABCDEF',saved:{'agency:ABCDEF:player':'existing-token'}});await b.idle();
 assert.equal(b.sockets.length,1);
 assert.deepEqual(b.sent.find(m=>m.type==='auth'),{type:'auth',token:'existing-token'});
 assert.equal(b.requests.filter(r=>r.url.endsWith('/api/join')).length,0);
});

test('join link with saved seat reclaims the same seat',async()=>{
 const b=browser({hash:'#join=ABCDEF',saved:{'agency:ABCDEF:player':'saved-seat-token'}});await b.idle();
 assert.ok(b.historyCalls.includes('#room=ABCDEF'));
 assert.deepEqual(b.sent.find(m=>m.type==='auth'),{type:'auth',token:'saved-seat-token'});
});
