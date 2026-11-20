import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {moves,walls} from '../engine.js';

test('독립 연결 두 개로 실시간 완주·재접속·재대결',async(t)=>{
 const port=process.env.TEST_PORT||31837,host='http://127.0.0.1:'+port;
 const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port)},stdio:'ignore'});
 t.after(()=>server.kill());
 let ready=false;
 for(let i=0;i<100&&!ready;i++){try{ready=(await fetch(host+'/health')).ok}catch{await delay(20)}}
 assert.ok(ready);
 function participant(){
  let cookie='';
  return {
   async request(path,body){
    const response=await fetch(host+path,{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
    if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return response.json();
   },
   async watch(code){
    const controller=new AbortController();
    const response=await fetch(host+'/events?room='+code,{headers:{Cookie:cookie},signal:controller.signal});
    let latest=null;const reader=response.body.getReader(),decoder=new TextDecoder();
    (async()=>{let buffer='';
      try{while(true){
       const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});
       let end;while((end=buffer.indexOf('\n\n'))>=0){
        const event=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(event.startsWith('data: '))latest=JSON.parse(event.slice(6));
       }
      }}catch(e){if(!controller.signal.aborted)throw e}
    })();
    return {close:()=>controller.abort(),async wait(predicate){
     for(let i=0;i<200;i++){if(latest&&predicate(latest))return latest;await delay(5)}
     throw Error('동기화 시간 초과');
    }};
   }
  };
 }
 const players=[participant(),participant()],outside=participant();
 const {code}=await players[0].request('/create',{name:'선'});
 assert.match(code,/^\d{6}$/);
 let state=await players[1].request('/join',{code,name:'후'});
 assert.ok((await outside.request('/join',{code,name:'셋'})).error);
 const isolated=await outside.request('/create',{name:'다른 방'});assert.notEqual(isolated.code,code);
 const feeds=await Promise.all(players.map(p=>p.watch(code)));
 t.after(()=>feeds.forEach(f=>f.close()));
 async function send(side,action){
  state=await players[side].request('/act',{code,version:state.version,...action});
  assert.ok(!state.error,state.error);
  for(const feed of feeds){const seen=await feed.wait(x=>x.version===state.version);assert.deepEqual(seen.game,state.game);assert.deepEqual(seen.area,state.area)}
 }
 async function reject(side,action){
  const res=await players[side].request('/act',{code,version:state.version,...action});assert.ok(res.error);
  assert.deepEqual((await players[side].request('/state?room='+code)).game,state.game);
 }
 await reject(1,{type:'place',at:0});
 for(const [at,side] of [0,1,1,0].entries())await send(side,{type:'place',at});
 await reject(0,{type:'move',from:8,at:48});
 let count=0,seed=29;
 function pick(array){seed=(1664525*seed+1013904223)>>>0;return array[Math.floor(seed/4294967296*array.length)]}
 while(state.game.phase!=='done'){
  const g=state.game,side=g.turn;
  const piece=pick(g.pieces.filter(p=>p.owner===side&&moves(g,p).length));
  const oldVersion=state.version;
  await send(side,{type:'move',from:piece.at,at:pick(moves(g,piece))});
  await reject(side,{type:'wall',at:-1});
  if(count===0){
   feeds[1].close();await feeds[0].wait(x=>!x.online[1]);
   assert.deepEqual((await players[1].request('/state?room='+code)).game,state.game);
   feeds[1]=await players[1].watch(code);await feeds[0].wait(x=>x.online[1]);
   await reject(side,{version:oldVersion,type:'move',from:piece.at,at:1});
  }
  await send(side,{type:'wall',at:pick(walls(state.game,state.game.pending))});
  assert.equal(state.game.walls.length,++count);assert.ok(count<=84);
 }
 assert.equal(state.area.mixed,false);
 t.diagnostic('종료 '+count+'수, '+state.area.scores.join(' 대 '));
 await send(0,{type:'rematch'});await send(1,{type:'rematch'});
 assert.equal(state.game.pieces.length,4);assert.equal(state.game.walls.length,0);
 assert.deepEqual((await outside.request('/state?room='+isolated.code)).game,isolated.game);
});
