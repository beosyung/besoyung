'use strict';
// Minimal no-dependency RFC6455 server for this text-only two-person game.
// Strict masking, payload limit, ping/pong, non-fragmented text messages.
const crypto=require('node:crypto');
const {EventEmitter}=require('node:events');
const ACCEPT_GUID='258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
class WebSocket extends EventEmitter {
  static OPEN=1;
  constructor(socket,maxPayload,head){super();this.socket=socket;this.maxPayload=maxPayload;this.readyState=1;this.buffer=Buffer.alloc(0);this.closed=false;
    socket.on('data',data=>this.feed(data));
    socket.on('error',err=>{this.emit('error',err);this.finish();});
    socket.on('end',()=>this.finish());socket.on('close',()=>this.finish());
    if(head&&head.length)process.nextTick(()=>this.feed(head));
  }
  frame(op,data=Buffer.alloc(0)){
    if(this.readyState!==1)return;
    if(!Buffer.isBuffer(data))data=Buffer.from(String(data));
    let header;
    if(data.length<126){header=Buffer.from([0x80|op,data.length]);}
    else if(data.length<65536){header=Buffer.alloc(4);header[0]=0x80|op;header[1]=126;header.writeUInt16BE(data.length,2);}
    else{this.terminate();return;}
    this.socket.write(Buffer.concat([header,data]));
  }
  send(data){this.frame(1,data);}
  ping(){this.frame(9);}
  close(code=1000){if(this.readyState!==1)return;const info=Buffer.alloc(2);info.writeUInt16BE(code);this.frame(8,info);this.readyState=3;this.socket.end();this.finish();}
  terminate(){if(this.readyState!==1)return;this.readyState=3;this.socket.destroy();this.finish();}
  finish(){if(this.closed)return;this.closed=true;this.readyState=3;this.emit('close');}
  feed(data){if(this.readyState!==1)return;
    if(this.buffer.length+data.length>this.maxPayload*2+512){this.terminate();return;}
    this.buffer=Buffer.concat([this.buffer,data]);
    while(this.buffer.length>=2){
      const first=this.buffer[0],second=this.buffer[1],opcode=first&0x0f,fin=(first&0x80)!==0,masked=(second&0x80)!==0;
      if(!masked||!fin||(first&0x70)!==0){this.terminate();return;}
      let size=second&0x7f,head=2;
      if(size===126){if(this.buffer.length<4)return;size=this.buffer.readUInt16BE(2);head=4;}
      else if(size===127){this.terminate();return;}
      if(size>this.maxPayload){this.terminate();return;}
      if(this.buffer.length<head+4+size)return;
      const mask=this.buffer.subarray(head,head+4),body=Buffer.from(this.buffer.subarray(head+4,head+4+size));
      this.buffer=this.buffer.subarray(head+4+size);
      for(let i=0;i<body.length;i++)body[i]^=mask[i%4];
      if(opcode===1){this.emit('message',body);}
      else if(opcode===9){this.frame(10,body);}
      else if(opcode===10){this.emit('pong');}
      else if(opcode===8){this.close();return;}
      else{this.terminate();return;}
      if(this.readyState!==1)return;
    }
  }
}
class WebSocketServer extends EventEmitter{
  constructor({maxPayload=8192}={}){super();this.maxPayload=maxPayload;this.clients=new Set();}
  handleUpgrade(req,socket,head,callback){
    const k=req.headers['sec-websocket-key'];
    if(req.method!=='GET'||!k||!/^[-+/A-Za-z0-9]{22}==$/.test(k)||req.headers['sec-websocket-version']!=='13'||String(req.headers.upgrade).toLowerCase()!=='websocket'){
      socket.destroy();return;
    }
    const accept=crypto.createHash('sha1').update(k+ACCEPT_GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
    const ws=new WebSocket(socket,this.maxPayload,head);this.clients.add(ws);ws.once('close',()=>this.clients.delete(ws));callback(ws);
  }
}
module.exports={WebSocketServer,WebSocket};
