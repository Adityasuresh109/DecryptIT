// The Agency — server-authoritative, framework-free domain rules.
export const TEAMS=['RED','BLUE'];
export const OPPONENT={RED:'BLUE',BLUE:'RED'};
export const PACKS=['family','nsfw','mixed'];
export const MIN_PLAYERS=6, MAX_PLAYERS=30;
export const error=(message)=>{throw new Error(message)};
export function shuffle(values,rand=Math.random){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export const randTeam=(rand=Math.random)=>rand()<.5?'RED':'BLUE';
export const normWord=s=>String(s).normalize('NFKC').trim().toLocaleLowerCase('en-US');
export function validatePacks(p){
  const f=p?.family, n=p?.nsfw;
  if(!Array.isArray(f)||!Array.isArray(n)||f.length!==400||n.length!==400)error('The curated word-packs.json is missing or incomplete (400 Family + 400 NSFW required).');
  for(const [tag,arr] of [['Family',f],['NSFW',n]]){
    if(arr.some(w=>typeof w!=='string'||!w.trim()||w.length>64))error(`${tag} pack contains an invalid word.`);
    if(new Set(arr.map(normWord)).size!==arr.length)error(`${tag} pack contains duplicate words.`);
  }
  return {family:[...f],nsfw:[...n]};
}
export function freshRoom({code,hostToken,mode='family',bestOf=3,timer=120,packs,rand=Math.random,now=Date.now()}){
  if(!PACKS.includes(mode))error('Choose Family Friendly, NSFW or Mixed Bag.');
  if(![1,3,5,7].includes(bestOf))error('Series length must be best-of 1, 3, 5 or 7.');
  if(![0,60,90,120,180].includes(timer))error('Choose a 60, 90, 120, 180 second timer, or off.');
  const words=validatePacks(packs);
  return {code,hostToken,mode,bestOf,timer,words,deck:{family:shuffle(words.family,rand),nsfw:shuffle(words.nsfw,rand)},cycles:{family:0,nsfw:0},players:[],phase:'LOBBY',pausedPhase:null,pauses:[],remainingMs:null,deadline:null,notice:null,board:[],turnTeam:null,startingTeam:null,gameIndex:0,history:[],currentClue:null,budget:0,newRemaining:0,bankInBudget:0,bank:{RED:0,BLUE:0},votes:{},series:{RED:0,BLUE:0},winner:null,winReason:null,createdAt:now};
}
export function livePlayers(r){return r.players.filter(p=>!p.removed)}
export function onlineOperatives(r,t){return livePlayers(r).filter(p=>p.team===t&&p.role==='OPERATIVE'&&p.online)}
export function majority(r,t){return Math.floor(onlineOperatives(r,t).length/2)+1;}
export function validation(r){
  const p=livePlayers(r);if(p.length<MIN_PLAYERS)error('Need at least 6 players: 1 spymaster and 2 operatives per team.');
  for(const t of TEAMS){
    const s=p.filter(x=>x.team===t&&x.role==='SPYMASTER');
    const op=p.filter(x=>x.team===t&&x.role==='OPERATIVE');
    if(s.length!==1)error(`${t} team needs exactly one spymaster.`);
    if(op.length<2)error(`${t} team needs at least two operatives.`);
    if(!s[0].online)error(`${t} spymaster is disconnected. Ask them to rejoin.`);
  }
}
function draw(r,category,avoid=new Set(),rand=Math.random){
  for(let i=0;i<2;i++){
    while(r.deck[category].length){const candidate=r.deck[category].pop();if(!avoid.has(normWord(candidate)))return candidate;}
    r.cycles[category]++;
    r.deck[category]=shuffle(r.words[category].filter(w=>!avoid.has(normWord(w))),rand);
  }
  error(`No unused ${category} words remain for this board.`);
}
export function newBoard(r,rand=Math.random){
  const nsfw=r.mode==='mixed'?10+Math.floor(rand()*6):r.mode==='nsfw'?25:0;
  const categories=shuffle([...Array(nsfw).fill('nsfw'),...Array(25-nsfw).fill('family')],rand);
  const seen=new Set();
  const picked=categories.map(source=>{const word=draw(r,source,seen,rand);seen.add(normWord(word));return {word,source};});
  if(seen.size!==25)error('Internal duplicate board-word error.');
  const start=randTeam(rand),other=OPPONENT[start];
  const colors=shuffle([...Array(9).fill(start),...Array(8).fill(other),...Array(7).fill('BYSTANDER'),'ASSASSIN'],rand);
  return {start,board:picked.map((w,i)=>({id:i,word:w.word,source:w.source,color:colors[i],revealed:false}))};
}
export function startGame(r,rand=Math.random,now=Date.now()){
  if(r.phase!=='LOBBY'&&r.phase!=='GAME_OVER')error('Start only from the lobby or finished game.');
  if(r.phase==='GAME_OVER'&&seriesWinner(r))error('Series is over. Start a new series to play again.');
  validation(r);const {start,board}=newBoard(r,rand);
  r.board=board;r.startingTeam=start;r.turnTeam=start;r.phase='CLUE';r.pauses=[];r.pausedPhase=null;
  r.gameIndex++;r.history=[];r.currentClue=null;r.budget=0;r.newRemaining=0;r.bankInBudget=0;r.bank={RED:0,BLUE:0};r.votes={};r.winner=null;r.winReason=null;r.notice=null;
  setClock(r,now);return r;
}
export function seriesWinner(r){return TEAMS.find(t=>r.series[t]>r.bestOf/2)||null;}
export function setClock(r,now=Date.now()){
  r.deadline=r.timer?now+r.timer*1000:null;
  r.remainingMs=r.timer?r.timer*1000:null;
}
export function sendClue(r,p,word,number,now=Date.now()){
  assertPhase(r,'CLUE');if(p.role!=='SPYMASTER'||p.team!==r.turnTeam)error('Only the current team’s spymaster can send a clue.');
  if(typeof word!=='string'||!/^[^\s]+$/u.test(word)||word.length>50)error('Clue must be one word, with no spaces (maximum 50 characters).');
  if(!Number.isInteger(number)||number<1||number>9)error('Clue number must be an integer from 1 through 9.');
  r.currentClue={word,number,team:r.turnTeam};
  r.history.push({...r.currentClue,at:now,game:r.gameIndex});
  r.newRemaining=number;r.bankInBudget=r.bank[r.turnTeam];r.budget=number+r.bankInBudget;r.bank[r.turnTeam]=0;
  r.phase='GUESS';r.votes={};setClock(r,now);r.notice=null;
}
export function assertPhase(r,phase){if(r.phase==='PAUSED')error('Game paused — wait for the host or spymaster.');if(r.phase!==phase)error(`Cannot do that during ${r.phase}.`);}
export function endTurn(r,now=Date.now(),reason='TURN_ENDED'){
  if(!['CLUE','GUESS'].includes(r.phase))error('There is no active turn to end.');
  if(r.phase==='GUESS')r.bank[r.turnTeam]+=r.budget;
  r.budget=0;r.newRemaining=0;r.bankInBudget=0;r.currentClue=null;r.votes={};r.turnTeam=OPPONENT[r.turnTeam];r.phase='CLUE';setClock(r,now);
  r.notice={message:reason,at:now};
}
export function finish(r,winner,reason,now=Date.now()){
  r.phase='GAME_OVER';r.winner=winner;r.winReason=reason;r.series[winner]++;r.deadline=null;r.remainingMs=null;
  r.votes={};r.budget=0;r.newRemaining=0;r.bankInBudget=0;r.pauses=[];r.pausedPhase=null;r.notice={message:reason,at:now};
}
export function resolveCard(r,cardId,now=Date.now()){
  assertPhase(r,'GUESS');if(!Number.isInteger(cardId)||cardId<0||cardId>=25)error('Choose a valid card.');
  const card=r.board[cardId];if(card.revealed)error('That word is already revealed.');
  card.revealed=true;r.budget--;if(r.newRemaining>0)r.newRemaining--;else r.bankInBudget--;if(r.budget<0)error('Internal budget underflow.');
  r.votes={};
  if(card.color==='ASSASSIN'){finish(r,OPPONENT[r.turnTeam],'ASSASSIN',now);return card;}
  for(const t of TEAMS)if(r.board.every(c=>c.color!==t||c.revealed)){finish(r,t,'ALL_AGENTS',now);return card;}
  if(card.color!==r.turnTeam){endTurn(r,now,'WRONG_CARD');return card;}
  if(r.budget===0)endTurn(r,now,'BUDGET_EXHAUSTED');
  return card;
}
export function vote(r,p,cardId,now=Date.now()){
  assertPhase(r,'GUESS');if(p.role!=='OPERATIVE'||p.team!==r.turnTeam)error('Only the current team’s operatives can vote.');
  if(!p.online)error('You are disconnected — rejoin to vote.');
  if(cardId!=='DONE'&&(!Number.isInteger(cardId)||!r.board[cardId]||r.board[cardId].revealed))error('Select an unrevealed word.');
  r.votes[p.id]=cardId;return evaluateVotes(r,now);
}
export function unvote(r,p){assertPhase(r,'GUESS');if(p.role!=='OPERATIVE'||p.team!==r.turnTeam)error('You cannot vote this turn.');delete r.votes[p.id];}
export function evaluateVotes(r,now=Date.now()){
  if(r.phase!=='GUESS')return null;
  const connected=onlineOperatives(r,r.turnTeam);if(!connected.length)return null;
  const totals=new Map();for(const p of connected){const id=r.votes[p.id];if(id===undefined)continue;totals.set(id,(totals.get(id)||0)+1);}
  for(const [cardId,count] of totals){if(count>=majority(r,r.turnTeam)){
    if(cardId==='DONE'){endTurn(r,now,'TEAM_DONE');return {done:true};}
    return {revealed:resolveCard(r,cardId,now)};
  }}return null;
}
export function setPause(r,reason,on,now=Date.now()){
  if(!['MANUAL','SPYMASTER_OFFLINE','HOST_OFFLINE'].includes(reason))error('Unknown pause reason.');
  if(['LOBBY','GAME_OVER'].includes(r.phase))return;
  const had=r.pauses.includes(reason);
  if(on&&!had){
    if(!r.pauses.length){r.pausedPhase=r.phase;r.remainingMs=r.deadline===null?null:Math.max(0,r.deadline-now);r.deadline=null;r.phase='PAUSED';}
    r.pauses.push(reason);
  } else if(!on&&had){
    r.pauses=r.pauses.filter(x=>x!==reason);
    if(!r.pauses.length){r.phase=r.pausedPhase;r.pausedPhase=null;r.deadline=r.remainingMs===null?null:now+r.remainingMs;}
  }
}
export function expireTimer(r,now=Date.now()){
  if(!r.deadline||r.phase==='PAUSED'||now<r.deadline)return false;
  if(r.phase==='CLUE'||r.phase==='GUESS'){endTurn(r,now,'TIME_UP');return true;}return false;
}
export function balance(r){
  if(r.phase!=='LOBBY')error('Teams can only be balanced in the lobby.');
  const active=livePlayers(r);active.forEach((p,i)=>{p.team=i%2?'BLUE':'RED';p.role='OPERATIVE';});
}
export function changeTeam(r,p,team){
  if(r.phase!=='LOBBY')error('Teams can only be changed in the lobby.');
  if(!TEAMS.includes(team))error('Choose the Red or Blue team.');p.team=team;p.role='OPERATIVE';
}
export function setSpymaster(r,p){
  if(!p||p.removed)error('Select an active player.');
  if(!['LOBBY','CLUE','GUESS','PAUSED'].includes(r.phase))error('Spymasters can only change during an active game or lobby.');
  if(r.players.filter(x=>!x.removed&&x.team===p.team).length<3)error('Need three players on that team to designate a spymaster.');
  for(const x of r.players)if(x.team===p.team)x.role='OPERATIVE';p.role='SPYMASTER';
}
export function swapWord(r,cardId,rand=Math.random){
  if(!['CLUE','GUESS','PAUSED'].includes(r.phase))error('Swap words during a game only.');
  const card=r.board[cardId];if(!card||card.revealed)error('Choose an unrevealed word to swap.');
  const seen=new Set(r.board.filter(x=>x.id!==cardId).map(x=>normWord(x.word)));
  card.word=draw(r,card.source,seen,rand);
  return card;
}
export function publicSnapshot(r,viewer){
  const isSpy=viewer?.role==='SPYMASTER'&&!viewer.removed;
  const isHost=viewer?.host===true;
  const isTV=viewer?.tv===true;
  const team=viewer?.team||null;
  const voteCounts={};
  for(const p of onlineOperatives(r,r.turnTeam)){
    const target=r.votes[p.id];if(target!==undefined)voteCounts[target]=(voteCounts[target]||0)+1;
  }
  const board=r.board.map(c=>({id:c.id,word:c.word,revealed:c.revealed,...(c.revealed?{color:c.color}:{}),...(isSpy?{color:c.color}:{})}));
  const payload={type:'state',serverNow:Date.now(),code:r.code,mode:r.mode,phase:r.phase,pausedPhase:r.pausedPhase,pauses:[...r.pauses],notice:r.notice,turnTeam:r.turnTeam,startingTeam:r.startingTeam,gameIndex:r.gameIndex,board,
    currentClue:r.currentClue,guessesLeft:r.budget,newRemaining:r.newRemaining,bankInBudget:r.bankInBudget,bank:{...r.bank},voteCounts,
    needed:r.turnTeam?majority(r,r.turnTeam):null,connectedOperatives:r.turnTeam?onlineOperatives(r,r.turnTeam).length:0,
    deadline:r.deadline,remainingMs:r.remainingMs,timer:r.timer,series:{...r.series},bestOf:r.bestOf,winner:r.winner,winReason:r.winReason,seriesWinner:seriesWinner(r),
    roster:r.players.map(p=>({id:p.id,name:p.name,team:p.team,role:p.role,online:p.online,removed:!!p.removed})),
    you:isHost?{host:true}:isTV?{tv:true}:viewer?{id:viewer.id,team,role:viewer.role,removed:!!viewer.removed,vote:r.votes[viewer.id]??null}:{tv:true}};
  if(isHost||isSpy)payload.history=r.history.map(({team,word,number,at})=>({team,word,number,at}));
  // Operatives and TV never receive previous clues or hidden colors, even in error payloads.
  return payload;
}
