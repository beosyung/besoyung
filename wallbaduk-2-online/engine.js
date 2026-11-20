// Cells are numbered row-major, from A1 (0) to G7 (48).
export const cells=Array.from({length:49},(_,i)=>i);
export const defaultStarts=[8,40,12,36];
export function game(starts=defaultStarts){
  if(!Array.isArray(starts)||starts.length!==4||new Set(starts).size!==4||!starts.every(i=>cells.includes(i)))throw Error('서로 다른 시작 칸 4개를 지정하세요.');
  return {phase:'setup',turn:0,placed:0,pieces:starts.map((at,i)=>({at,owner:Math.floor(i/2),shape:'round'})),walls:[],pending:null,round:1};
}
export function edge(a,b){return [Math.min(a,b),Math.max(a,b)].join('-')}
function step(at,dir){
  const x=at%7+[1,0,-1,0][dir],y=Math.floor(at/7)+[0,1,0,-1][dir];
  return x>=0&&x<7&&y>=0&&y<7?7*y+x:null;
}
function open(g,at,d){
  const to=step(at,d);
  return to!==null&&!g.walls.includes(edge(at,to))?to:null;
}
const dirs=[0,1,2,3];
export function walls(g,at){return dirs.map(d=>open(g,at,d)).filter(v=>v!==null)}
export function moves(g,p){
  const result=new Set(),empty=at=>at!==null&&!g.pieces.some(q=>q.at===at);
  for(const d of dirs){
    const mid=open(g,p.at,d);
    if(!empty(mid))continue;
    result.add(mid);
    for(const next of p.shape==='round'?[(d+1)%4,(d+3)%4]:[d]){
      const end=open(g,mid,next);
      if(empty(end))result.add(end);
    }
  }
  return [...result];
}
export function territory(g){
  const seen=new Set(),owners=Array(49).fill(null),scores=[0,0],largest=[0,0];
  let mixed=false;
  for(const start of cells){
    if(seen.has(start))continue;
    const group=[start];seen.add(start);
    for(const at of group)for(const n of walls(g,at))if(!seen.has(n)){seen.add(n);group.push(n)}
    const sides=new Set(g.pieces.filter(p=>group.includes(p.at)).map(p=>p.owner));
    if(sides.size===2)mixed=true;
    if(sides.size!==1)continue;
    const [owner]=sides;
    scores[owner]+=group.length;largest[owner]=Math.max(largest[owner],group.length);
    for(const at of group)owners[at]=owner;
  }
  return {owners,scores,largest,mixed};
}
function finish(g){
  const t=territory(g);
  if(!t.mixed){g.reason='영역 분리'}
  else if(!canMove(g,g.turn)){
    if(canMove(g,1-g.turn)){g.turn=1-g.turn;g.notice='이동할 말이 없어 차례를 넘겼습니다.';return}
    g.reason='양측 이동 불가';
  }else return;
  g.phase='done';
  const diff=t.scores[0]-t.scores[1]||t.largest[0]-t.largest[1];
  g.winner=diff===0?null:diff>0?0:1;
}
function canMove(g,side){return g.pieces.some(p=>p.owner===side&&moves(g,p).length)}
export function act(g,side,a){
  if(side!==g.turn)throw Error('상대방 차례입니다.');
  if(g.phase==='setup'&&a.type==='place'&&cells.includes(a.at)&&!g.pieces.some(p=>p.at===a.at)){
    g.pieces.push({at:a.at,owner:side,shape:'square'});g.placed++;
    g.turn=[0,1,1,0,0][g.placed];
    if(g.placed===4){g.phase='move';finish(g)}
  }else if(g.phase==='move'&&a.type==='move'){
    const p=g.pieces.find(p=>p.owner===side&&p.at===a.from);
    if(!p||!moves(g,p).includes(a.at))throw Error('이동할 수 없는 칸입니다.');
    p.at=a.at;g.pending=a.at;g.phase='wall';g.notice='';
  }else if(g.phase==='wall'&&a.type==='wall'&&walls(g,g.pending).includes(a.at)){
    g.walls.push(edge(g.pending,a.at));g.pending=null;g.phase='move';g.turn=1-side;g.round++;finish(g);
  }else throw Error('현재 단계에 허용되지 않는 선택입니다.');
}
