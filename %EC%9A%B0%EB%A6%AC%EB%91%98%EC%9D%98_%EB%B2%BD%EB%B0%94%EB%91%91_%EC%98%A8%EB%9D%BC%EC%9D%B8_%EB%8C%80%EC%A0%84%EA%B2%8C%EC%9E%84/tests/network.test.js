const {test}=require('node:test');
const assert=require('node:assert/strict');
const {server,rooms}=require('../server');
const baseOpen=async()=>{
 if(!server.listening)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const addr=`ws://127.0.0.1:${server.address().port}/socket`;
 const ws=new WebSocket(addr);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});return ws;
};
const next=(ws,pred=()=>true,ms=4000)=>new Promise((resolve,reject)=>{
 const t=setTimeout(()=>{ws.removeEventListener('message',got);reject(Error('Timed out waiting for message'));},ms);
 function got(event){let m;try{m=JSON.parse(event.data);}catch{return;}if(pred(m)){clearTimeout(t);ws.removeEventListener('message',got);resolve(m);}}
 ws.addEventListener('message',got);
});
const say=(ws,o)=>ws.send(JSON.stringify(o));
test('2 independent WebSockets share a room, turns and reconnects, third player rejected',async(t)=>{
 t.after(()=>{rooms.clear();server.close();});
 const red=await baseOpen(),blue=await baseOpen(),third=await baseOpen();
 t.after(()=>{red.close();blue.close();third.close();});
 const welcome=next(red,m=>m.type==='joined');say(red,{type:'create',name:'나'});
 const r=await welcome;assert.equal(r.seat,0);assert.match(r.code,/^[A-HJ-NP-Z2-9]{6}$/);
 const blueWelcome=next(blue,m=>m.type==='joined');say(blue,{type:'join',code:r.code,name:'여자친구'});
 const b=await blueWelcome;assert.equal(b.seat,1);
 const state=next(red,m=>m.type==='state'&&m.players[1]?.connected);const sync=await state;
 assert.equal(sync.players[1].name,'여자친구');assert.equal(sync.game.pieces.length,4);
 const denied=next(third,m=>m.type==='error');say(third,{type:'join',code:r.code,name:'훼방꾼'});assert.match((await denied).message,/2명/);
 const badMove=next(blue,m=>m.type==='error');say(blue,{type:'action',action:{type:'place',cell:6}});assert.match((await badMove).message,/차례/);
 for(const [seat,cell] of [[0,0],[1,6],[1,48],[0,42]]){
   const acting=seat?blue:red,other=seat?red:blue;
   const u1=next(other,m=>m.type==='state'&&m.game.pieces.some(z=>z.c===cell));
   say(acting,{type:'action',action:{type:'place',cell}});await u1;
 }
 const g=rooms.get(r.code).game;assert.equal(g.pieces.length,8);assert.equal(g.phase,'move');
 const pending=next(blue,m=>m.type==='state'&&m.game.phase==='wall');
 say(red,{type:'action',action:{type:'move',pieceId:0,to:7}});assert.equal((await pending).game.pending.to,7);
 const wall=next(blue,m=>m.type==='state'&&m.game.turns===1);
 say(red,{type:'action',action:{type:'wall',neighbor:8}});assert.equal((await wall).game.current,1);
 // Blue reconnects via secret token, preserving the same seat and game.
 const blue2=await baseOpen();t.after(()=>blue2.close());
 const resume=next(blue2,m=>m.type==='joined');say(blue2,{type:'join',code:r.code,token:b.token});assert.equal((await resume).seat,1);
 const after=next(red,m=>m.type==='state'&&m.players[1].connected);assert.equal((await after).game.turns,1);
 // Simulate a finished game, then verify both players must agree to replay.
 const room=rooms.get(r.code);room.game.phase='end';room.game.result={winner:0,scores:[30,19],largest:[30,19]};
 const req=next(red,m=>m.type==='state'&&m.rematch[1]===true);
 say(blue2,{type:'rematch',agree:true});assert.equal((await req).game.phase,'end');
 const newRound=next(blue2,m=>m.type==='state'&&m.game.phase==='place'&&m.game.pieces.length===4);
 say(red,{type:'rematch',agree:true});assert.equal((await newRound).game.current,0);
});
