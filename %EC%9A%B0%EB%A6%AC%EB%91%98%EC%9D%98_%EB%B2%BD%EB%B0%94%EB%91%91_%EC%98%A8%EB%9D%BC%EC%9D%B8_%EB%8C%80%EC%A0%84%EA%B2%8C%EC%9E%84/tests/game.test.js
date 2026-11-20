const {test}=require('node:test');
const assert=require('node:assert/strict');
const {newGame,apply,reachable,freeSides,regionScores,canAct}=require('../game');
test('starts with four fixed pieces (2 per side)',()=>{
 const g=newGame();assert.equal(g.pieces.length,4);assert.equal(g.pieces.filter(p=>p.p===0).length,2);assert.equal(g.pieces.filter(p=>p.p===1).length,2);assert.equal(g.current,0);
});
test('placement order red blue blue red, four per side after placement',()=>{
 const g=newGame();assert.throws(()=>apply(g,1,{type:'place',cell:0}),/차례/);
 for(const [p,c] of [[0,0],[1,6],[1,48],[0,42]])apply(g,p,{type:'place',cell:c});
 assert.equal(g.phase,'move');assert.equal(g.pieces.length,8);assert.equal(g.pieces.filter(z=>z.p===0).length,4);assert.equal(g.current,0);
 assert.throws(()=>apply(g,0,{type:'place',cell:1}),/배치/);
});
test('validates moving, walls, and current player',()=>{
 const g=newGame();for(const [p,c]of [[0,0],[1,6],[1,48],[0,42]])apply(g,p,{type:'place',cell:c});
 assert.throws(()=>apply(g,1,{type:'move',pieceId:0,to:7}),/차례/);
 assert.throws(()=>apply(g,0,{type:'move',pieceId:2,to:13}),/내 말/);
 assert.throws(()=>apply(g,0,{type:'move',pieceId:0,to:48}),/이동/);
 const z=g.pieces.find(x=>x.id===0),to=reachable(g,z).find(c=>c!==z.c);assert.notEqual(to,undefined);
 apply(g,0,{type:'move',pieceId:0,to});assert.equal(g.phase,'wall');
 assert.throws(()=>apply(g,0,{type:'wall',neighbor:48}),/벽/);
 const n=freeSides(g,to)[0];apply(g,0,{type:'wall',neighbor:n});assert.equal(g.phase,'move');assert.equal(g.current,1);assert.equal(Object.keys(g.walls).length,1);assert.equal(g.turns,1);
 assert.ok(!freeSides(g,to).includes(n));
});
test('connected regions grant ownership only when exclusively occupied',()=>{
 const g=newGame();assert.deepEqual(regionScores(g).scores,[0,0]);
 for(let y=0;y<7;y++)g.walls[`${y*7+2}-${y*7+3}`]=0;
 // Left part contains red only, right part contains blue only.
 const s=regionScores(g);assert.deepEqual(s.scores,[21,28]);
});
test('trapped pieces cannot stay still when they cannot move',()=>{
 const g=newGame(),z=g.pieces[0];for(const n of freeSides(g,z.c))g.walls[`${Math.min(z.c,n)}-${Math.max(z.c,n)}`]=0;
 assert.deepEqual(reachable(g,z),[]);assert.equal(canAct(g,0),true); // other red piece still mobile
});

test('a completed wall separates both colors, ends the game, and counts territory',()=>{
 const g=newGame();g.phase='wall';g.current=0;g.pieces[0].c=16;g.pending={pieceId:0,from:16,to:16};
 for(let y=0;y<7;y++)if(y!==2)g.walls[`${y*7+2}-${y*7+3}`]=0;
 apply(g,0,{type:'wall',neighbor:17});
 assert.equal(g.phase,'end');assert.deepEqual(g.result.scores,[21,28]);assert.equal(g.result.winner,1);
});
