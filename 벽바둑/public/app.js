(()=>{'use strict';
const $=id=>document.getElementById(id), SVGNS='http://www.w3.org/2000/svg';
const N=7,S=100,colors=['#ff7187','#67c0ff'];
const pos=c=>'ABCDEFG'[c%7]+(Math.floor(c/7)+1);
const cxy=c=>[c%7,Math.floor(c/7)];
const edgeKey=(a,b)=>`${Math.min(a,b)}-${Math.max(a,b)}`;
const sideNames={[-7]:'위',[1]:'오른쪽',[7]:'아래',[-1]:'왼쪽'};
let socket=null, me={code:'',seat:-1,token:''}, state=null, selected=null, awaiting=false;
let mode='create', reconnectTimer=null, toastTimer=null, reactionTimer=null, receivedOnce=false;
const urlCode=(new URLSearchParams(location.search).get('room')||'').trim().toUpperCase();
if(/^[A-HJ-NP-Z2-9]{6}$/.test(urlCode)){
  mode='join';$('roomInput').value=urlCode;
  try{const tok=localStorage.getItem(`wallgo:${urlCode}`);if(tok){me.code=urlCode;me.token=tok;}}catch{}
}
function escapeHtml(str){return String(str).replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));}
function toast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2700);}
function socketIsOpen(){return socket&&socket.readyState===WebSocket.OPEN;}
function online(b){$('network').classList.toggle('offline',!b);$('networkText').textContent=b?'서버 연결됨':'연결 끊김 · 재시도 중';$('start').disabled=!b;$('start').textContent=mode==='create'?'♡ 방 만들기':'♡ 입장하기';}
function send(o){if(!socketIsOpen()){toast('서버 재연결 중이에요.');return false;}socket.send(JSON.stringify(o));return true;}
function saveToken(code,token){try{localStorage.setItem(`wallgo:${code}`,token);}catch{}}
function setLobbyMode(m){mode=m;$('modeCreate').classList.toggle('active',m==='create');$('modeJoin').classList.toggle('active',m==='join');$('joinFields').hidden=m!=='join';$('start').textContent=m==='create'?'♡ 방 만들기':'♡ 입장하기';$('lobbyError').textContent='';}
function connect(){clearTimeout(reconnectTimer);
  const protocol=location.protocol==='https:'?'wss:':'ws:';
  socket=new WebSocket(`${protocol}//${location.host}/socket`);
  socket.onopen=()=>{online(true);$('lobbyError').textContent='';if(me.code&&me.token)send({type:'join',code:me.code,token:me.token});};
  socket.onmessage=evt=>{let msg;try{msg=JSON.parse(evt.data);}catch{return;}
    if(msg.type==='joined'){
      me={code:msg.code,seat:msg.seat,token:msg.token};saveToken(me.code,me.token);
      history.replaceState(null,'',`${location.pathname}?room=${encodeURIComponent(me.code)}`);
      $('lobby').hidden=true;$('code').textContent=me.code;$('lobbyError').textContent='';receivedOnce=true;
    }else if(msg.type==='state'){
      state=msg;awaiting=false;if(msg.game.phase!=='move')selected=null;render();
    }else if(msg.type==='error'){
      awaiting=false;toast(msg.message);
      if(!receivedOnce || $('lobby').hidden===false){$('lobbyError').textContent=msg.message;}
      if(msg.message.includes('방을 찾을 수 없어요')||msg.message.includes('재접속 정보')){
        if(me.code){try{localStorage.removeItem(`wallgo:${me.code}`);}catch{}}
        me={code:'',seat:-1,token:''};state=null;receivedOnce=false;$('lobby').hidden=false;setLobbyMode('join');
      }
    }else if(msg.type==='reaction'){
      const player=state?.players?.[msg.seat]?.name||'상대방';
      $('reactionPopup').textContent=msg.emoji;
      $('reactionPopup').classList.remove('show');void $('reactionPopup').offsetWidth;
      $('reactionPopup').classList.add('show');clearTimeout(reactionTimer);
      reactionTimer=setTimeout(()=>$('reactionPopup').classList.remove('show'),1300);
      if(msg.seat!==me.seat)toast(`${player}님이 ${msg.emoji} 보냈어요!`);
    }
  };
  socket.onclose=()=>{
    online(false);awaiting=false;
    if(state)render();
    reconnectTimer=setTimeout(connect,1700);
  };
  socket.onerror=()=>{};
}
function neighbors(c){const [x,y]=cxy(c),list=[];if(y>0)list.push(c-7);if(x<6)list.push(c+1);if(y<6)list.push(c+7);if(x>0)list.push(c-1);return list;}
function freeSides(g,c){return neighbors(c).filter(n=>!(edgeKey(c,n) in g.walls));}
function occup(g,c,except=-1){return g.pieces.some(p=>p.c===c&&p.id!==except);}
function validFor(g,p){if(!p)return[];const visited=new Map([[p.c,0]]),q=[p.c];for(let i=0;i<q.length;i++){
  const u=q[i];if(visited.get(u)===2)continue;
  for(const n of freeSides(g,u)){if(occup(g,n,p.id)||visited.has(n))continue;visited.set(n,visited.get(u)+1);q.push(n);}
}return q.length<=1?[]:q.filter(c=>freeSides(g,c).length>0);}
function isReady(){return !!(state&&state.players.every(p=>p&&p.connected)&&socketIsOpen());}
function isMyTurn(){return isReady()&&state.game.current===me.seat&&state.game.phase!=='end'&&!awaiting;}
function action(a){if(!isMyTurn()){toast('내 차례이거나 상대방이 연결된 상태에서만 둘 수 있어요.');return;}
  awaiting=send({type:'action',action:a});
}
function cellClick(c){if(!isMyTurn())return;const g=state.game;
  if(g.phase==='place'){
    if(occup(g,c)){toast('이미 말이 있어요.');return;}
    action({type:'place',cell:c});return;
  }
  if(g.phase!=='move'||selected===null)return;
  const piece=g.pieces.find(p=>p.id===selected);
  if(piece&&validFor(g,piece).includes(c))action({type:'move',pieceId:selected,to:c});
  else toast('갈 수 없는 칸이에요.');
}
function pieceClick(id){if(!isMyTurn())return;const g=state.game;if(g.phase!=='move')return;
  const p=g.pieces.find(z=>z.id===id);if(!p||p.p!==me.seat){toast('내 색깔의 말을 선택해 주세요.');return;}
  if(selected===id){if(validFor(g,p).includes(p.c))action({type:'move',pieceId:p.id,to:p.c});else selected=null;}
  else{if(!validFor(g,p).length){toast('움직일 수 없는 말이에요.');return;}selected=id;}
  draw();
}
function svg(tag,attrs={},parent=$('board')){const el=document.createElementNS(SVGNS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));parent.appendChild(el);return el;}
function draw(){const board=$('board');board.replaceChildren();const g=state?.game;const area=state?.score?.area||Array(49).fill(-1);
  const valid=g?.phase==='move'&&selected!==null?validFor(g,g.pieces.find(p=>p.id===selected)):[];
  svg('rect',{x:0,y:0,width:700,height:700,fill:'#eed9b5'});
  for(let c=0;c<49;c++){
    const [x,y]=cxy(c);svg('rect',{x:x*S,y:y*S,width:S,height:S,fill:(x+y)%2===0?'#f0dcb9':'#e7cfa8'});
    if(area[c]>=0)svg('rect',{x:x*S+2,y:y*S+2,width:S-4,height:S-4,rx:5,fill:colors[area[c]],opacity:'.17'});
    const tile=svg('rect',{x:x*S+3,y:y*S+3,width:S-6,height:S-6,fill:'transparent',class:'tile'});
    tile.setAttribute('aria-label',`${pos(c)} 칸`);tile.addEventListener('click',()=>cellClick(c));
    if($('showHints').checked&&isMyTurn()&&valid.includes(c)){
      svg('circle',{cx:x*S+50,cy:y*S+50,r:23,fill:'#36b99d',opacity:'.22','pointer-events':'none'});
      svg('circle',{cx:x*S+50,cy:y*S+50,r:7,fill:'#23b59f','pointer-events':'none'});
    }
  }
  for(let i=0;i<=7;i++){
    svg('line',{x1:i*S,y1:0,x2:i*S,y2:700,stroke:'#b69a75','stroke-width':1,'pointer-events':'none'});
    svg('line',{x1:0,y1:i*S,x2:700,y2:i*S,stroke:'#b69a75','stroke-width':1,'pointer-events':'none'});
  }
  svg('rect',{x:3,y:3,width:694,height:694,rx:2,fill:'none',stroke:'#a77c51','stroke-width':6,'pointer-events':'none'});
  if(!g)return;
  for(const [k,owner]of Object.entries(g.walls)){
    const [a,b]=k.split('-').map(Number),[x,y]=cxy(a);const horizontal=b-a===7;
    const coords=horizontal?{x1:x*S+8,y1:(y+1)*S,x2:(x+1)*S-8,y2:(y+1)*S}:{x1:(x+1)*S,y1:y*S+8,x2:(x+1)*S,y2:(y+1)*S-8};
    svg('line',{...coords,stroke:'#72472e','stroke-width':16,'stroke-linecap':'round','pointer-events':'none'});
    svg('line',{...coords,stroke:colors[owner],'stroke-width':9,'stroke-linecap':'round','pointer-events':'none'});
  }
  for(const p of g.pieces){
    const c=g.pending?.pieceId===p.id?g.pending.to:p.c;
    const [x,y]=cxy(c),cx=x*S+50,cy=y*S+50;
    const group=svg('g',{class:'stone'});group.setAttribute('aria-label',`${p.p?'파랑':'빨강'} ${pos(c)} 말`);
    if(p.id===selected)svg('circle',{cx,cy,r:40,fill:'#33a58c',stroke:'#1c9b87','stroke-width':3,opacity:'.32'},group);
    svg('circle',{cx,cy:cy+4,r:32,fill:'#503b32',opacity:'.19'},group);
    svg('circle',{cx,cy,r:31,fill:colors[p.p],stroke:p.p===0?'#a83555':'#2470a5','stroke-width':4},group);
    svg('circle',{cx:cx-8,cy:cy-10,r:10,fill:'#fff',opacity:'.26'},group);
    group.addEventListener('click',e=>{e.stopPropagation();pieceClick(p.id);});
  }
  if(g.phase==='wall'&&g.pending&&isMyTurn()){
    const c=g.pending.to,[x,y]=cxy(c);
    for(const n of freeSides(g,c)){
      const d=n-c;let coords;
      if(d===-7)coords={x1:x*S+14,y1:y*S,x2:(x+1)*S-14,y2:y*S};
      else if(d===1)coords={x1:(x+1)*S,y1:y*S+14,x2:(x+1)*S,y2:(y+1)*S-14};
      else if(d===7)coords={x1:x*S+14,y1:(y+1)*S,x2:(x+1)*S-14,y2:(y+1)*S};
      else coords={x1:x*S,y1:y*S+14,x2:x*S,y2:(y+1)*S-14};
      svg('line',{...coords,stroke:'#21a996','stroke-width':18,opacity:'.3','stroke-linecap':'round','pointer-events':'none'});
      const target=svg('line',{...coords,stroke:'#16caac','stroke-width':10,'stroke-linecap':'round',class:'wall-choice'});
      target.setAttribute('aria-label',`${pos(c)} ${sideNames[d]} 벽 설치`);
      target.addEventListener('click',e=>{e.stopPropagation();action({type:'wall',neighbor:n});});
    }
  }
}
function render(){if(!state)return;const g=state.game,score=state.score.scores,pl=state.players;
  $('redName').textContent=pl[0]?.name||'빨강';$('blueName').textContent=pl[1]?.name||'상대방 대기';
  $('redOnline').textContent=pl[0]?.connected?'● 접속 중':'○ 접속 안 됨';$('blueOnline').textContent=pl[1]?.connected?'● 접속 중':pl[1]?'○ 접속 안 됨':'○ 입장 대기';
  $('redMe').textContent=me.seat===0?'나':'';$('blueMe').textContent=me.seat===1?'나':'';
  $('redScore').textContent=score[0];$('blueScore').textContent=score[1];
  $('turns').textContent=g.turns;$('wallCount').textContent=Object.keys(g.walls).length;
  $('log').innerHTML=g.log.map(s=>`<div>${escapeHtml(s)}</div>`).join('');
  let title='',description='',label='진행 중',tip='';
  if(g.phase==='end'){
    title='🏁 대국 종료!';description='최종 점수가 계산됐어요.';label='종료';tip='다시 대결하려면 두 사람 모두 동의해 주세요.';
  }else if(!isReady()){
    title=pl[1]?'상대방의 재접속을 기다리는 중':'💌 여자친구를 초대해 주세요';
    description=pl[1]?'상대방이 다시 접속하면 대국이 이어져요.':'상단 초대 링크를 복사해서 보내면 돼요.';label='대기 중';tip='모두 접속하면 게임을 시작할 수 있어요.';
  }else if(g.current!==me.seat){
    title=`${g.current===0?'🔴':'🔵'} ${pl[g.current].name} 차례`;description='상대방이 두고 있어요. 응원을 보내보세요 ♥';tip='상대방의 수가 실시간으로 표시됩니다.';
  }else if(g.phase==='place'){
    title=`${g.current===0?'🔴':'🔵'} 내 차례 · 말 배치`;description=`빈 칸을 눌러 말을 놓으세요 (${g.placementIndex+1}/4번째 배치)`;tip='배치는 빨강 → 파랑 → 파랑 → 빨강 순서예요.';
  }else if(g.phase==='move'){
    title=`${g.current===0?'🔴':'🔵'} 내 차례 · 말 이동`;description=selected===null?'내 말을 눌러 선택해 주세요.':'하이라이트된 칸을 누르세요. 같은 말을 다시 누르면 제자리에 머물러요.';tip='상하좌우로 0~2칸 이동한 뒤 반드시 벽을 설치해요.';
  }else{
    title=`${g.current===0?'🔴':'🔵'} 내 차례 · 벽 설치`;description='연두색으로 표시된 선 하나를 눌러 주세요.';tip='벽을 세워야 턴이 끝나고 상대방 차례가 됩니다.';
  }
  $('turnTitle').textContent=title;$('turnDesc').textContent=description;$('roundStatus').textContent=label;$('tip').textContent=tip;
  $('finalPanel').hidden=g.phase!=='end';
  if(g.phase==='end'){
    const w=g.result.winner;
    $('winner').textContent=w<0?'🤝 무승부!':w===me.seat?'🏆 내가 이겼어! ♡':`🏆 ${pl[w]?.name||'상대방'} 승리!`;
    $('finalScore').textContent=`🔴 ${g.result.scores[0]}칸 : ${g.result.scores[1]}칸 🔵`;
    const both=state.rematch,other=1-me.seat;
    $('rematchStatus').textContent=both[me.seat]?(both[other]?'새로운 판을 여는 중':'상대방의 재대결 수락을 기다리고 있어요.'):both[other]?'상대방이 재대결을 신청했어요. 수락해볼까요?':'둘 다 동의하면 새 판을 시작해요.';
    $('rematch').textContent=both[me.seat]?'재대결 신청 취소':both[other]?'♡ 재대결 수락하기':'♡ 다시 대결 신청';
  }
  for(const b of $('reactions').children)b.disabled=!isReady();
  draw();
}
async function copyText(text){try{await navigator.clipboard.writeText(text);toast('클립보드에 복사했어! 💌');}catch{
  const el=document.createElement('textarea');el.value=text;el.style.position='fixed';el.style.opacity='0';document.body.appendChild(el);el.select();
  const ok=document.execCommand('copy');el.remove();toast(ok?'복사했어! 💌':`직접 복사해 주세요: ${text}`);
}}
$('modeCreate').addEventListener('click',()=>setLobbyMode('create'));
$('modeJoin').addEventListener('click',()=>setLobbyMode('join'));
$('start').addEventListener('click',()=>{
  $('lobbyError').textContent='';
  if(!socketIsOpen()){$('lobbyError').textContent='서버 연결을 확인해 주세요.';return;}
  const name=$('nick').value.trim()||'플레이어';
  if(mode==='create')send({type:'create',name});
  else{const code=$('roomInput').value.trim().toUpperCase();if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code)){$('lobbyError').textContent='6자리 방 코드를 입력해 주세요.';return;}
    let token='';try{token=localStorage.getItem(`wallgo:${code}`)||'';}catch{}
    send({type:'join',code,name,token});
  }
});
$('roomInput').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,'').slice(0,6);});
$('nick').addEventListener('keydown',e=>{if(e.key==='Enter')$('start').click();});
$('roomInput').addEventListener('keydown',e=>{if(e.key==='Enter')$('start').click();});
$('copyCode').addEventListener('click',()=>{if(me.code)copyText(me.code);});
$('copyLink').addEventListener('click',()=>{if(me.code)copyText(`${location.origin}${location.pathname}?room=${encodeURIComponent(me.code)}`);});
$('showHints').addEventListener('change',draw);
$('rematch').addEventListener('click',()=>{if(state)send({type:'rematch',agree:!state.rematch[me.seat]});});
for(const b of $('reactions').children)b.addEventListener('click',()=>send({type:'reaction',emoji:b.textContent.trim()}));
// Keep an active WebSocket session responsive on hosts that idle-suspend free apps.
setInterval(()=>{if(socketIsOpen()&&me.code)send({type:'ping'});},120000);
setLobbyMode(mode);online(false);draw();
if(location.protocol==='file:'){$('lobbyError').textContent='온라인 버전은 HTML만 열면 작동하지 않아요. start_windows.bat으로 실행하거나 서버에 배포해 주세요.';}else connect();
})();
