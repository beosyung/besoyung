'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {WebSocketServer,WebSocket}=require('./socket');
const {newGame,apply,regionScores}=require('./game');
const rooms=new Map();
const PORT=Number(process.env.PORT||3000);
const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const publicDir=path.join(__dirname,'public');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
function roomCode(){let code;do{code=Array.from(crypto.randomBytes(6),b=>chars[b%chars.length]).join('');}while(rooms.has(code));return code;}
function cleanName(s){return String(s||'').trim().replace(/[<>\x00-\x1f\x7f]/g,'').slice(0,16)||'플레이어';}
function send(ws, data){if(ws && ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}
function publicState(room){return {
  type:'state',code:room.code,game:room.game,score:regionScores(room.game),
  players:room.players.map((p,i)=>p?{name:p.name,connected:!!(p.ws&&p.ws.readyState===WebSocket.OPEN),seat:i}:null),
  rematch:room.rematch.slice()
};}
function publish(room){room.lastActive=Date.now();const state=publicState(room);for(const p of room.players){if(p)send(p.ws,state);}}
function clearSocket(ws){
  const ref=ws._room;if(!ref)return;
  ws._room=null;const room=rooms.get(ref.code);if(!room)return;
  const player=room.players[ref.seat];
  if(player&&player.ws===ws){player.ws=null;publish(room);}
}
function occupy(ws,room,seat,token,name){
  const player=room.players[seat];
  if(!player||player.token!==token)throw Error('재접속 정보가 유효하지 않아요.');
  clearSocket(ws);
  const previous=player.ws;
  if(previous && previous!==ws){send(previous,{type:'error',message:'같은 계정이 다른 창에서 접속했어요.'});previous._room=null;previous.close(4001,'replaced');}
  player.ws=ws;ws._room={code:room.code,seat};
  if(name && !player.started){player.name=cleanName(name);}
  send(ws,{type:'joined',code:room.code,seat,token:player.token});publish(room);
}
function receive(ws,msg){
  if(!msg||typeof msg!=='object'||Array.isArray(msg))throw Error('잘못된 요청이에요.');
  if(msg.type==='create'){
    if(rooms.size>=500)throw Error('현재 개설 가능한 방 수를 초과했어요.');
    const code=roomCode(),token=crypto.randomBytes(24).toString('hex');
    const room={code,game:newGame(),players:[{token,name:cleanName(msg.name),ws:null,started:false},null],rematch:[false,false],lastActive:Date.now()};
    rooms.set(code,room);occupy(ws,room,0,token);return;
  }
  if(msg.type==='join'){
    const code=String(msg.code||'').trim().toUpperCase();
    if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))throw Error('방 코드를 확인해 주세요.');
    const room=rooms.get(code);if(!room)throw Error('방을 찾을 수 없어요. 서버 재시작 후에는 방이 초기화돼요.');
    let seat;
    if(msg.token){seat=room.players.findIndex(p=>p&&p.token===msg.token);}
    if(seat>=0){occupy(ws,room,seat,msg.token);return;}
    if(room.players[1])throw Error('이미 2명이 들어온 방이에요.');
    const token=crypto.randomBytes(24).toString('hex');
    room.players[1]={token,name:cleanName(msg.name),ws:null,started:false};
    occupy(ws,room,1,token);return;
  }
  const ref=ws._room;if(!ref)throw Error('먼저 방에 입장해 주세요.');
  const room=rooms.get(ref.code);if(!room)throw Error('방이 사라졌어요.');
  const p=room.players[ref.seat];if(!p || p.ws!==ws)throw Error('접속 권한이 없어요.');
  if(msg.type==='action'){
    if(!room.players.every(z=>z && z.ws && z.ws.readyState===WebSocket.OPEN))throw Error('상대방이 연결될 때까지 기다려 주세요.');
    apply(room.game,ref.seat,msg.action);
    for(const z of room.players)z.started=true;
    room.rematch=[false,false];publish(room);
  }else if(msg.type==='rematch'){
    if(room.game.phase!=='end')throw Error('대국 종료 후 다시 대결할 수 있어요.');
    room.rematch[ref.seat]=!!msg.agree;
    if(room.rematch[0]&&room.rematch[1]){room.game=newGame();room.rematch=[false,false];}
    publish(room);
  }else if(msg.type==='reaction'){
    const allowed=['❤️','👏','😆','🔥','😭','👍'];
    if(!allowed.includes(msg.emoji))throw Error('사용할 수 없는 이모티콘이에요.');
    room.lastActive=Date.now();
    for(const z of room.players)send(z.ws,{type:'reaction',seat:ref.seat,emoji:msg.emoji});
  }else if(msg.type==='ping')send(ws,{type:'pong'});
  else throw Error('지원하지 않는 요청이에요.');
}
const server=http.createServer((req,res)=>{
  const raw=(req.url||'/').split('?')[0];
  if(raw==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));return;}
  let filename;
  try{const decoded=decodeURIComponent(raw);filename=decoded==='/'?'index.html':decoded.replace(/^\//,'');if(!['index.html','app.js','style.css'].includes(filename)){res.writeHead(404);res.end('Not Found');return;}}catch{res.writeHead(400);res.end('Bad Request');return;}
  const fp=path.join(publicDir,filename);
  fs.readFile(fp,(err,data)=>{if(err){res.writeHead(404);res.end('Not Found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(fp)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});
    if(req.method==='HEAD')res.end();else res.end(data);
  });
});
const wss=new WebSocketServer({noServer:true,maxPayload:8192});
server.on('upgrade',(req,socket,head)=>{
  if((req.url||'').split('?')[0]!=='/socket'){socket.destroy();return;}
  // Same-origin browser requests; tests and internal clients may omit Origin.
  if(req.headers.origin){
    try{const u=new URL(req.headers.origin),host=(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0];if(u.host!==host){socket.destroy();return;}}
    catch{socket.destroy();return;}
  }
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection',ws=>{
  ws.isAlive=true;ws.on('pong',()=>{ws.isAlive=true;});
  ws.on('message',raw=>{try{receive(ws,JSON.parse(String(raw)));}catch(e){send(ws,{type:'error',message:e.message||'요청을 처리할 수 없어요.'});}});
  ws.on('close',()=>clearSocket(ws));
  ws.on('error',()=>{});
});
const pulse=setInterval(()=>{
  for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}
  const now=Date.now();for(const [code,r] of rooms){
    const online=r.players.some(p=>p&&p.ws&&p.ws.readyState===WebSocket.OPEN);
    if(!online&&now-r.lastActive>2*60*60*1000)rooms.delete(code);
  }
},30000);pulse.unref();
if(require.main===module)server.listen(PORT,'0.0.0.0',()=>console.log(`우리 둘의 벽바둑: http://localhost:${PORT}`));
module.exports={server,rooms,wss};
