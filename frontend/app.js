import {qrSVG} from './qr.js';

const $=sel=>document.querySelector(sel);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CODE=/^[A-HJ-NP-Z2-9]{6}$/;
const MODE_LABEL={family:'Family Friendly',nsfw:'NSFW',mixed:'Mixed Bag'};
const COLOR_LABEL={RED:'Red',BLUE:'Blue',BYSTANDER:'Civilian',ASSASSIN:'Assassin'};
const noticeLabels={TIME_UP:'TIME’S UP — TURN PASSED',ASSASSIN:'ASSASSIN FOUND',CLUE_VOIDED:'CLUE VOIDED — TURN PASSED',WRONG_CARD:'WRONG CARD — TURN PASSED',BUDGET_EXHAUSTED:'NO GUESSES REMAIN — TURN PASSED',TEAM_DONE:'TEAM DONE — GUESSES BANKED',RESHUFFLED:'NEW BOARD — FRESH START'};
const base=(window.DECRYPTIT_WORKER_URL||window.AGENCY_WORKER_URL||'').replace(/\/$/,'');
const ui={mode:'family',bestOf:3,timer:120,rules:false,role:null,code:'',token:'',screen:null,snapshot:null,status:'offline',health:base?'checking':'unavailable',error:'',hostTool:null,clueWord:'',clueNumber:2,connection:null,retry:0,retryTimer:null,ping:null,serverSkew:0};
const hashInfo=()=>{const hash=decodeURIComponent(location.hash.slice(1));const i=hash.indexOf('=');return i>0?{kind:hash.slice(0,i),code:hash.slice(i+1).trim().toUpperCase()}:{kind:null,code:''};};
const urlFor=(code,kind='join')=>`${location.origin}${location.pathname}#${kind}=${code}`;
const storageKey=(code,role)=>`agency:${code}:${role}`;
const getSaved=(code,role)=>{try{return localStorage.getItem(storageKey(code,role));}catch{return null;}};
const save=(code,role,token)=>{try{localStorage.setItem(storageKey(code,role),token);}catch{showToast('Storage blocked — refresh may lose your seat. Allow site storage.');}};
function showToast(message){const el=$('#toast');if(!el)return;el.textContent=message;el.hidden=false;clearTimeout(showToast.timeout);showToast.timeout=setTimeout(()=>{el.hidden=true;},8500);}
function connectionIndicator(){
 if(!['host','player','tv','connecting'].includes(ui.role)){
  return ui.health==='ready'?['ready','● SERVER READY']:ui.health==='checking'?['checking','◌ CHECKING SERVER']:['offline','○ SERVER UNAVAILABLE'];
 }
 return ui.status==='online'?['online','● SECURE CHANNEL']:ui.status==='connecting'?['connecting','◌ CONNECTING…']:['offline','○ CONNECTION LOST'];
}
function refreshIndicator(){
 const label=$('.connection');if(!label)return;
 const [status,message]=connectionIndicator();label.className='connection '+status;label.textContent=message;
}
const brand=()=>{const [status,message]=connectionIndicator();return `<header class="masthead"><a class="brand" href="${esc(location.pathname)}">AD <span>ARCADE</span> / DecryptIT</a><span class="connection ${status}">${esc(message)}</span></header>`;};
async function checkServer(){
 if(!base){ui.health='unavailable';refreshIndicator();return;}
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),8000);
 try{
  const response=await fetch(`${base}/health`,{cache:'no-store',signal:abort.signal});
  const data=await response.json();
  ui.health=response.ok&&data.service==='decryptit'&&data.wordPacksReady===true?'ready':'unavailable';
 }catch{ui.health='unavailable';}
 finally{clearTimeout(timeout);refreshIndicator();}
}
const footer=()=>`<footer class="footer">AD ARCADE ORIGINAL · NOIR EDITION · ${esc(ui.snapshot?.code||'DecryptIT')}</footer>`;
const shell=(content,cls='')=>`<main class="wrap ${cls}">${brand()}${content}${footer()}</main>`;
const opts=(values,selected)=>values.map(([v,n])=>`<option value="${esc(v)}" ${String(v)===String(selected)?'selected':''}>${esc(n)}</option>`).join('');
const missing=()=>!base?`<div class="error">Game server is not configured. Set DECRYPTIT_WORKER_URL in frontend/config.js to the deployed Cloudflare Worker HTTPS URL.</div>`:'';
const heading=(text,sub)=>`<div class="eyebrow">${esc(sub)}</div><h1>${esc(text)}</h1>`;
function landing(){return shell(`<section class="hero"><div class="eyebrow">Top secret · word operations</div><h1>DecryptIT</h1><p>One clue. Twenty-five secrets. Your team decides what gets revealed.</p></section>
 <section class="pack-cards" aria-label="Word pack selection">${[
  ['family','◇','Family Friendly','Clean words. Sharp minds. Everybody plays.'],['nsfw','✦','NSFW','The after-dark file. Adults only.'],['mixed','◈','Mixed Bag','10–15 after-dark words, the rest clean. Every game different.']
 ].map(([id,sym,label,desc])=>`<button class="pack ${ui.mode===id?'selected':''}" data-act="mode" data-mode="${id}" aria-pressed="${ui.mode===id}"><span class="symbol">${sym}</span><b>${label}</b><small>${desc}</small></button>`).join('')}</section>
 <div class="panel"><div class="row between"><div><div class="eyebrow">Operation settings</div><h2>${MODE_LABEL[ui.mode]}</h2></div><span class="preview-tag">6–30 players</span></div>
 <div class="fields"><div><label for="bestof">Series</label><select class="select" id="bestof">${opts([[1,'Single game'],[3,'Best of 3'],[5,'Best of 5'],[7,'Best of 7']],ui.bestOf)}</select></div><div><label for="turntimer">Turn timer</label><select class="select" id="turntimer">${opts([[120,'120 seconds (default)'],[60,'60 seconds'],[90,'90 seconds'],[180,'180 seconds'],[0,'Off']],ui.timer)}</select></div></div>
 ${missing()}<div class="choice-row"><button class="btn" data-act="create" ${!base?'disabled':''}>CREATE GAME →</button><button class="btn secondary" data-act="how">HOW TO PLAY</button></div></div>
 <div class="panel subtle"><div class="eyebrow">Already recruited?</div><h3>Join your team</h3><div class="fields"><div><label for="joincode">Six-character room code</label><input class="input" id="joincode" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="6" placeholder="ABCDEF" value="${esc(ui.code)}"></div><div class="row" style="align-items:end"><button class="btn wide" data-act="join_form">JOIN ROOM →</button></div></div></div>${ui.rules?rules():''}`);}
function rules(){return `<section class="panel"><div class="row between"><h2>YOUR BRIEFING</h2><button class="btn ghost mini" data-act="how">CLOSE</button></div><p>Two teams share 25 secret words. Each team has one spymaster, who sees which words are red, blue, civilian or the deadly assassin. Only spymasters see the map.</p><p>The active spymaster gives one word and a number. Operatives discuss the clue out loud and vote on a word with their phones. A <b>strict majority of connected operatives</b> locks in each guess.</p><p>Correct words let you keep guessing. A wrong word ends your turn. Revealing the assassin loses the game instantly. Reveal your team's agents first to win.</p><p><b>Guess bank:</b> Unused guesses carry over to later turns. There is no extra +1 guess. <b>Memory:</b> Operatives never see old clues again, so remember them. The spymasters retain clue history.</p><p>During a turn, a majority can vote Done to bank unused guesses. The host can fix stalled votes and pause the game.</p></section>`;}
function joinForm(){return shell(`${heading('Your cover identity','Classified enrollment')}<section class="panel"><div class="eyebrow">Enter operation</div><p class="hint">Room ${esc(ui.code)} · Rejoining from this device automatically restores your seat when its token is saved.</p>${missing()}
 <form id="join-form" class="stack"><div><label for="agentname">Your name</label><input id="agentname" name="name" class="input" maxlength="24" required autocomplete="nickname" placeholder="Agent name"></div><div><label for="teamjoin">Preferred team</label><select class="select" id="teamjoin"><option value="RED">Red team</option><option value="BLUE">Blue team</option></select></div><button type="submit" class="btn">ENLIST →</button></form><p class="hint">The host can rebalance teams and select spymasters before starting.</p></section><button class="btn ghost" data-act="home">← Back</button>`);}
function connectionView(){return shell(`${heading('Opening the channel…',`Room ${ui.code}`)}<div class="panel"><p>${esc(ui.error||'Connecting to the server. Your seat is saved.')}</p><button class="btn secondary" data-act="reconnect">RECONNECT</button> <button class="btn ghost" data-act="home">BACK TO START</button></div>`);}
function rosterRow(p,host=false,phase='LOBBY'){
 const muted=p.removed?' style="opacity:.5"':'';
 const canEdit=host&&!p.removed;
 return `<div class="person"${muted}><div><span class="dot ${p.online?'on':''}"></span><b>${esc(p.name)}</b> ${p.role==='SPYMASTER'?'<span class="gold">✦ SPYMASTER</span>':''}${p.removed?'<small> · REMOVED</small>':''}<div><small>${p.online?'Connected':'Offline'}</small></div></div>${host?`<div class="row">${canEdit&&phase==='LOBBY'?`<button class="btn mini ghost" data-act="move" data-id="${p.id}" title="Move to other team">MOVE</button>`:''}${canEdit?`<button class="btn mini ghost" data-act="spy" data-id="${p.id}" ${p.role==='SPYMASTER'?'disabled':''}>SPY</button>`:''}<button class="btn mini ${p.removed?'secondary':'danger'}" data-act="${p.removed?'restore':'remove'}" data-id="${p.id}">${p.removed?'RESTORE':'REMOVE'}</button></div>`:''}</div>`;
}
function teams(roster,host,phase){return `<section class="roster">${['RED','BLUE'].map(t=>`<div class="team-block"><div class="team-title ${t}"><span>${t} TEAM</span><small>${roster.filter(p=>p.team===t&&!p.removed).length} agents</small></div>${roster.filter(p=>p.team===t).map(p=>rosterRow(p,host,phase)).join('')||'<p class="hint" style="padding:12px">No players yet</p>'}</div>`).join('')}</section>`;}
function timerText(s){if(s.timer===0)return '∞';let left=s.phase==='PAUSED'?s.remainingMs:(s.deadline?Math.max(0,s.deadline-(Date.now()+ui.serverSkew)):null);if(left===null||left===undefined)return '–:––';left=Math.ceil(Math.max(0,left)/1000);return `${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;}
function timerMarkup(s){const t=timerText(s);return `<span class="timer ${t!=='∞'&&t!=='–:––'&&Number(t.split(':')[0])*60+Number(t.split(':')[1])<=15?'urgent':''}" data-timer="true">${t}</span>`;}
function qr(code){try{return `<div class="qr">${qrSVG(urlFor(code))}</div>`;}catch{return `<p class="error">QR unavailable. Use code ${esc(code)}.</p>`;}}
function lobby(s){const host=!!s.you.host,player=s.roster.find(p=>p.id===s.you.id);return shell(`${heading(host?'Operations room':'Stand by, agent',`Operation ${s.code} · ${MODE_LABEL[s.mode]}`)}
 <section class="panel lobby-meta"><div class="room-code"><div class="eyebrow">Top secret access code</div><div class="code">${s.code}</div><div class="row" style="justify-content:center"><button class="btn secondary mini" data-act="copy">COPY JOIN LINK</button>${host?'<button class="btn ghost mini" data-act="tv">OPEN TV SCREEN</button>':''}</div></div>${qr(s.code)}</section>
 ${teams(s.roster,host,'LOBBY')}
 ${host?`<section class="panel"><h2>Director's console</h2><p class="hint">One spymaster and at least two operatives per team (6+ players). Both spymasters must be online.</p><div class="choice-row"><button class="btn secondary" data-act="balance">AUTO-BALANCE TEAMS</button><button class="btn" data-act="start">START GAME →</button></div><div class="fields" style="margin-top:18px"><div><label for="hostbest">Series</label><select id="hostbest" class="select">${opts([[1,'Best of 1'],[3,'Best of 3'],[5,'Best of 5'],[7,'Best of 7']],s.bestOf)}</select></div><div><label for="hosttimer">Timer</label><select id="hosttimer" class="select">${opts([[0,'Off'],[60,'60 sec'],[90,'90 sec'],[120,'120 sec'],[180,'180 sec']],s.timer)}</select></div></div></section>`:`<section class="panel"><p class="gold">${esc(player?.name||'Agent')} · ${esc(player?.team||'')} ${esc(player?.role||'')}</p><h2>Waiting for host…</h2><p class="hint">Keep this tab open. If the screen locks, reopen the page to reclaim your seat.</p></section>`}`);
}
function scoreboard(s){const revealed=t=>s.board.filter(c=>c.revealed&&c.color===t).length;const goal=t=>t===s.startingTeam?9:8;
 return `<div class="scoreboard">${['RED'].map(t=>`<div class="score-team ${t} ${s.turnTeam===t?'active':''}"><small>RED AGENTS</small><div class="big">${revealed(t)} <small>/ ${goal(t)}</small></div><small>Bank ${s.bank[t]} · Series ${s.series[t]}</small></div>`).join('')}<div class="score-mid"><div class="eyebrow">Game ${s.gameIndex}</div><div class="number">${s.series.RED} : ${s.series.BLUE}</div><small class="muted">Best of ${s.bestOf}</small></div>${['BLUE'].map(t=>`<div class="score-team ${t} ${s.turnTeam===t?'active':''}"><small>BLUE AGENTS</small><div class="big">${revealed(t)} <small>/ ${goal(t)}</small></div><small>Bank ${s.bank[t]} · Series ${s.series[t]}</small></div>`).join('')}</div>`;}
function banner(s){const clue=s.currentClue,who=s.turnTeam?`${COLOR_LABEL[s.turnTeam].toUpperCase()} TEAM`:'';
 return `<div class="clue-banner"><div class="row between"><span class="eyebrow">${who} · ${s.phase==='CLUE'?'WAITING FOR CLUE':s.phase==='GUESS'?'VOTING IN PROGRESS':s.phase==='PAUSED'?'OPERATIONS PAUSED':'GAME COMPLETE'}</span>${timerMarkup(s)}</div>
 <div class="clue-word">${clue?`${esc(clue.word)} <span class="gold">${clue.number}</span>`:s.phase==='GAME_OVER'?'MISSION COMPLETE':'Awaiting instructions…'}</div>
 <div class="stats"><span>Guesses left: <b class="gold">${s.guessesLeft}</b> (${s.bankInBudget} banked)</span><span>Red bank ${s.bank.RED}</span><span>Blue bank ${s.bank.BLUE}</span>${s.phase==='GUESS'?`<span>Majority ${s.needed} of ${s.connectedOperatives} online</span>`:''}</div></div>`;}
function wordGrid(s,role){const playing=s.phase==='GUESS'&&role==='operative'&&s.you.team===s.turnTeam;
 return `<div class="grid5" role="group" aria-label="Five by five word board">${s.board.map(c=>{
  const key=role==='spymaster'&&!c.revealed;
  const color=c.revealed||key?c.color:'';
  const voted=playing&&s.you.vote===c.id;
  const count=playing?s.voteCounts[String(c.id)]||0:0;
  return `<button type="button" class="word ${color} ${c.revealed?'revealed':''} ${key?'key':''} ${voted?'voted':''}" data-act="card" data-card="${c.id}" ${!playing&&!['host','tv'].includes(role)?'disabled':''} aria-pressed="${!!voted}" aria-label="${esc(c.word)}${count?`, ${count} votes`:''}"><span>${esc(c.word)}</span>${count?`<small>${count}/${s.needed}</small>`:''}${c.revealed?`<small>${esc(COLOR_LABEL[c.color]||c.color)}</small>`:''}</button>`;
 }).join('')}</div>`;}
function recentNotice(s){if(s.phase==='PAUSED')return `<div class="notice alert">${s.pauses.includes('HOST_OFFLINE')?'WAITING FOR HOST — game safely paused.':s.pauses.includes('SPYMASTER_OFFLINE')?'WAITING FOR SPYMASTER — game safely paused.':'GAME PAUSED — waiting for host to resume.'}</div>`;
 if(s.notice)return `<div class="notice ${s.notice.message==='TIME_UP'?'alert':''}">${esc(noticeLabels[s.notice.message]||s.notice.message)}</div>`;return '';
}
function clueHistory(s){return `<div class="panel"><div class="eyebrow">Eyes only · clue archive</div><h3>Clue history</h3><div class="history">${s.history?.length?s.history.map(h=>`<div class="history-entry"><span>${esc(COLOR_LABEL[h.team]||h.team)} · <b>${esc(h.word)} ${h.number}</b></span></div>`).join(''):'<p class="hint">No clues recorded yet.</p>'}</div></div>`;}
function spyControls(s){const myTurn=s.turnTeam===s.you.team&&s.phase==='CLUE';return `<div class="warning">EYES ONLY — YOU ARE A SPYMASTER. Never mirror this screen to the TV. Do not gesture, vote, or give extra hints.</div>
 <div class="panel"><div class="eyebrow">Spymaster · ${s.you.team}</div><h3>${myTurn?'Transmit a one-word clue':'Await your turn'}</h3><form id="clue-form" class="clue-form"><div><label for="clueword">Clue word</label><input id="clueword" class="input" value="${esc(ui.clueWord)}" maxlength="50" autocomplete="off" spellcheck="false" ${!myTurn?'disabled':''} placeholder="One word"></div><div><label for="cluenum">Number</label><select id="cluenum" class="select" ${!myTurn?'disabled':''}>${opts(Array.from({length:9},(_,i)=>[i+1,String(i+1)]),ui.clueNumber)}</select></div><button class="btn" type="submit" ${!myTurn?'disabled':''}>SEND CLUE</button></form><p class="hint">Clue content follows the honor system. The host can void an improper clue.</p></div>${clueHistory(s)}`;}
function operativeControls(s){const mine=s.turnTeam===s.you.team,guess=s.phase==='GUESS'&&mine;return `<div class="panel"><div class="eyebrow">Operative · ${s.you.team}</div><h3>${guess?'Discuss & vote':mine?'Awaiting your spymaster…':'Opponents are operating…'}</h3><p class="hint">${guess?'Tap any unrevealed word. You can change your vote until the team locks a strict majority. No past clues will be shown.':'Watch the board — you will be notified when it’s your turn.'}</p>
 <button class="btn wide ${s.you.vote==='DONE'?'secondary':'ghost'}" data-act="done" ${!guess?'disabled':''}>${s.you.vote==='DONE'?'✓ VOTED DONE':'DONE — BANK UNUSED GUESSES'} ${guess?`(${s.voteCounts.DONE||0}/${s.needed})`:''}</button>${guess&&s.you.vote!==null?'<button class="btn ghost wide" style="margin-top:10px" data-act="unvote">CLEAR MY VOTE</button>':''}</div>`;}
function hostControls(s){return `<aside class="aside"><div class="panel"><div class="eyebrow">Director's console</div><h2>Host controls</h2><p class="hint">These controls are private to the host. The TV screen displays only public data.</p>
 <div class="control-list"><button class="btn secondary" data-act="void" ${s.phase!=='GUESS'?'disabled':''}>VOID CLUE</button><button class="btn secondary" data-act="pause" ${s.phase==='PAUSED'&&s.pauses.includes('MANUAL')?'disabled':''}>PAUSE</button><button class="btn ghost" data-act="resume" ${!s.pauses.includes('MANUAL')?'disabled':''}>RESUME</button><button class="btn ghost" data-act="swap" ${!['CLUE','GUESS','PAUSED'].includes(s.phase)?'disabled':''}>${ui.hostTool==='swap'?'TAP WORD TO SWAP':'SWAP WORD'}</button><button class="btn ghost" data-act="force" ${s.phase!=='GUESS'?'disabled':''}>${ui.hostTool==='force'?'TAP WORD TO REVEAL':'FORCE-RESOLVE'}</button><button class="btn danger" data-act="reshuffle" ${!['CLUE','GUESS','PAUSED'].includes(s.phase)?'disabled':''}>RESHUFFLE</button><button class="btn ghost" data-act="tv">OPEN TV</button><button class="btn ghost" data-act="copy">COPY INVITE</button><button class="btn secondary wide" data-act="next" ${s.phase!=='GAME_OVER'||!!s.seriesWinner?'disabled':''}>NEXT GAME →</button><button class="btn ghost wide" data-act="new_series" ${!['LOBBY','GAME_OVER'].includes(s.phase)?'disabled':''}>RESET SERIES / LOBBY</button><button class="btn danger wide" data-act="end">END SESSION</button></div>
 ${ui.hostTool?`<p class="notice">${ui.hostTool==='swap'?'Select an unrevealed card on the board to replace its word.':'Select an unrevealed card to reveal it. This bypasses voting.'} <button class="btn mini ghost" data-act="cancel_tool">CANCEL</button></p>`:''}</div>
 <div class="panel"><h3>Roster recovery</h3><p class="hint">Restore a removed seat or reassign a spymaster without touching their device.</p>${s.roster.map(p=>rosterRow(p,true,s.phase)).join('')}</div>${clueHistory(s)}</aside>`;}
function winnerSection(s,host){if(s.phase!=='GAME_OVER')return '';
 const series=s.seriesWinner;
 return `<div class="ended"><div class="eyebrow">Case closed</div><h2>${esc(COLOR_LABEL[s.winner])} team wins.</h2><p>${s.winReason==='ASSASSIN'?'The assassin was uncovered. Instant loss for the guessing team.':'All agents for the winning team were revealed.'}</p>${series?`<h3 class="gold">${esc(COLOR_LABEL[series])} WINS THE SERIES!</h3>`:'<p>Next round awaits the director.</p>'}${host?`<div class="choice-row" style="justify-content:center"><button class="btn" data-act="${series?'new_series':'next'}">${series?'NEW SERIES':'NEXT GAME →'}</button></div>`:''}</div>`;}
function game(s){const role=s.you.host?'host':s.you.tv?'tv':s.you.role==='SPYMASTER'?'spymaster':'operative';document.body.classList.toggle('tv-mode',role==='tv');
 return shell(`<div class="row between"><div><div class="eyebrow">Operation ${esc(s.code)} · ${esc(MODE_LABEL[s.mode])}</div><h1 style="margin:5px 0 12px">DecryptIT</h1></div><span class="preview-tag">${s.phase==='PAUSED'?'HOLD':'GAME '+s.gameIndex}</span></div>
 ${scoreboard(s)}${recentNotice(s)}${banner(s)}${winnerSection(s,role==='host')}
 <div class="stage ${role==='tv'?'full':''}"><section><div class="panel" style="padding:clamp(8px,2vw,20px)">${wordGrid(s,role)}</div>${role==='operative'?operativeControls(s):''}${role==='spymaster'?spyControls(s):''}${role==='tv'?`<p class="hint">PUBLIC VIEW · NO SECRET KEY · Recruit with room code <b>${esc(s.code)}</b></p>`:''}</section>${role==='host'?hostControls(s):''}</div>`,role==='tv'?'tv-wrap':'');}
function removedScreen(s){return shell(`${heading('Seat temporarily inactive','Host recovery')}<div class="panel"><p>The host removed your seat. Your token remains saved; ask the host to restore you.</p><button class="btn secondary" data-act="reconnect">RECONNECT</button></div>`);}
function render(){const root=$('#app');if(!root)return;document.body.classList.remove('tv-mode');
 if(ui.snapshot){const s=ui.snapshot;root.innerHTML=s.you.removed?removedScreen(s):s.phase==='LOBBY'?lobby(s):s.phase==='ENDED'?shell('<h1>Session ended.</h1><p>Ask the host for a new room code.</p><button class="btn" data-act="home">BACK TO START</button>'):game(s);}
 else if(ui.role==='connecting'||ui.role==='host'||ui.role==='player'||ui.role==='tv')root.innerHTML=connectionView();
 else if(ui.role==='join')root.innerHTML=joinForm();else root.innerHTML=landing();
}
async function api(path,payload){if(!base)throw Error('Server not configured — ask the host to set the Worker URL.');let res;try{res=await fetch(`${base}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});}catch{throw Error('Cannot reach the game server. Check Wi-Fi or ask the host.');}
 let data;try{data=await res.json();}catch{throw Error('Game server sent an unreadable response. Retry.');}if(!res.ok)throw Error(data.error||'Server rejected request.');return data;}
async function create(){ui.bestOf=Number($('#bestof')?.value||3);ui.timer=Number($('#turntimer')?.value||120);ui.error='';ui.role='connecting';render();
 try{const r=await api('/api/create',{mode:ui.mode,bestOf:ui.bestOf,timer:ui.timer});save(r.code,'host',r.token);ui.role='host';ui.code=r.code;ui.token=r.token;window.history.replaceState(null,'',`#room=${r.code}`);connect();}catch(e){ui.role=null;ui.error=e.message;render();showToast(e.message);}
}
async function join(){const name=$('#agentname')?.value?.trim()||'';const team=$('#teamjoin')?.value||'RED';if(!name){showToast('Enter your name to join.');return;}
 ui.role='connecting';render();try{const r=await api('/api/join',{code:ui.code,name,team});save(r.code,'player',r.token);ui.role='player';ui.token=r.token;ui.code=r.code;window.history.replaceState(null,'',`#room=${r.code}`);connect();}catch(e){ui.role='join';ui.error=e.message;render();showToast(e.message);}
}
function destroy(){clearTimeout(ui.retryTimer);clearInterval(ui.ping);if(ui.connection){ui.connection.onclose=null;ui.connection.close();ui.connection=null;}}
function connect(){destroy();if(!base){ui.error='Server URL missing. Ask the host to configure the Cloudflare Worker.';ui.status='offline';render();return;}
 ui.status='connecting';ui.error='Connecting to room '+ui.code+'…';render();let socket;
 try{socket=new WebSocket(`${base.replace(/^http/,'ws')}/api/socket?code=${encodeURIComponent(ui.code)}`);}catch{ui.error='Cannot open a secure channel. Check the Worker URL.';scheduleRetry();return;}
 ui.connection=socket;
 socket.onopen=()=>{ui.status='connecting';socket.send(JSON.stringify({type:'auth',...(ui.role==='tv'?{role:'tv'}:{token:ui.token})}));};
 socket.onmessage=event=>{let m;try{m=JSON.parse(event.data);}catch{showToast('Unreadable server message — please reconnect.');return;}
  if(m.type==='ready'){ui.status='online';ui.retry=0;clearInterval(ui.ping);ui.ping=setInterval(()=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'ping'}));},10000);}
  if(m.type==='state'){ui.snapshot=m;ui.serverSkew=m.serverNow-Date.now();ui.status='online';ui.error='';render();}
  if(m.type==='error'){showToast(m.message||'Action not accepted. Try again.');}
 };
 socket.onerror=()=>{ui.status='offline';ui.error='Connection interrupted — retrying. You will keep your seat.';render();};
 socket.onclose=()=>{if(ui.connection!==socket)return;clearInterval(ui.ping);ui.status='offline';ui.error='Connection lost — your seat is saved. Tap RECONNECT or wait for automatic retry.';render();scheduleRetry();};
}
function scheduleRetry(){if(ui.retryTimer)clearTimeout(ui.retryTimer);ui.retryTimer=setTimeout(()=>connect(),Math.min(15000,1000*2**Math.min(ui.retry++,4)));}
function send(type,extra={}){if(!ui.connection||ui.connection.readyState!==WebSocket.OPEN||ui.status!=='online'){showToast('Connection lost — tap RECONNECT. Your seat is saved.');return;}ui.connection.send(JSON.stringify({type,...extra}));}
function hostAction(type,extra={}){if(!ui.snapshot?.you?.host)return;send(type,extra);}
function handleCard(cardId){const s=ui.snapshot;if(!s)return;
 if(s.you.host&&ui.hostTool){if(s.board[cardId]?.revealed){showToast('Choose an unrevealed word.');return;}const type=ui.hostTool==='swap'?'swap_word':'force_resolve';if(type==='force_resolve'&&!confirm(`Force-reveal ${s.board[cardId].word}? This cannot be undone.`))return;hostAction(type,{cardId});ui.hostTool=null;render();return;}
 if(s.you.role==='OPERATIVE'&&s.phase==='GUESS'&&s.turnTeam===s.you.team)send('vote',{cardId});
}
async function copyInvite(){const txt=urlFor(ui.code);try{await navigator.clipboard.writeText(txt);showToast('Join link copied.');}catch{showToast('Copy unavailable. Share this link: '+txt);}}
function handleAction(b){const a=b.dataset.act,id=b.dataset.id,s=ui.snapshot;
 switch(a){
  case 'mode':ui.mode=b.dataset.mode;render();break;
  case 'how':ui.rules=!ui.rules;render();break;
  case 'create':create();break;
  case 'join_form':ui.code=($('#joincode')?.value||'').toUpperCase().trim();if(!CODE.test(ui.code)){showToast('Enter a valid 6-character room code.');return;}ui.role='join';const existing=getSaved(ui.code,'player');if(existing){ui.token=existing;ui.role='player';window.history.replaceState(null,'',`#room=${ui.code}`);connect();}else render();break;
  case 'reconnect':connect();break;
  case 'home':destroy();ui.role=null;ui.snapshot=null;ui.status='offline';window.history.replaceState(null,'',location.pathname);render();checkServer();break;
  case 'copy':copyInvite();break;
  case 'tv':window.open(urlFor(ui.code,'tv'),'_blank','noopener');break;
  case 'balance':hostAction('auto_balance');break;
  case 'move':hostAction('assign_team',{playerId:id,team:s.roster.find(p=>p.id===id)?.team==='RED'?'BLUE':'RED'});break;
  case 'spy':hostAction('set_spymaster',{playerId:id});break;
  case 'remove':if(confirm('Remove this player? Host can restore the seat.'))hostAction('remove_player',{playerId:id});break;
  case 'restore':hostAction('restore_player',{playerId:id});break;
  case 'start':hostAction('start_game');break;
  case 'void':if(confirm('Void this clue and end the turn?'))hostAction('void_clue');break;
  case 'force':ui.hostTool=ui.hostTool==='force'?null:'force';render();break;
  case 'swap':ui.hostTool=ui.hostTool==='swap'?null:'swap';render();break;
  case 'cancel_tool':ui.hostTool=null;render();break;
  case 'pause':hostAction('pause');break;
  case 'resume':hostAction('resume');break;
  case 'reshuffle':if(confirm('Replace the entire board and key? Current game progress will be lost.'))hostAction('reshuffle');break;
  case 'next':hostAction('next_game');break;
  case 'new_series':if(confirm('Reset series score and return to lobby?'))hostAction('new_series');break;
  case 'end':if(confirm('End the entire party session? Every phone will be disconnected.'))hostAction('end_session');break;
  case 'card':handleCard(Number(b.dataset.card));break;
  case 'done':send('done');break;
  case 'unvote':send('unvote');break;
 }
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b){e.preventDefault();handleAction(b);}});
document.addEventListener('submit',e=>{if(e.target.id==='join-form'){e.preventDefault();join();}if(e.target.id==='clue-form'){e.preventDefault();const word=ui.clueWord.trim(),number=Number(ui.clueNumber);if(!word||/\s/.test(word)){showToast('Clue must be a single word without spaces.');return;}send('send_clue',{word,number});ui.clueWord='';}});
document.addEventListener('input',e=>{if(e.target.id==='clueword')ui.clueWord=e.target.value;if(e.target.id==='joincode')ui.code=e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,'').slice(0,6);});
document.addEventListener('change',e=>{if(e.target.id==='cluenum')ui.clueNumber=Number(e.target.value);if(e.target.id==='hostbest')hostAction('set_options',{bestOf:Number(e.target.value)});if(e.target.id==='hosttimer')hostAction('set_options',{timer:Number(e.target.value)});});
window.addEventListener('online',()=>{if(ui.role&&['host','player','tv'].includes(ui.role)&&ui.status!=='online')connect();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&['host','player','tv'].includes(ui.role)&&(!ui.connection||ui.connection.readyState!==WebSocket.OPEN))connect();});
setInterval(()=>{for(const node of document.querySelectorAll('[data-timer]')){if(!ui.snapshot)continue;const s=ui.snapshot,t=timerText(s);node.textContent=t;node.classList.toggle('urgent',t!=='∞'&&t!=='–:––'&&Number(t.split(':')[0])*60+Number(t.split(':')[1])<=15);}},400);
function init(){const h=hashInfo();if((h.kind==='room'||h.kind==='tv')&&CODE.test(h.code)){
  ui.code=h.code;ui.role=h.kind==='tv'?'tv':getSaved(h.code,'host')?'host':getSaved(h.code,'player')?'player':'join';ui.token=ui.role==='host'?getSaved(h.code,'host'):getSaved(h.code,'player');if(ui.role==='join')window.history.replaceState(null,'',`#join=${h.code}`);else connect();
 }else if(h.kind==='join'&&CODE.test(h.code)){ui.code=h.code;const token=getSaved(h.code,'player');if(token){ui.role='player';ui.token=token;window.history.replaceState(null,'',`#room=${h.code}`);connect();}else ui.role='join';}
 render();checkServer();}
init();
