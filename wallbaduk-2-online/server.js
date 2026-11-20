import http from 'node:http';
import {randomInt,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {act,game,moves,walls,territory,defaultStarts} from './engine.js';
const rooms=new Map(),clients=new Map();
const pick=list=>list[randomInt(list.length)];
function presence(r){return r.players.map(p=>Boolean(clients.get(p.key)?.size))}
function state(r,i){return {code:r.code,side:i,version:r.version,players:r.players.map(p=>p.name),online:presence(r),game:r.g,area:territory(r.g),votes:r.votes,deadline:r.deadline,timer:r.timer}}
function publish(r){
  r.last=Date.now();
  r.players.forEach((p,i)=>{for(const c of clients.get(p.key)||[])c.write('data: '+JSON.stringify(state(r,i))+'\n\n')});
}
function clock(r){r.deadline=r.timer&&r.players.length===2&&['move','wall'].includes(r.g.phase)?Date.now()+90000:null}
function timeout(r){
  const g=r.g;
  if(g.phase==='move'){
    const p=pick(g.pieces.filter(p=>p.owner===g.turn&&moves(g,p).length));
    act(g,g.turn,{type:'move',from:p.at,at:pick(moves(g,p))});
  }
  act(g,g.turn,{type:'wall',at:pick(walls(g,g.pending))});r.version++;clock(r);publish(r);
}
setInterval(()=>{
 for(const r of rooms.values()){
   if(r.deadline&&Date.now()>=r.deadline)timeout(r);
   if(!presence(r).some(Boolean)&&Date.now()-r.last>86400000){rooms.delete(r.code);for(const p of r.players)clients.delete(p.key)}
   else for(const p of r.players)for(const c of clients.get(p.key)||[])c.write(': live\n\n');
 }
},1000).unref();
const assets={'/':['public/index.html','text/html'],'/app.js':['public/app.js','text/javascript'],'/style.css':['public/style.css','text/css'],'/engine.js':['engine.js','text/javascript']};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 function json(status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value))}
 try{
  if(req.method==='GET'&&Object.hasOwn(assets,url.pathname)){
    const [file,type]=assets[url.pathname];res.setHeader('Content-Type',type+'; charset=utf-8');res.end(await readFile(new URL(file,import.meta.url)));return;
  }
  if(url.pathname==='/health'){json(200,{ok:true});return}
  let body={};
  if(req.method==='POST'){
   if(!req.headers['content-type']?.startsWith('application/json'))throw Error('요청 형식을 확인하세요.');
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096)throw Error('요청이 너무 큽니다.')}
   body=JSON.parse(raw);if(!body||typeof body!=='object')throw Error('잘못된 요청입니다.');
  }
  const code=String(body.code||url.searchParams.get('room')||'');
  let r=rooms.get(code);
  const key=(req.headers.cookie||'').split('; ').find(s=>s.startsWith('seat_'+code+'='))?.split('=')[1];
  let i=r?.players.findIndex(p=>p.key===key)??-1;
  if(req.method==='POST'&&['/create','/join'].includes(url.pathname)){
   const name=String(body.name||'').trim().slice(0,16);if(!name)throw Error('닉네임을 입력하세요.');
   if(url.pathname==='/create'){
    let id;do{id=String(randomInt(1000000)).padStart(6,'0')}while(rooms.has(id));
    const starts=body.starts??defaultStarts;
    r={code:id,g:game(starts),starts,players:[],votes:[],timer:body.timer===true,deadline:null,version:0};rooms.set(id,r);i=-1;
   }
   if(!r)throw Error('방을 찾을 수 없습니다.');
   if(i<0){
    if(r.players.length===2)throw Error('이미 두 명이 입장한 방입니다.');
    const token=randomUUID();i=r.players.length;r.players.push({name,key:token});r.version++;
    res.setHeader('Set-Cookie','seat_'+r.code+'='+token+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400'+(req.headers['x-forwarded-proto']==='https'?'; Secure':''));
   }
   publish(r);json(200,state(r,i));return;
  }
  if(!r||i<0){json(403,{error:'이 브라우저에 참가 기록이 없습니다.'});return}
  if(req.method==='GET'&&url.pathname==='/events'){
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});
   const token=r.players[i].key;
   if(!clients.has(token))clients.set(token,new Set());
   clients.get(token).add(res);publish(r);
   res.on('close',()=>{clients.get(token)?.delete(res);publish(r)});return;
  }
  if(req.method==='GET'&&url.pathname==='/state'){json(200,state(r,i));return}
  if(req.method==='POST'&&url.pathname==='/act'){
   if(r.deadline&&Date.now()>=r.deadline)timeout(r);
   if(body.version!==r.version||r.players.length!==2)throw Error('대국 상태가 바뀌었습니다. 다시 선택하세요.');
   if(body.type==='rematch'&&r.g.phase==='done'){
    if(r.votes.includes(i))throw Error('이미 신청했습니다.');
    r.votes.push(i);if(r.votes.length===2){r.g=game(r.starts);r.votes=[]}
   }else act(r.g,i,body);
   if(body.type!=='move')clock(r);
   r.version++;publish(r);json(200,state(r,i));return;
  }
  json(404,{error:'경로를 찾을 수 없습니다.'});
 }catch(e){json(400,{error:e instanceof SyntaxError?'잘못된 요청입니다.':e.message})}
});
server.listen(Number(process.env.PORT)||3000,'0.0.0.0');
