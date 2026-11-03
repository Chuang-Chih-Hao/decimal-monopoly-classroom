'use strict';
const { randomBytes, randomUUID } = require('node:crypto');
const { BOARD, ANIMALS } = require('./board');
const { BANK } = require('./questions');

const MAX_PEOPLE = 6; // 一位房主 + 最多五位學生
const QUESTION_SECONDS = 80;
const ROOM_TTL_MS = 8 * 60 * 60 * 1000;
const EVENT_CARDS = {
  chance: [
    {title:'校園園遊會',detail:'答對領取園遊會紅包 $120！',success:120,fail:0},
    {title:'買一送一好運',detail:'答對拿到購物禮金 $150！',success:150,fail:-20},
    {title:'幸運發票',detail:'答對獲得獎金 $100！',success:100,fail:0},
    {title:'好心有好報',detail:'答對獲得愛心獎學金 $140！',success:140,fail:-30},
    {title:'交通卡儲值禮',detail:'答對可獲得 $90 儲值金！',success:90,fail:0}
  ],
  fate: [
    {title:'雨天小插曲',detail:'答對可免去修理費並獲得 $60 補助；答錯損失 $80。',success:60,fail:-80},
    {title:'抽中小禮物',detail:'答對可獲得 $110；答錯支付 $40 運費。',success:110,fail:-40},
    {title:'水壺不見了',detail:'答對只需支付 $20 補買費；答錯要支付 $90。',success:-20,fail:-90},
    {title:'友情應援金',detail:'答對獲得 $100；答錯則原地不動、資產不變。',success:100,fail:0},
    {title:'巴士誤點',detail:'答對獲得 $70 補償金；答錯需支付 $50 車資。',success:70,fail:-50}
  ]
};
const shuffle = (array) => {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

class GameError extends Error {
  constructor(message) { super(message); this.name = 'GameError'; }
}
function message(room, text) {
  room.log.unshift({ id: randomUUID(), text, at: Date.now() });
  room.log = room.log.slice(0, 18);
  room.updatedAt = Date.now();
}
function requireRoom(room) {
  if (!room) throw new GameError('找不到房間，請確認房間代碼。');
  return room;
}
function requireHost(room, playerId) {
  const p = room.players.find(p => p.id === playerId);
  if (!p || !p.host) throw new GameError('只有房主可以操作這個功能。');
  return p;
}
function requireTurn(room, playerId) {
  const p = room.players.find(p => p.id === playerId);
  if (!p || room.currentPlayerId !== p.id) throw new GameError('還沒輪到你喔！');
  if (room.status !== 'playing') throw new GameError('遊戲尚未開始或已結束。');
  return p;
}
function changeCash(player, delta) {
  const old = player.cash;
  player.cash = Math.max(0, old + delta);
  return player.cash - old;
}

class GameManager {
  constructor() { this.rooms = new Map(); }

  get(code) { return this.rooms.get(String(code || '').trim().toUpperCase()); }

  newRoom(name, animal) {
    const clean = this.cleanName(name);
    this.checkAnimal(animal);
    let code;
    do { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); }
    while (this.rooms.has(code));
    const player = this.makePlayer(clean, animal, true);
    const room = {
      code, status:'lobby', players:[player], currentPlayerId:null,
      turnIndex:0, round:1, roundLimit:8, startMoney:900,
      board: BOARD, properties:{}, pending:null, phase:'lobby',
      lastRoll:null, lastResult:null, log:[], questionQueues:{},
      updatedAt:Date.now(), createdAt:Date.now(), rankings:[]
    };
    this.rooms.set(code, room);
    message(room, `${player.animal==='capybara'?'🟤水豚':player.animal} ${player.name} 開設房間，等待同學加入。`);
    return { room, player };
  }

  cleanName(value) {
    const name = String(value || '').trim().replace(/\s+/g, ' ');
    if (name.length < 1 || name.length > 14 || /[<>\x00-\x1f]/.test(name)) {
      throw new GameError('暱稱需為 1～14 字，不可含特殊控制字元。');
    }
    return name;
  }

  checkAnimal(animal) {
    if (!ANIMALS.includes(animal)) throw new GameError('請選擇列表中的動物棋子。');
  }

  makePlayer(name, animal, host=false) {
    return { id:randomUUID(), token:randomBytes(24).toString('hex'), name, animal,
      host, connected:true, socketId:null, cash:0, properties:[], position:0,
      missedTurns:0, correct:0, attempted:0 };
  }

  join(code, name, animal) {
    const room = requireRoom(this.get(code));
    if (room.status !== 'lobby') throw new GameError('這間房已開始遊戲，僅原玩家可以重新連線。');
    if (room.players.length >= MAX_PEOPLE) throw new GameError('房間已滿（房主加五位學生）。');
    this.checkAnimal(animal);
    const clean = this.cleanName(name);
    if (room.players.some(p => p.name === clean)) throw new GameError('暱稱已有人使用，請換一個。');
    if (room.players.some(p => p.animal === animal)) throw new GameError('這隻動物已被選走，請換一隻。');
    const player = this.makePlayer(clean,animal);
    room.players.push(player);
    message(room, `${animal==='capybara'?'🟤水豚':animal} ${clean} 加入遊戲。`);
    return { room, player };
  }

  findSession(code, token) {
    const room = requireRoom(this.get(code));
    const player = room.players.find(p => p.token === token);
    if (!player) throw new GameError('無法恢復此玩家的連線，請重新輸入房間代碼。');
    player.connected = true;
    room.updatedAt = Date.now();
    return { room, player };
  }

  leaveLobby(room, playerId) {
    if (room.status !== 'lobby') throw new GameError('遊戲開始後無法退出座位，可直接關閉網頁。');
    const leaving = room.players.find(p => p.id === playerId);
    if (!leaving) return;
    if (leaving.host) {
      this.rooms.delete(room.code);
      return { dissolved:true };
    }
    room.players = room.players.filter(p => p.id !== playerId);
    message(room, `${leaving.name} 離開候位區。`);
    return { dissolved:false };
  }

  start(room, hostId, settings={}) {
    requireHost(room,hostId);
    if (room.status !== 'lobby') throw new GameError('這場遊戲已開始。');
    if (room.players.length < 2) throw new GameError('至少要有兩位玩家才能開始。');
    const limit = Number(settings.rounds ?? 8);
    const money = Number(settings.money ?? 900);
    if (![4,6,8,10,12].includes(limit) || ![600,900,1200].includes(money)) {
      throw new GameError('請選擇合法的回合數與起始資金。');
    }
    room.status='playing'; room.phase='rolling'; room.round=1; room.roundLimit=limit;
    room.startMoney=money; room.turnIndex=0; room.currentPlayerId=room.players[0].id;
    room.properties={}; room.pending=null; room.lastRoll=null; room.lastResult=null;
    room.questionQueues={}; room.rankings=[];
    room.players.forEach(p=>{p.cash=money;p.properties=[];p.position=0;p.correct=0;p.attempted=0;p.missedTurns=0;});
    message(room, `🎉 遊戲開始！每人獲得 $${money}，共 ${limit} 輪。${room.players[0].name} 先擲骰。`);
  }

  takeQuestion(room, kind) {
    const pool=BANK[kind];
    if (!pool || !pool.length) throw new Error(`Missing question type: ${kind}`);
    const queue = room.questionQueues[kind] ??= [];
    if (queue.length === 0) queue.push(...shuffle(pool.map(q=>q.id)));
    const id=queue.shift();
    const chosen=pool.find(q=>q.id===id);
    const answers=shuffle([chosen.answer,...chosen.distractors]);
    return { id, kind, text:chosen.question, options:answers,
      correctIndex:answers.indexOf(chosen.answer), explanation:chosen.explanation,
      correctText:chosen.answer };
  }

  ask(room,kind,context={},opts={}) {
    room.pending={
      type:kind, question:this.takeQuestion(room,kind), context,
      stage:opts.stage ?? 1, total:opts.total ?? 1, correctCount:opts.correctCount ?? 0,
      expiresAt: Date.now()+QUESTION_SECONDS*1000
    };
    room.phase='answering';
    message(room, `📖 ${room.players.find(p=>p.id===room.currentPlayerId)?.name} 遇到「${opts.label || BOARD[room.players.find(p=>p.id===room.currentPlayerId).position].name}」：請回答小數題！`);
  }

  roll(room,playerId,forced=false) {
    const player=requireTurn(room,playerId);
    if (room.phase!=='rolling') throw new GameError('目前還不能擲骰。');
    if (forced && !player.host) { /* Host validation happens at the event layer. */ }
    const die=1+Math.floor(Math.random()*6);
    const prev=player.position;
    const next=(prev+die)%BOARD.length;
    player.position=next; room.lastRoll={id:randomUUID(),playerId,die,from:prev,position:next,at:Date.now()};
    room.lastResult=null;
    if (prev+die>=BOARD.length) {
      changeCash(player,200);
      message(room, `🏁 ${player.name} 經過起點，領到 $200。`);
    }
    const tile=BOARD[next];
    message(room, `🎲 ${player.name} 擲出 ${die} 點，走到「${tile.name}」。`);
    this.land(room,player,tile);
    return die;
  }

  land(room,player,tile) {
    const type=tile.type;
    if (type==='property') {
      const ownerId=room.properties[tile.id];
      if (!ownerId) {
        if (player.cash < tile.price) {
          message(room, `💰 ${player.name} 的 $${player.cash} 不夠購買「${tile.name}」（$${tile.price}）。`);
          room.phase='between'; return;
        }
        this.ask(room,'purchase',{tileId:tile.id},{label:`購買 ${tile.name}`});
        return;
      }
      if (ownerId===player.id) {
        message(room, `🏡 ${player.name} 回到自己的「${tile.name}」，免繳過路費。`);
        room.phase='between'; return;
      }
      const owner=room.players.find(p=>p.id===ownerId);
      if (!owner) { delete room.properties[tile.id];room.phase='between';return; }
      if (player.cash>=tile.rent) {
        changeCash(player,-tile.rent);changeCash(owner,tile.rent);
        message(room, `🏠 ${player.name} 支付 $${tile.rent} 過路費給 ${owner.name}。`);
        room.phase='between';return;
      }
      message(room, `🚨 現金不足！過路費 $${tile.rent}，${player.name} 只有 $${player.cash}，進入救援題。`);
      this.ask(room,'rescue',{cause:'rent',rent:tile.rent,ownerId,tileId:tile.id},{label:'過路費救援'});
      return;
    }
    if(type==='rest') {changeCash(player,30);message(room, `🌈 ${player.name} 休息補給，得到 $30。`); room.phase='between';return;}
    if(type==='start') {message(room, '🏁 起點！別忘了經過起點時會領到薪水。');room.phase='between';return;}
    if(type==='tax') {
      if(player.cash>=60) {changeCash(player,-60);message(room, `🧾 ${player.name} 繳交稅金 $60。`);room.phase='between';}
      else {this.ask(room,'rescue',{cause:'tax',rent:60},{label:'稅金救援'});}
      return;
    }
    if(type==='chance' || type==='fate') {
      const card=shuffle(EVENT_CARDS[type])[0];
      this.ask(room,type,{card}, {label:`${tile.name}｜${card.title}`});
      return;
    }
    this.ask(room,type,{}, {label:tile.name,total:type==='boss'?2:1});
  }

  answer(room,playerId,choice) {
    const player=requireTurn(room,playerId);
    if(room.phase!=='answering'||!room.pending) throw new GameError('目前沒有等待作答的題目。');
    const pending=room.pending;
    if(!Number.isInteger(choice) || choice < 0 || choice >= 4) throw new GameError('請選擇有效的答案。');
    const correct=choice===pending.question.correctIndex && Date.now()<=pending.expiresAt;
    return this.resolveAnswer(room,player,correct);
  }

  resolveAnswer(room,player,correct) {
    const pending=room.pending;
    if(!pending || room.phase!=='answering') return;
    const q=pending.question;
    player.attempted++;
    if(correct) player.correct++;
    room.pending=null;
    const result={correct,correctAnswer:q.correctText,explanation:q.explanation,at:Date.now()};
    room.lastResult=result;
    message(room, `${correct?'✅':'❌'} ${player.name} ${correct?'答對了！':'未答對。'}正解是「${q.correctText}」。${q.explanation}`);
    if(pending.type==='boss') {
      const nextCount=pending.correctCount+Number(correct);
      if(pending.stage<2) {
        this.ask(room,'boss',{}, {label:'Boss 第 2 階段',stage:2,total:2,correctCount:nextCount});
        return;
      }
      const reward=nextCount===2?250:nextCount===1?90:-90;
      const applied=changeCash(player,reward);
      message(room, `🐉 Boss 挑戰完成！答對 ${nextCount}/2 題，${applied>=0?'獲得':'失去'} $${Math.abs(applied)}。`);
      room.phase='between';return;
    }
    if(pending.type==='purchase') {
      const tile=BOARD[pending.context.tileId];
      if(correct && !room.properties[tile.id] && player.cash>=tile.price) {
        room.phase='buying';room.pending={type:'buying',tileId:tile.id};
        message(room, `🏡 ${player.name} 已答對，現在可以用 $${tile.price} 購買「${tile.name}」，也可放棄。`);
      } else {
        message(room, `🏠 ${player.name} 本次無法購買「${tile.name}」。`);
        room.phase='between';
      }
      return;
    }
    if(pending.type==='rescue') {
      const {cause,rent,ownerId}=pending.context;
      if(cause==='rent') {
        const paid=Math.min(rent,player.cash);
        changeCash(player,-paid);
        const owner=room.players.find(p=>p.id===ownerId);
        if(owner) changeCash(owner,correct?rent:paid);
        if(!correct) player.missedTurns++;
        message(room, correct
          ? `🛟 救援成功！${player.name} 支出 $${paid}，學習基金補足 $${rent-paid}，房主獲得完整租金。`
          : `💸 救援未成功：${player.name} 支出現金 $${paid}，並暫停下次擲骰一次。`);
      } else {
        const paid=Math.min(player.cash,correct?30:60);
        changeCash(player,-paid);
        if(!correct) player.missedTurns++;
        message(room, `🧾 ${correct?'答對減半':'未答對'}，${player.name} 實際繳出 $${paid}${correct?'':'，並暫停下次擲骰一次'}。`);
      }
      room.phase='between';return;
    }
    const rules={
      calc:[85,0], discount:[95,0], compare:[130,0], scam:[100,-80],
      chest:[180,25], chance:[120,-60], fate:[100,-80]
    };
    const delta=pending.context.card
      ? pending.context.card[correct?'success':'fail']
      : (rules[pending.type]?.[correct?0:1] ?? 0);
    const actual=changeCash(player,delta);
    message(room, `${correct?'🌟':'📦'} ${player.name} ${actual>0?`獲得 $${actual}`:actual<0?`失去 $${-actual}`:'金額不變'}。`);
    room.phase='between';
  }

  decideBuy(room,playerId,buy) {
    const player=requireTurn(room,playerId);
    if(room.phase!=='buying'||room.pending?.type!=='buying') throw new GameError('沒有正在等待購地決定的房產。');
    const tile=BOARD[room.pending.tileId];
    if(buy) {
      if(room.properties[tile.id] || player.cash<tile.price) throw new GameError('房產已售出或資金不足。');
      changeCash(player,-tile.price);
      player.properties.push(tile.id);
      room.properties[tile.id]=player.id;
      message(room, `🎉 ${player.name} 以 $${tile.price} 買下「${tile.name}」！其他玩家經過需付 $${tile.rent}。`);
    } else message(room, `↪️ ${player.name} 放棄購買「${tile.name}」。`);
    room.pending=null; room.phase='between';
  }

  nextTurn(room,playerId,hostOverride=false) {
    if(hostOverride) requireHost(room,playerId);
    else requireTurn(room,playerId);
    if(room.phase!=='between' && !hostOverride) throw new GameError('請先完成當前擲骰／作答／購地流程。');
    if(hostOverride && room.phase==='answering' && room.pending) {
      const current=room.players.find(p=>p.id===room.currentPlayerId);
      this.resolveAnswer(room,current,false);
      // Boss 第一關失敗後會進入第二題，再跳一次可完成。
      if(room.phase==='answering' && room.pending) this.resolveAnswer(room,current,false);
    }
    if(hostOverride && room.phase==='buying') room.pending=null;
    if(hostOverride && room.phase==='rolling') message(room,'⏭️ 房主跳過本次擲骰。');
    room.pending=null;
    room.phase='rolling';
    room.turnIndex++;
    if(room.turnIndex>=room.players.length) {room.turnIndex=0;room.round++;}
    if(room.round>room.roundLimit) {this.finish(room);return;}
    room.currentPlayerId=room.players[room.turnIndex].id;
    const next=room.players[room.turnIndex];
    room.lastResult=null;
    // 扣掉被暫停的回合，直到輪到一位可擲骰的人。
    let safety=0;
    while(next && room.players[room.turnIndex]?.missedTurns>0 && safety < room.players.length*2) {
      const skipped=room.players[room.turnIndex];
      skipped.missedTurns--;
      message(room, `⏳ ${skipped.name} 因救援失敗，這一回合暫停擲骰。`);
      room.turnIndex++;
      if(room.turnIndex>=room.players.length) {room.turnIndex=0;room.round++;}
      if(room.round>room.roundLimit) {this.finish(room);return;}
      room.currentPlayerId=room.players[room.turnIndex].id;
      safety++;
    }
    message(room, `🎯 第 ${room.round} / ${room.roundLimit} 輪：輪到 ${room.players[room.turnIndex].name}！`);
  }

  finish(room) {
    room.status='finished';room.phase='finished';room.currentPlayerId=null;
    room.pending=null;
    room.rankings=room.players.map(p=>({id:p.id,name:p.name,animal:p.animal,
      cash:p.cash,landValue:p.properties.reduce((v,id)=>v+BOARD[id].price,0),
      score:p.cash+p.properties.reduce((v,id)=>v+BOARD[id].price,0),
      correct:p.correct,attempted:p.attempted})).sort((a,b)=>b.score-a.score||b.correct-a.correct);
    message(room, `🏆 遊戲結束！總資產最高的是 ${room.rankings[0].name}（$${room.rankings[0].score}）！`);
  }

  finishByHost(room,hostId) {
    requireHost(room,hostId);
    if(room.status!=='playing') throw new GameError('遊戲尚未開始。');
    this.finish(room);
  }

  reset(room,hostId) {
    requireHost(room,hostId);
    if(room.status!=='finished') throw new GameError('請先結束這一局。');
    room.status='lobby';room.phase='lobby';room.currentPlayerId=null;
    room.round=1;room.rankings=[];room.pending=null;room.properties={};
    room.lastRoll=null;room.lastResult=null;room.questionQueues={};
    room.players.forEach(p=>{p.cash=0;p.properties=[];p.position=0;p.missedTurns=0;p.correct=0;p.attempted=0;});
    message(room,'🔁 房主已開啟下一局，所有玩家保留座位。');
  }

  publicState(room) {
    return {
      code:room.code,status:room.status,phase:room.phase,round:room.round,
      roundLimit:room.roundLimit,startMoney:room.startMoney,currentPlayerId:room.currentPlayerId,
      players:room.players.map(p=>({id:p.id,name:p.name,animal:p.animal,host:p.host,
        connected:p.connected,cash:p.cash,properties:p.properties,position:p.position,
        missedTurns:p.missedTurns,correct:p.correct,attempted:p.attempted})),
      board:BOARD,properties:room.properties,lastRoll:room.lastRoll,lastResult:room.lastResult,
      pending:room.pending && (room.pending.type==='buying'
        ? {type:'buying',tileId:room.pending.tileId}
        : {type:room.pending.type,stage:room.pending.stage,total:room.pending.total,
           card:room.pending.context?.card
             ? {title:room.pending.context.card.title,detail:room.pending.context.card.detail} : null,
           question:{id:room.pending.question.id,text:room.pending.question.text,
             options:room.pending.question.options},expiresAt:room.pending.expiresAt}),
      log:room.log,rankings:room.rankings
    };
  }

  tick(onChange) {
    const now=Date.now();
    for(const room of this.rooms.values()) {
      if(now-room.updatedAt>ROOM_TTL_MS) {this.rooms.delete(room.code);continue;}
      if(room.status==='playing' && room.pending?.expiresAt && room.pending.expiresAt<=now) {
        const p=room.players.find(p=>p.id===room.currentPlayerId);
        if(p) {message(room,'⏰ 作答時間到，按未答對處理。');this.resolveAnswer(room,p,false);onChange(room);}
      }
    }
  }
}
module.exports={GameManager,GameError,MAX_PEOPLE,QUESTION_SECONDS};
