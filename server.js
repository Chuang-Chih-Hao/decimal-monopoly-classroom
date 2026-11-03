'use strict';
const path=require('node:path');
const http=require('node:http');
const express=require('express');
const { Server }=require('socket.io');
const {GameManager,GameError}=require('./game');
const {ANIMALS}=require('./board');
const {TOTAL}=require('./questions');
const APP_VERSION=require('./package.json').version;

const app=express();
const httpServer=http.createServer(app);
const io=new Server(httpServer,{maxHttpBufferSize:10_000, transports:['websocket','polling']});
const games=new GameManager();
app.disable('x-powered-by');
app.get('/health',(_req,res)=>res.json({ok:true,game:'小數大富翁',questions:TOTAL}));
app.get('/api/info',(_req,res)=>res.json({animals:ANIMALS,questions:TOTAL,maxPlayers:6}));
// 使用 no-store 確保已開啟的舊分頁能偵測新部署版本。
app.get('/api/client-version',(_req,res)=>res.set('Cache-Control','no-store').json({version:APP_VERSION}));
app.use(express.static(path.join(__dirname,'public'),{
  index:'index.html',maxAge:0,etag:false,lastModified:false,
  setHeaders(res,filePath) {
    if(/\.(?:html|js|css)$/i.test(filePath)) res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');
  }
}));
app.get('*',(_req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(__dirname,'public','index.html')));

// 每位玩家收到自己的個人學習回饋；他人的錯題紀錄不會廣播到全房間。
function broadcast(room) {
  for(const socketId of io.sockets.adapter.rooms.get(room.code)||[]) {
    const peer=io.sockets.sockets.get(socketId);
    if(peer)peer.emit('state',games.publicState(room,peer.data.playerId));
  }
}
function reply(ack,ok,data={}) {if(typeof ack==='function')ack({ok,...data});}

io.on('connection',(socket)=>{
  function action(handler) {
    return (payload={},ack)=>{
      try {
        const result=handler(payload||{}) || {};
        reply(ack,true,result);
      } catch(e) {
        const err=e instanceof GameError?e.message:'操作失敗，請稍後再試。';
        if(!(e instanceof GameError))console.error(e);
        reply(ack,false,{error:err});
      }
    };
  }
  function identity() {
    const {roomCode,playerId}=socket.data;
    const room=games.get(roomCode);
    if(!room || !room.players.some(p=>p.id===playerId && p.socketId===socket.id))
      throw new GameError('連線身分已失效，請重新加入房間。');
    return {room,playerId};
  }
  function attach(room,player) {
    if(socket.data.roomCode)socket.leave(socket.data.roomCode);
    // 同一位玩家從另一個分頁恢復時，舊分頁不可繼續操作。
    if(player.socketId && player.socketId!==socket.id) {
      const other=io.sockets.sockets.get(player.socketId);
      if(other) {other.emit('superseded');other.data={};other.disconnect(true);}
    }
    socket.data.roomCode=room.code;socket.data.playerId=player.id;
    player.socketId=socket.id;player.connected=true;
    socket.join(room.code);
    broadcast(room);
    return {state:games.publicState(room,player.id),id:player.id,token:player.token,code:room.code};
  }
  socket.on('create',action(({name,animal})=>{
    const {room,player}=games.newRoom(name,animal);
    return attach(room,player);
  }));
  socket.on('join',action(({code,name,animal})=>{
    const {room,player}=games.join(code,name,animal);
    return attach(room,player);
  }));
  socket.on('resume',action(({code,token})=>{
    const {room,player}=games.findSession(code,token);
    return attach(room,player);
  }));
  socket.on('updateSettings',action((patch)=>{
    const {room,playerId}=identity();games.updateSettings(room,playerId,patch);broadcast(room);
  }));
  socket.on('start',action((settings)=>{
    const {room,playerId}=identity();games.start(room,playerId,settings);broadcast(room);
  }));
  socket.on('roll',action(()=>{
    const {room,playerId}=identity();const die=games.roll(room,playerId);broadcast(room);return {die};
  }));
  socket.on('answer',action(({index})=>{
    const {room,playerId}=identity();games.answer(room,playerId,index);broadcast(room);
  }));
  socket.on('duelChoice',action(({choice})=>{
    const {room,playerId}=identity();games.duelChoice(room,playerId,choice);broadcast(room);
  }));
  socket.on('buy',action(({buy})=>{
    const {room,playerId}=identity();games.decideBuy(room,playerId,buy===true);broadcast(room);
  }));
  socket.on('next',action(()=>{
    const {room,playerId}=identity();games.nextTurn(room,playerId);broadcast(room);
  }));
  socket.on('skip',action(()=>{
    const {room,playerId}=identity();games.nextTurn(room,playerId,true);broadcast(room);
  }));
  socket.on('finish',action(()=>{
    const {room,playerId}=identity();games.finishByHost(room,playerId);broadcast(room);
  }));
  socket.on('saveReflection',action(({text})=>{
    const {room,playerId}=identity();games.saveReflection(room,playerId,text);broadcast(room);
  }));
  socket.on('reset',action(()=>{
    const {room,playerId}=identity();games.reset(room,playerId);broadcast(room);
  }));
  socket.on('leave',action(()=>{
    const {room,playerId}=identity();const dissolved=games.leaveLobby(room,playerId)?.dissolved;
    socket.leave(room.code);socket.data={};
    if(dissolved)io.to(room.code).emit('roomClosed');
    else broadcast(room);
  }));
  socket.on('disconnect',()=>{
    const room=games.get(socket.data.roomCode);
    const player=room?.players.find(p=>p.id===socket.data.playerId);
    if(player && player.socketId===socket.id) {
      player.connected=false;player.socketId=null;
      messageDisconnect(room,player);broadcast(room);
    }
  });
});
function messageDisconnect(room,player) {
  room.updatedAt=Date.now();
  room.log.unshift({id:require('node:crypto').randomUUID(),text:`🔌 ${player.name} 暫時離線，回到同一瀏覽器可重新加入。`,at:Date.now()});
  room.log=room.log.slice(0,18);
}
const interval=setInterval(()=>games.tick(broadcast),1000);
interval.unref();
const PORT=Number(process.env.PORT)||3000;
if(require.main===module){
  httpServer.listen(PORT,'0.0.0.0',()=>console.log(`Decimal Monopoly running on :${PORT}`));
}
module.exports={app,httpServer,io,games};
