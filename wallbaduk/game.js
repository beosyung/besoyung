'use strict';
// Server-authoritative two-player Wall Go rules.
const N = 7;
const SEQUENCE = [0, 1, 1, 0];
function xy(c) { return [c % N, Math.floor(c / N)]; }
function neighbors(c) {
  const [x,y] = xy(c), r = [];
  if (y>0) r.push(c-N); if (x<N-1) r.push(c+1);
  if (y<N-1) r.push(c+N); if (x>0) r.push(c-1);
  return r;
}
function key(a,b) { return `${Math.min(a,b)}-${Math.max(a,b)}`; }
function newGame() {
  return {
    phase:'place', current:0, placementIndex:0,
    // Symmetric default positions for two preset stones per side.
    pieces:[{id:0,p:0,c:14},{id:1,p:0,c:28},{id:2,p:1,c:20},{id:3,p:1,c:34}],
    walls:{}, pending:null, turns:0, passes:0, result:null,
    log:['게임 생성 · 각 색의 말 2개가 미리 배치되어 있어요.']
  };
}
function occupied(g, cell, exceptId=-1) { return g.pieces.some(z=>z.c===cell && z.id!==exceptId); }
function freeSides(g, c) { return neighbors(c).filter(n => !(key(c,n) in g.walls)); }
function reachable(g, piece) {
  if (!piece || !g.pieces.includes(piece)) return [];
  const start=piece.c;
  const d=new Map([[start,0]]), queue=[start];
  for(let i=0;i<queue.length;i++) {
    const c=queue[i], dist=d.get(c);
    if(dist===2) continue;
    for(const n of freeSides(g,c)) {
      if(occupied(g,n,piece.id) || d.has(n)) continue;
      d.set(n,dist+1);queue.push(n);
    }
  }
  // A 0-step wall action is allowed only for a piece that can actually move.
  if(queue.length===1) return [];
  return queue.filter(c=>freeSides(g,c).length>0);
}
function canAct(g,p) { return g.pieces.some(z=>z.p===p && reachable(g,z).length>0); }
function regionScores(g) {
  const visited=new Set(), regions=[], area=Array(N*N).fill(-1), scores=[0,0], largest=[0,0];
  for(let c=0;c<N*N;c++){
    if(visited.has(c))continue;
    const cells=[],queue=[c],owners=new Set();visited.add(c);
    for(let i=0;i<queue.length;i++){
      const u=queue[i];cells.push(u);
      for(const z of g.pieces) if(z.c===u)owners.add(z.p);
      for(const v of freeSides(g,u))if(!visited.has(v)){visited.add(v);queue.push(v);}
    }
    const ps=[...owners];regions.push({size:cells.length,owners:ps,cells});
    if(ps.length===1){const p=ps[0];scores[p]+=cells.length;largest[p]=Math.max(largest[p],cells.length);for(const u of cells)area[u]=p;}
  }
  return {scores,largest,regions,area};
}
function endGame(g, special=false){
  const s=regionScores(g);
  if(special){ // All pieces immobile in shared regions: count each occupied square.
    for(const region of s.regions){
      if(region.owners.length>1){
        for(const cell of region.cells){const z=g.pieces.find(p=>p.c===cell);if(z){s.scores[z.p]++;s.largest[z.p]=Math.max(s.largest[z.p],1);s.area[cell]=z.p;}}
      }
    }
  }
  const winner=s.scores[0]===s.scores[1]?-1:s.scores[0]>s.scores[1]?0:1;
  g.phase='end';g.current=-1;g.pending=null;g.result={scores:s.scores,largest:s.largest,winner};
  g.log.unshift(winner<0?'🤝 무승부!':`🏆 ${winner===0?'빨강':'파랑'} 승리!`);
}
function turnAfterWall(g){
  if(!regionScores(g).regions.some(r=>r.owners.length>1)){endGame(g);return;}
  g.current=1-g.current;
  if(canAct(g,g.current))return;
  g.passes++;g.log.unshift(`${g.current===0?'빨강':'파랑'} 자동 통과`);
  g.current=1-g.current;
  if(!canAct(g,g.current))endGame(g,true);
}
function apply(g,p,action){
  if(g.phase==='end')throw Error('대국이 이미 종료됐어요.');
  if(![0,1].includes(p) || p!==g.current)throw Error('지금은 내 차례가 아니에요.');
  const kind=action && action.type;
  if(kind==='place'){
    if(g.phase!=='place')throw Error('말을 배치하는 단계가 아니에요.');
    const c=action.cell;
    if(!Number.isInteger(c)||c<0||c>=49||occupied(g,c))throw Error('말을 놓을 수 없는 칸이에요.');
    const piece={id:g.pieces.length,p,c};g.pieces.push(piece);
    const [x,y]=xy(c);g.log.unshift(`${p===0?'빨강':'파랑'} · ${'ABCDEFG'[x]}${y+1}에 말 배치`);
    g.placementIndex++;
    if(g.placementIndex===SEQUENCE.length){g.phase='move';g.current=0;}
    else g.current=SEQUENCE[g.placementIndex];
  }else if(kind==='move'){
    if(g.phase!=='move')throw Error('지금은 말을 움직일 수 없어요.');
    const z=g.pieces.find(x=>x.id===action.pieceId && x.p===p);
    if(!z)throw Error('내 말을 선택해 주세요.');
    if(!Number.isInteger(action.to)||!reachable(g,z).includes(action.to))throw Error('그 칸으로 이동할 수 없어요.');
    g.pending={pieceId:z.id,from:z.c,to:action.to};g.phase='wall';
  }else if(kind==='wall'){
    if(g.phase!=='wall'||!g.pending)throw Error('먼저 말을 이동해 주세요.');
    const from=g.pending.to,to=action.neighbor;
    if(!Number.isInteger(to)||!freeSides(g,from).includes(to))throw Error('그곳에 벽을 세울 수 없어요.');
    const piece=g.pieces.find(z=>z.id===g.pending.pieceId);
    const old=g.pending.from;piece.c=from;g.walls[key(from,to)]=p;
    g.pending=null;g.phase='move';g.turns++;
    const [x,y]=xy(from), [ox,oy]=xy(old);
    g.log.unshift(`${p===0?'빨강':'파랑'} · ${'ABCDEFG'[ox]}${oy+1} → ${'ABCDEFG'[x]}${y+1} 이동 후 벽 설치`);
    turnAfterWall(g);
  }else throw Error('알 수 없는 행동이에요.');
  g.log=g.log.slice(0,7);
  return g;
}
module.exports={N,xy,neighbors,key,newGame,freeSides,reachable,regionScores,canAct,apply};
