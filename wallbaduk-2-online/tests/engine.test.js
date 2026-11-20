import test from 'node:test';
import assert from 'node:assert/strict';
import {game,moves,act,territory,edge} from '../engine.js';
test('시작 배치와 진행 순서',()=>{
 const g=game();assert.equal(g.pieces.length,4);assert.throws(()=>game([1,1,2,3]));
 for(const [i,side] of [0,1,1,0].entries()){
  assert.equal(g.turn,side);assert.throws(()=>act(g,side,{type:'place',at:8}));
  act(g,side,{type:'place',at:i});
 }
 assert.equal(g.phase,'move');assert.equal(g.turn,0);
 for(const owner of [0,1])for(const shape of ['round','square'])assert.equal(g.pieces.filter(p=>p.shape===shape&&p.owner===owner).length,2);
});
test('원형 회전과 직행, 우회 경로, 중간 장애물',()=>{
 const p={at:24,shape:'round'},g={pieces:[p],walls:[]};
 assert.deepEqual(moves(g,p).sort((a,b)=>a-b),[16,17,18,23,25,30,31,32]);
 g.walls.push(edge(24,17));assert.ok(moves(g,p).includes(18));
 g.pieces.push({at:25});assert.ok(!moves(g,p).includes(18));
 p.shape='square';assert.ok(!moves(g,p).includes(26));assert.ok(!moves(g,p).includes(10));assert.ok(moves(g,p).includes(22));
});
test('벽 양면 통행 차단, 영역 중복·빈 영역 제외',()=>{
 const g=game([0,1,5,6]);g.walls=[];
 for(let row=0;row<7;row++)for(const x of [1,3])g.walls.push(edge(row*7+x,row*7+x+1));
 const t=territory(g);assert.equal(t.mixed,false);assert.deepEqual(t.scores,[14,21]);assert.equal(t.owners[2],null);
});
