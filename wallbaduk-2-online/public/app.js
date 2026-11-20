import {game,cells,moves,walls} from '/engine.js';
const $=id=>document.getElementById(id),board=$('board'),ns=board.namespaceURI;
const coord=i=>'ABCDEFG'[i%7]+(1+Math.floor(i/7));
const colors=['빨강','파랑'],phases={setup:'사각 말 배치',move:'말 이동',wall:'벽 설치',done:'대국 종료'};
let s=null,selected=null,stream,connected=false,busy=false;
const demo=game();demo.pieces.push(...[10,22,26,38].map((at,i)=>({at,owner:i%2,shape:'square'})));demo.walls=['17-24','23-24','25-26','31-38'];
function svg(tag,attrs,parent=board){
 const el=document.createElementNS(ns,tag);
 for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);
 parent.append(el);return el;
}
function target(el,label,fn){
 el.setAttribute('aria-label',label);el.setAttribute('role','button');el.setAttribute('tabindex','0');
 el.onclick=fn;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fn()}};
}
function message(text){$('msg').textContent=text}
function myTurn(){return s&&connected&&!busy&&s.players.length===2&&s.side===s.game.turn}
function draw(){
 const g=s?.game||demo,active=myTurn(),prev=[...board.querySelectorAll('.token')].map(e=>e.style.transform);
 board.replaceChildren();
 const defs=svg('defs',{});
 for(const [id,c1,c2] of [['wood','#d8b887','#9f744d'],['r','#e68b75','#a34537'],['b','#78b2cb','#366b88']]){
  const grad=svg('linearGradient',{id,x2:'0.7',y2:'1'},defs);
  svg('stop',{offset:'0%','stop-color':c1},grad);svg('stop',{offset:'100%','stop-color':c2},grad);
 }
 svg('rect',{width:750,height:750,rx:10,fill:'url(#wood)'});
 const group=svg('g',{'pointer-events':'none'});
 for(let i=0;i<125;i++){const y=(i*71)%750;svg('path',{d:'M0 '+y+' q150 -4 370 0 t380 1',stroke:'#805c36','stroke-opacity':.085,fill:'none'},group)}
 const p=g.pieces.find(p=>p.at===selected),dest=active&&g.phase==='move'&&p?moves(g,p):[];
 for(const i of cells){
  const x=25+i%7*100,y=25+Math.floor(i/7)*100,owner=s?.area.owners[i];
  const rect=svg('rect',{x,y,width:100,height:100,fill:owner===0?'#bc574a':owner===1?'#4e8aab':'transparent','fill-opacity':.43,stroke:'#56402a','stroke-width':1.5});
  rect.dataset.at=i;
  if(active&&g.phase==='setup'&&!g.pieces.some(q=>q.at===i))target(rect,coord(i)+' 배치',()=>cmd('place',{at:i}));
  if(dest.includes(i)){svg('circle',{cx:x+50,cy:y+50,r:15,fill:'#364c3c','pointer-events':'none'});target(rect,coord(i)+' 이동',()=>cmd('move',{from:selected,at:i}))}
 }
 for(let i=0;i<7;i++)for(const [x,y,ch] of [[75+100*i,18,'ABCDEFG'[i]],[12,80+100*i,i+1]]){
  svg('text',{x,y,'text-anchor':'middle',fill:'#513d2a','font-size':16}).textContent=ch;
 }
 g.pieces.forEach((p,j)=>{
  const x=75+p.at%7*100,y=75+Math.floor(p.at/7)*100,move='translate('+x+'px,'+y+'px)';
  const el=svg('g',{class:'token','data-cell':p.at,'data-owner':p.owner,'data-shape':p.shape});
  el.style.transform=move;
  if(prev[j]&&prev[j]!==move)el.animate([{transform:prev[j]},{transform:move}],{duration:230});
  const attr={fill:'url(#'+(p.owner?'b':'r')+')',stroke:p.at===selected||g.pending===p.at?'#fff0ae':'#492e27','stroke-width':p.at===selected||g.pending===p.at?6:3};
  const round=p.shape==='round';
  svg(round?'circle':'rect',round?{r:33,...attr}:{x:-30,y:-30,width:60,height:60,rx:6,...attr},el);
  svg(round?'circle':'rect',round?{r:24,stroke:'#fff7',fill:'none'}:{x:-22,y:-22,width:44,height:44,rx:2,stroke:'#fff7',fill:'none'},el);
  if(active&&g.phase==='move'&&p.owner===s.side)target(el,coord(p.at)+' '+(round?'원형':'사각')+' 말 선택',()=>{selected=p.at;draw();if(!moves(g,p).length)message('이 말은 막혀 있습니다. 다른 말을 선택하세요.')});
 });
 function wall(a,b,candidate){
  const x=75+((a%7+b%7)/2)*100,y=75+((Math.floor(a/7)+Math.floor(b/7))/2)*100,h=Math.abs(a-b)===7;
  const el=svg('g',{class:candidate?'candidate':'newwall'});
  function bar(w,color){svg('line',{x1:x-(h?40:0),x2:x+(h?40:0),y1:y-(h?0:40),y2:y+(h?0:40),stroke:color,'stroke-width':w,'stroke-linecap':'round'},el)}
  bar(candidate?30:12,candidate?'transparent':'#483525');bar(candidate?12:5,candidate?'#fff2ab':'#f4d2a0');
  if(candidate)target(el,coord(a)+'와 '+coord(b)+' 사이에 벽 설치',()=>cmd('wall',{at:b}));
 }
 for(const k of g.walls){const [a,b]=k.split('-').map(Number);wall(a,b,false)}
 if(active&&g.phase==='wall')for(const b of walls(g,g.pending))wall(g.pending,b,true);
}
async function api(path,body){
 const res=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
 const data=await res.json();if(!res.ok)throw Error(data.error);return data;
}
function update(data){
 if(s&&s.code===data.code&&data.version<s.version)return;
 if(s?.version!==data.version)selected=null;
 s=data;document.body.classList.add('playing');$('room').hidden=false;$('lobby').hidden=true;
 const g=s.game,waiting=s.players.length<2;
 $('roomtag').textContent='대국실 '+s.code;$('tabletag').textContent=waiting?'시작 배치':'대국판 · '+g.round+'수';
 $('title').textContent=waiting?'상대를 기다리는 중':phases[g.phase];
 $('status').textContent=!connected?'서버 연결 중…':waiting?'초대 링크를 상대에게 보내주세요.':g.phase==='done'?(g.winner===null?'무승부':s.players[g.winner]+' 승리')+' · '+g.reason:
 (g.turn===s.side?'내 차례':'상대 차례')+' · '+(g.phase==='setup'?'빈칸에 사각 말을 놓으세요.':g.phase==='wall'?'말 옆의 밝은 경계를 선택하세요.':'말을 선택하고 표시된 칸을 누르세요.')+(g.notice?' '+g.notice:'');
 $('players').replaceChildren();
 for(let i=0;i<2;i++){
  const row=document.createElement('div');row.className='player';
  const name=document.createElement('b');name.style.color=i?'#94c7df':'#f29d88';name.textContent=colors[i]+' · '+(s.players[i]||'입장 대기')+(s.side===i?' (나)':'');
  const score=document.createElement('span');score.textContent=(s.players[i]?(s.online[i]?'접속':'연결 끊김')+' · ':'')+s.area.scores[i]+'집';row.append(name,score);$('players').append(row);
 }
 $('again').hidden=g.phase!=='done';$('again').disabled=s.votes.includes(s.side);$('again').textContent=s.votes.includes(s.side)?'상대 동의 대기':s.votes.length?'재대결 수락':'재대결 신청';tick();draw();
}
async function cmd(type,extra={}){
 if(busy)return;busy=true;message('');
 try{update(await api('/act',{code:s.code,version:s.version,type,...extra}))}catch(e){message(e.message)}finally{busy=false;draw()}
}
function enter(data){
 history.replaceState(null,'','/?room='+data.code);update(data);
 stream?.close();stream=new EventSource('/events?room='+data.code);
 stream.onmessage=e=>{connected=true;update(JSON.parse(e.data))};
 stream.onerror=()=>{connected=false;update(s)};
}
const room=new URLSearchParams(location.search).get('room');
$('nick').value=localStorage.getItem('wall-name')||'';
async function join(create){
 if(!$('nick').reportValidity())return;
 const name=$('nick').value.trim();localStorage.setItem('wall-name',name);
 const starts=$('starts').value.toUpperCase().trim().split(/[\s,]+/).map(v=>/^[A-G][1-7]$/.test(v)?'ABCDEFG'.indexOf(v[0])+7*(Number(v[1])-1):-1);
 if(busy)return;busy=true;
 try{const data=await api(create?'/create':'/join',{name,code:$('code').value,starts,timer:$('timer').checked});busy=false;message('');enter(data)}catch(e){message(e.message)}finally{busy=false}
}
$('form').onsubmit=e=>{e.preventDefault();join(!room&&e.submitter!==$('join'))};
$('guide').onclick=()=>document.querySelector('dialog').showModal();$('close').onclick=()=>document.querySelector('dialog').close();
$('again').onclick=()=>cmd('rematch');
async function copy(value){try{await navigator.clipboard.writeText(value);message('복사했습니다.')}catch{message(value)}}
$('copycode').onclick=()=>copy(s.code);$('invite').onclick=()=>copy(location.href);
function tick(){$('time').textContent=s?.deadline?'남은 시간 '+Math.max(0,Math.ceil((s.deadline-Date.now())/1000))+'초':''}
setInterval(tick,400);draw();
if(room){$('code').value=room;$('create').hidden=true;$('options').hidden=true;$('code').readOnly=true;
 try{enter(await api('/state?room='+encodeURIComponent(room)))}catch{if($('nick').value)await join(false);else message('초대받은 방입니다. 닉네임을 입력하고 입장하세요.')}}
