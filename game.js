'use strict';
const { randomBytes, randomUUID } = require('node:crypto');
const { BOARD, ANIMALS } = require('./board');
const { BANK } = require('./questions');
const {summarizePlayer,summarizeClass}=require('./feedback');

const MAX_PEOPLE = 6; // 一位房主 + 最多五位真人／機器人
const QUESTION_SECONDS = 120; // 六年級學生預設有兩分鐘計算時間
const DUEL_SECONDS = 25; // 每次小遊戲出招時間；不影響主題數學題倒數
const GAME_MINUTES = 30;
const LOBBY_DEFAULTS = Object.freeze({rounds:'unlimited',money:900,questionSeconds:120,durationMinutes:30});
const MAX_REFLECTION_LENGTH = 600;
const STORY_SECONDS = 25;
const BOT_ACCURACY = 0.65; // 機器人不保證每題答對
const BOT_STEP_DELAY_MS = 1200; // 定期 tick 觸發，保留演出節奏
const ACHIEVEMENTS = Object.freeze([
  {id:'first_answer',icon:'🌟',title:'小數新星',description:'正式答對第 1 道數學題'},
  {id:'three_correct',icon:'🧮',title:'計算達人',description:'正式累積答對 3 道數學題'},
  {id:'discount_master',icon:'🏷️',title:'折扣高手',description:'正式答對 2 題折扣類題目'},
  {id:'unit_detective',icon:'🔎',title:'比價偵探',description:'正式答對 2 題單價比價類題目'},
  {id:'first_property',icon:'🏠',title:'店面新星',description:'成功購買第一間店面'},
  {id:'three_properties',icon:'🏘️',title:'島嶼經營家',description:'累積擁有 3 間店面'},
  {id:'spectator_star',icon:'👀',title:'觀戰智多星',description:'觀戰猜題累積猜對 3 題'},
  {id:'story_brave',icon:'🔮',title:'命運冒險家',description:'在命運或機會事件選過冒險方案'}
]);
const STORY_DESCRIPTIONS = Object.freeze({
  '校園園遊會':'熱鬧的園遊會開始了，攤主邀請你挑戰神祕紅包。你想穩穩解題，還是冒險爭取更大的獎勵？',
  '買一送一好運':'商店正舉辦限時活動，工作人員拿出兩個不同風險的優惠信封。',
  '幸運發票':'你撿到一張可以兌換獎勵的發票，卻不確定裡面的幸運金額。',
  '好心有好報':'你在島上幫忙整理物資，村長問你要選固定感謝禮，還是神祕加碼。',
  '交通卡儲值禮':'車站出現兩台儲值機，一台獎勵穩定，另一台可能送出更大驚喜。',
  '雨天小插曲':'突如其來的暴雨弄濕了冒險裝備，你可以簡單修補或挑戰高回報的修復任務。',
  '抽中小禮物':'命運轉盤送來一份包裹，你可以安全領取，或打開帶有未知費用的特別禮物。',
  '水壺不見了':'探險途中水壺不見了！選擇穩健地尋找，或接受神祕人的高風險尋物挑戰。',
  '友情應援金':'朋友願意支援你的冒險，但你得決定領取基本物資或試試加倍挑戰。',
  '巴士誤點':'巴士因天候延誤，站務員提供兩種不同風險的補償計畫。'
});
const ROOM_TTL_MS = 8 * 60 * 60 * 1000;
const EVENT_CARDS = {
  chance: [
    {title:'校園園遊會',detail:'答對領取園遊會紅包 $60！',success:60,fail:0},
    {title:'買一送一好運',detail:'答對拿到購物禮金 $75！',success:75,fail:-20},
    {title:'幸運發票',detail:'答對獲得獎金 $50！',success:50,fail:0},
    {title:'好心有好報',detail:'答對獲得愛心獎學金 $70！',success:70,fail:-30},
    {title:'交通卡儲值禮',detail:'答對可獲得 $45 儲值金！',success:45,fail:0}
  ],
  fate: [
    {title:'雨天小插曲',detail:'答對可免去修理費並獲得 $30 補助；答錯損失 $80。',success:30,fail:-80},
    {title:'抽中小禮物',detail:'答對可獲得 $55；答錯支付 $40 運費。',success:55,fail:-40},
    {title:'水壺不見了',detail:'答對只需支付 $20 補買費；答錯要支付 $90。',success:-20,fail:-90},
    {title:'友情應援金',detail:'答對獲得 $50；答錯則原地不動、資產不變。',success:50,fail:0},
    {title:'巴士誤點',detail:'答對獲得 $35 補償金；答錯需支付 $50 車資。',success:35,fail:-50}
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
      turnIndex:0, round:1, roundLimit:12, startMoney:900,
      questionSeconds:QUESTION_SECONDS,durationMinutes:GAME_MINUTES,endsAt:null,bonusStage:0,
      settings:{...LOBBY_DEFAULTS},
      duel:null,lastDuel:null,poll:null,lastPoll:null,lastAchievement:null,
      board: BOARD, properties:{}, pending:null, phase:'lobby',botAction:null,
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

  makePlayer(name, animal, host=false, isBot=false) {
    return { id:randomUUID(), token:isBot?null:randomBytes(24).toString('hex'), name, animal,
      host, isBot, connected:true, socketId:null, cash:0, properties:[], position:0,
      missedTurns:0, correct:0, attempted:0, answerHistory:[],reflection:null,
       achievements:[],titleId:null,spectatorCorrect:0,spectatorAttempted:0 };
  }

  join(code, name, animal) {
    const room = requireRoom(this.get(code));
    if (room.status !== 'lobby') throw new GameError('這間房已開始遊戲，僅原玩家可以重新連線。');
    if (room.players.length >= MAX_PEOPLE) throw new GameError('房間已滿（含房主、真人與機器人最多六位）。');
    this.checkAnimal(animal);
    const clean = this.cleanName(name);
    if (room.players.some(p => p.name === clean)) throw new GameError('暱稱已有人使用，請換一個。');
    if (room.players.some(p => p.animal === animal)) throw new GameError('這隻動物已被選走，請換一隻。');
    const player = this.makePlayer(clean,animal);
    room.players.push(player);
    message(room, `${animal==='capybara'?'🟤水豚':animal} ${clean} 加入遊戲。`);
    return { room, player };
  }

  addBot(room,hostId) {
    requireHost(room,hostId);
    if(room.status!=='lobby')throw new GameError('只能在等待室新增機器人。');
    if(room.players.length>=MAX_PEOPLE)throw new GameError('房間已滿（最多六位玩家，包含機器人）。');
    const animal=ANIMALS.find(a=>!room.players.some(p=>p.animal===a));
    if(!animal)throw new GameError('目前沒有可用的動物棋子。');
    let index=1;
    while(room.players.some(p=>p.name===`小數機器人${index}`))index++;
    const bot=this.makePlayer(`小數機器人${index}`,animal,false,true);
    room.players.push(bot);
    message(room,`🤖 房主新增了 ${bot.name}，由伺服器自動擲骰與解題。`);
    return bot;
  }

  removeBot(room,hostId,botId) {
    requireHost(room,hostId);
    if(room.status!=='lobby')throw new GameError('只能在等待室移除機器人。');
    const bot=room.players.find(p=>p.id===botId);
    if(!bot?.isBot)throw new GameError('只能移除機器人，不能移除真人玩家。');
    room.players=room.players.filter(p=>p.id!==botId);
    message(room,`🤖 房主移除了 ${bot.name}。`);
  }

  // 機器人動作只由伺服器觸發；瀏覽器無法取得機器人的登入 token。
  botIntent(room) {
    if(room.status!=='playing')return null;
    const actor=room.players.find(p=>p.id===room.currentPlayerId);
    if(room.phase==='duel'&&room.duel){
      const d=room.duel;
      const bot=room.players.find(p=>p.isBot&&[d.renterId,d.ownerId].includes(p.id)
        &&!Object.hasOwn(d.choices,p.id));
      if(bot)return {key:`duel:${d.id}:${d.round}:${bot.id}`,delayMs:4200,act:()=>this.duelChoice(room,bot.id,Math.floor(Math.random()*(d.mode==='rps'?3:5)))};
    }
    if(room.phase==='answering'&&room.poll&&room.pending?.question){
      if(actor?.isBot){
        const p=room.pending;
        return {key:`answer:${room.poll.id}`,delayMs:4300,act:()=>this.answer(room,actor.id,this.botAnswerIndex(p.question))};
      }
      const spectator=room.players.find(p=>p.isBot&&p.id!==room.currentPlayerId
        &&!Object.hasOwn(room.poll.choices,p.id));
      if(spectator)return {key:`spectate:${room.poll.id}:${spectator.id}`,delayMs:4200,
        act:()=>this.spectatorGuess(room,spectator.id,this.botAnswerIndex(room.pending.question))};
    }
    if(!actor?.isBot)return null;
    const tag=`${room.round}:${room.turnIndex}:${actor.id}`;
    if(room.phase==='rolling')return {key:`roll:${tag}:${room.lastRoll?.id||'initial'}`,
      act:()=>this.roll(room,actor.id)};
    if(room.phase==='story'&&room.pending?.type==='story')return {
      key:`story:${tag}:${room.pending.expiresAt}`,delayMs:4200,
      act:()=>this.chooseStory(room,actor.id,Math.random()<.7?'safe':'bold')};
    if(room.phase==='buying'&&room.pending?.type==='buying')return {
      key:`buy:${tag}:${room.pending.tileId}`,
      act:()=>this.decideBuy(room,actor.id,Math.random()<.85)};
    if(room.phase==='between')return {key:`next:${tag}:${room.lastRoll?.id||'none'}`,
      act:()=>this.nextTurn(room,actor.id)};
    return null;
  }

  botAnswerIndex(question) {
    if(Math.random()<BOT_ACCURACY)return question.correctIndex;
    const wrong=[0,1,2,3].filter(i=>i!==question.correctIndex);
    return wrong[Math.floor(Math.random()*wrong.length)];
  }

  botStep(room,now=Date.now()) {
    const intent=this.botIntent(room);
    if(!intent){room.botAction=null;return false;}
    if(room.botAction?.key!==intent.key){
      room.botAction={key:intent.key,readyAt:now+(intent.delayMs??BOT_STEP_DELAY_MS)};
      return false;
    }
    if(now<room.botAction.readyAt)return false;
    room.botAction=null;
    intent.act();
    return true;
  }

  findSession(code, token) {
    const room = requireRoom(this.get(code));
    const player = room.players.find(p => !p.isBot && p.token && p.token === token);
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

  validateSettings(settings) {
    if(!settings || typeof settings!=='object' || Array.isArray(settings)) throw new GameError('遊戲設定格式不正確。');
    const rounds=settings.rounds==='unlimited'?'unlimited':Number(settings.rounds);
    const money=Number(settings.money);
    const questionSeconds=Number(settings.questionSeconds);
    const durationMinutes=Number(settings.durationMinutes);
    if((rounds!=='unlimited'&&![2,3,4,5,6,8,10,12].includes(rounds))
      ||![600,900,1200].includes(money)||![90,120,150,180].includes(questionSeconds)
      ||![20,30,40].includes(durationMinutes)) throw new GameError('請選擇合法的輪數、起始金額、作答時間與遊玩時間。');
    return {rounds,money,questionSeconds,durationMinutes};
  }

  updateSettings(room,hostId,patch={}) {
    requireHost(room,hostId);
    if(room.status!=='lobby')throw new GameError('只有等待室可以修改遊戲設定。');
    const keys=['rounds','money','questionSeconds','durationMinutes'];
    if(!patch || typeof patch!=='object' || Array.isArray(patch)
       || Object.keys(patch).some(key=>!keys.includes(key))) throw new GameError('選單設定不合法。');
    const settings=this.validateSettings({...room.settings,...patch});
    room.settings=settings;room.updatedAt=Date.now();
    return settings;
  }

  start(room, hostId, settings={}) {
    requireHost(room,hostId);
    if (room.status !== 'lobby') throw new GameError('這場遊戲已開始。');
    if (room.players.length < 2) throw new GameError('至少要有兩位玩家才能開始。');
    const chosen=this.validateSettings({...room.settings,...settings});
    room.settings=chosen;
    const unlimited=chosen.rounds==='unlimited';
    const limit=unlimited?null:chosen.rounds;
    const {money,questionSeconds,durationMinutes}=chosen;
    room.status='playing'; room.phase='rolling'; room.round=1; room.roundLimit=limit;
    room.startMoney=money;room.questionSeconds=questionSeconds;
    room.durationMinutes=durationMinutes;room.endsAt=Date.now()+durationMinutes*60*1000;
    room.bonusStage=0;room.duel=null;room.lastDuel=null;room.poll=null;room.lastPoll=null;room.lastAchievement=null;
    room.turnIndex=0; room.currentPlayerId=room.players[0].id;
    room.properties={}; room.pending=null; room.lastRoll=null; room.lastResult=null;
    room.questionQueues={}; room.rankings=[];room.botAction=null;
    room.players.forEach(p=>{p.cash=money;p.properties=[];p.position=0;p.correct=0;p.attempted=0;p.answerHistory=[];p.reflection=null;p.missedTurns=0;p.achievements=[];p.titleId=null;p.spectatorCorrect=0;p.spectatorAttempted=0;});
    message(room, `🎉 遊戲開始！每人獲得 $${money}，每題 ${questionSeconds} 秒，${unlimited?'無輪數上限':'最多 '+limit+' 輪'}，${durationMinutes} 分鐘後結算（房主也可提前結束）。${room.players[0].name} 先擲骰。`);
  }


  unlockAchievement(room,player,id) {
    const entry=ACHIEVEMENTS.find(a=>a.id===id);
    if(!entry || player.achievements.includes(id))return false;
    player.achievements.push(id);
    if(!player.titleId)player.titleId=id;
    room.lastAchievement={id:randomUUID(),playerId:player.id,achievementId:id,at:Date.now()};
    message(room,'🏅 '+player.name+' 解鎖成就「'+entry.title+'」！');
    return true;
  }

  checkAchievements(room,player) {
    if(player.correct>=1)this.unlockAchievement(room,player,'first_answer');
    if(player.correct>=3)this.unlockAchievement(room,player,'three_correct');
    const countSkill=skill=>player.answerHistory.filter(x=>x.result==='correct'&&x.skill===skill).length;
    if(countSkill('discount')>=2)this.unlockAchievement(room,player,'discount_master');
    if(countSkill('unit')>=2)this.unlockAchievement(room,player,'unit_detective');
    if(player.properties.length>=1)this.unlockAchievement(room,player,'first_property');
    if(player.properties.length>=3)this.unlockAchievement(room,player,'three_properties');
    if(player.spectatorCorrect>=3)this.unlockAchievement(room,player,'spectator_star');
  }

  equipTitle(room,playerId,achievementId) {
    if(!['playing','finished'].includes(room.status))throw new GameError('遊戲開始後才能選擇稱號。');
    const player=room.players.find(p=>p.id===playerId);
    if(!player)throw new GameError('玩家身分失效。');
    if(!player.achievements.includes(achievementId))throw new GameError('這個稱號尚未解鎖。');
    player.titleId=achievementId;
    room.updatedAt=Date.now();
  }

  spectatorGuess(room,playerId,choice) {
    if(room.status!=='playing'||room.phase!=='answering'||!room.pending?.question||!room.poll)
      throw new GameError('現在沒有開放的觀戰猜題。');
    const player=room.players.find(p=>p.id===playerId);
    if(!player||player.id===room.currentPlayerId)throw new GameError('當回合玩家請使用正式答題區。');
    if(!Number.isInteger(choice)||choice<0||choice>=4)throw new GameError('請選擇有效選項。');
    if(Date.now()>room.pending.expiresAt)throw new GameError('這一題已經結束猜題。');
    if(Object.hasOwn(room.poll.choices,playerId))throw new GameError('本題已猜過，不能更改。');
    room.poll.choices[playerId]=choice;
    room.updatedAt=Date.now();
  }

  beginStory(room,kind,card,tile) {
    const normalSuccess=card.success,normalFail=card.fail;
    const safeSuccess=normalSuccess>=0?Math.max(15,Math.round(normalSuccess*.65)):-10;
    const safeFail=Math.max(-20,normalFail);
    const boldSuccess=normalSuccess>=0?normalSuccess+20:35;
    room.phase='story';
    room.pending={
      type:'story',cardType:kind,card:{...card},tileId:tile.id,
      scene:STORY_DESCRIPTIONS[card.title]||'神祕事件發生了！你要選擇穩健還是冒險的方式迎接挑戰？',
      choices:[
        {id:'safe',label:'🛡️ 穩健處理',detail:'獎勵較少，失敗損失也比較低。',success:safeSuccess,fail:safeFail},
        {id:'bold',label:'🎲 冒險挑戰',detail:'答對有較多獎勵，但答錯承擔原事件風險。',success:boldSuccess,fail:normalFail}
      ],expiresAt:Date.now()+STORY_SECONDS*1000
    };
    room.poll=null;
    message(room,'📜 '+room.players.find(p=>p.id===room.currentPlayerId).name+' 遇到「'+card.title+'」，準備選擇命運分支！');
  }

  chooseStory(room,playerId,choiceId,automatic=false) {
    const player=requireTurn(room,playerId);
    if(room.phase!=='story'||room.pending?.type!=='story')throw new GameError('目前沒有需要選擇的劇情事件。');
    const pending=room.pending;
    if(!automatic&&Date.now()>pending.expiresAt)throw new GameError('選擇時間已過，將自動採用穩健方案。');
    const choice=pending.choices.find(c=>c.id===choiceId);
    if(!choice)throw new GameError('請選擇畫面上的劇情分支。');
    const context={card:{
      title:pending.card.title,detail:pending.card.detail,scene:pending.scene,
      choiceLabel:choice.label,success:choice.success,fail:choice.fail
    }};
    message(room,'📜 '+player.name+' 選擇「'+choice.label+'」，接著挑戰一道數學題。');
    if(choice.id==='bold')this.unlockAchievement(room,player,'story_brave');
    this.ask(room,pending.cardType,context,{label:pending.card.title});
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
    const question=this.takeQuestion(room,kind);
    room.pending={
      type:kind, question, context,
      stage:opts.stage ?? 1, total:opts.total ?? 1, correctCount:opts.correctCount ?? 0,
      expiresAt: Date.now()+room.questionSeconds*1000
    };
    room.poll={id:randomUUID(),questionId:question.id,actorId:room.currentPlayerId,choices:{}};
    room.lastPoll=null;
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
        message(room, `🏠 ${player.name} 支付 $${tile.rent} 過路費給屋主 ${owner.name}。`);
        this.beginDuel(room,player,owner,tile);return;
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
      this.beginStory(room,type,card,tile);
      return;
    }
    this.ask(room,type,{}, {label:tile.name,total:type==='boss'?2:1});
  }

  answer(room,playerId,choice) {
    const player=requireTurn(room,playerId);
    if(room.phase!=='answering'||!room.pending) throw new GameError('目前沒有等待作答的題目。');
    const pending=room.pending;
    if(!Number.isInteger(choice) || choice < 0 || choice >= 4) throw new GameError('請選擇有效的答案。');
    const timedOut=Date.now()>pending.expiresAt;
    const correct=choice===pending.question.correctIndex && !timedOut;
    return this.resolveAnswer(room,player,correct,{reason:timedOut?'timeout':'answer'});
  }

  resolveAnswer(room,player,correct,{reason='answer'}={}) {
    const pending=room.pending;
    if(!pending || room.phase!=='answering') return;
    const q=pending.question;
    if(reason!=='skipped') {
      player.attempted++;
      if(correct)player.correct++;
      player.answerHistory.push({questionId:q.id,skill:BANK[q.kind]?.find(item=>item.id===q.id)?.skill||'multi',
        result:correct?'correct':reason==='timeout'?'timeout':'wrong',at:Date.now()});
    }
    if(room.poll){
      if(reason!=='skipped'){
        const entries=Object.entries(room.poll.choices);
        const correctCount=entries.filter(([,index])=>index===q.correctIndex).length;
        room.lastPoll={id:room.poll.id,questionId:room.poll.questionId,total:entries.length,correctCount,
          byViewer:Object.fromEntries(entries.map(([id,index])=>[id,index===q.correctIndex]))};
        for(const [id,index] of entries){
          const spectator=room.players.find(p=>p.id===id);
          if(!spectator)continue;
          spectator.spectatorAttempted++;
          if(index===q.correctIndex)spectator.spectatorCorrect++;
          this.checkAchievements(room,spectator);
        }
      }else room.lastPoll=null;
    }
    room.poll=null;
    room.pending=null;
    if(reason!=='skipped')this.checkAchievements(room,player);
    const result={correct,correctAnswer:q.correctText,explanation:q.explanation,at:Date.now()};
    room.lastResult=result;
    message(room,reason==='skipped'
      ? `⏭️ 房主略過 ${player.name} 的題目（不列入學習統計）。正解是「${q.correctText}」。${q.explanation}`
      : `${correct?'✅':'❌'} ${player.name} ${correct?'答對了！':reason==='timeout'?'作答逾時。':'未答對。'}正解是「${q.correctText}」。${q.explanation}`);
    if(pending.type==='boss') {
      const nextCount=pending.correctCount+Number(correct);
      if(pending.stage<2) {
        this.ask(room,'boss',{}, {label:'Boss 第 2 階段',stage:2,total:2,correctCount:nextCount});
        return;
      }
      const reward=nextCount===2?140:nextCount===1?45:-90;
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
          ? `🛟 救援成功！${player.name} 支出 $${paid}，學習基金補足 $${rent-paid}，屋主獲得完整租金。`
          : `💸 救援未成功：${player.name} 支出現金 $${paid}，並暫停下次擲骰一次。`);
      } else {
        const paid=Math.min(player.cash,correct?30:60);
        changeCash(player,-paid);
        if(!correct) player.missedTurns++;
        message(room, `🧾 ${correct?'答對減半':'未答對'}，${player.name} 實際繳出 $${paid}${correct?'':'，並暫停下次擲骰一次'}。`);
      }
      if(cause==='rent') {
        const owner=room.players.find(p=>p.id===ownerId);
        const tile=BOARD[pending.context.tileId];
        if(owner && tile) this.beginDuel(room,player,owner,tile);
        else room.phase='between';
      } else room.phase='between';
      return;
    }
    const rules={
      calc:[45,0], discount:[50,0], compare:[65,0], scam:[55,-80],
      chest:[90,10], chance:[60,-60], fate:[50,-80]
    };
    const delta=pending.context.card
      ? pending.context.card[correct?'success':'fail']
      : (rules[pending.type]?.[correct?0:1] ?? 0);
    const bonus=correct?room.bonusStage*15:0;
    const actual=changeCash(player,delta+bonus);
    if(pending.context.card)message(room,'🎴 '+player.name+' 的「'+pending.context.card.title+'」分支「'+pending.context.card.choiceLabel+'」已揭曉。');
    message(room, `${correct?'🌟':'📦'} ${player.name} ${actual>0?`獲得 $${actual}`:actual<0?`失去 $${-actual}`:'金額不變'}${bonus?`（含終盤加碼 $${bonus}）`:''}。`);
    room.phase='between';
  }

  // 屋主與租客同步出招；出手結果先藏在伺服器，兩人出招後才揭露。
  beginDuel(room,renter,owner,tile) {
    if(!owner.connected || !renter.connected) {
      message(room, `🛜 ${owner.connected?'租客':'屋主'}暫時離線，本次只付原過路費、免加賽。`);
      room.duel=null;room.phase='between';return;
    }
    const mode=Math.random()<.5?'rps':'turtle';
    const duel={id:randomUUID(),renterId:renter.id,ownerId:owner.id,tileId:tile.id,
      mode,round:1,maxRounds:mode==='rps'?3:4,attackerId:owner.id,
      choices:{},expiresAt:Date.now()+DUEL_SECONDS*1000,
      stake:40+(room.bonusStage===2?20:0),lastExchange:null};
    room.duel=duel;room.lastDuel=null;room.phase='duel';
    message(room, `⚔️ ${renter.name} 與屋主 ${owner.name} 進行「${mode==='rps'?'猜拳':'烏龜烏龜翹'}」！輸家額外支付最多 $${duel.stake}。`);
  }

  duelChoice(room,playerId,choice) {
    const duel=room.duel;
    if(room.status!=='playing'||room.phase!=='duel'||!duel) throw new GameError('現在沒有進行中的雙人小遊戲。');
    if(![duel.renterId,duel.ownerId].includes(playerId)) throw new GameError('這場對戰只有屋主和租客可以出招。');
    const optionCount=duel.mode==='rps'?3:5;
    if(!Number.isInteger(choice)||choice<0||choice>=optionCount) throw new GameError('請選擇有效的手勢。');
    if(Object.hasOwn(duel.choices,playerId)) throw new GameError('你已出手，請等待對方。');
    if(Date.now()>duel.expiresAt) throw new GameError('本回合出手時間已過。');
    duel.choices[playerId]=choice;
    if(Object.keys(duel.choices).length===2)this.resolveDuelRound(room);
    else message(room,'✋ 一方已經出招，等待另一方選擇（手勢保密）。');
  }

  resolveDuelRound(room) {
    const d=room.duel;
    if(!d)return;
    const a=d.choices[d.renterId],b=d.choices[d.ownerId];
    if(a===undefined||b===undefined)return;
    d.lastExchange={round:d.round,renterChoice:a,ownerChoice:b,attackerId:d.attackerId};
    if(d.mode==='rps') {
      if(a!==b) {
        const renterWins=(a-b+3)%3===1; // 0石頭、1布、2剪刀
        this.finishDuel(room,renterWins?d.renterId:d.ownerId,'雙方猜拳分出勝負');return;
      }
    } else if(a===b) {
      this.finishDuel(room,d.attackerId,'烏龜烏龜翹：攻擊方與對方翹了相同手指');return;
    } else d.attackerId=d.attackerId===d.renterId?d.ownerId:d.renterId;
    if(d.round>=d.maxRounds){this.finishDuel(room,null,'連續平手，本次加賽不轉帳');return;}
    d.round++;d.choices={};d.expiresAt=Date.now()+DUEL_SECONDS*1000;
    message(room, `🔄 ${d.mode==='rps'?'猜拳平手':'兩人手指不同，交換攻守'}！第 ${d.round}/${d.maxRounds} 回合。`);
  }

  finishDuel(room,winnerId,reason) {
    const d=room.duel;if(!d)return;
    const loserId=winnerId===d.ownerId?d.renterId:winnerId===d.renterId?d.ownerId:null;
    const winner=room.players.find(p=>p.id===winnerId);
    const loser=room.players.find(p=>p.id===loserId);
    const paid=winner&&loser?Math.min(d.stake,loser.cash):0;
    if(paid){changeCash(loser,-paid);changeCash(winner,paid);}
    room.lastDuel={id:d.id,mode:d.mode,at:Date.now(),winnerId:winnerId||null,
      loserId,paid,stake:d.stake,reason,round:d.round,lastExchange:d.lastExchange};
    if(winner&&loser)message(room, `🏆 ${winner.name} 對戰獲勝！${loser.name} 額外補貼 $${paid}（約定最多 $${d.stake}；現金不足不欠款）。`);
    else message(room, `🤝 雙人對戰平手／無人出手，不需額外付錢。`);
    room.duel=null;room.phase='between';
  }

  duelTimeout(room) {
    const d=room.duel;if(!d)return;
    const renterReady=Object.hasOwn(d.choices,d.renterId);
    const ownerReady=Object.hasOwn(d.choices,d.ownerId);
    if(renterReady!==ownerReady) {
      this.finishDuel(room,renterReady?d.renterId:d.ownerId,'對方逾時未出手');
    } else this.finishDuel(room,null,'雙方逾時未出手');
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
      this.checkAchievements(room,player);
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
      this.resolveAnswer(room,current,false,{reason:'skipped'});
      // Boss 第一關失敗後會進入第二題，再跳一次可完成。
      if(room.phase==='answering' && room.pending) this.resolveAnswer(room,current,false,{reason:'skipped'});
    }
    if(hostOverride && room.phase==='story')message(room,'⏭️ 房主略過本次劇情事件。');
    if(hostOverride && room.phase==='buying') room.pending=null;
    if(hostOverride && room.phase==='duel') {room.duel=null;message(room,'⏭️ 房主略過雙人對戰，本次不額外轉帳。');}
    if(hostOverride && room.phase==='rolling') message(room,'⏭️ 房主跳過本次擲骰。');
    room.pending=null;room.poll=null;
    room.phase='rolling';
    if(room.endsAt && Date.now()>=room.endsAt){this.finish(room);return;}
    room.turnIndex++;
    if(room.turnIndex>=room.players.length) {room.turnIndex=0;room.round++;}
    if(room.roundLimit!==null && room.round>room.roundLimit) {this.finish(room);return;}
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
      if(room.roundLimit!==null && room.round>room.roundLimit) {this.finish(room);return;}
      room.currentPlayerId=room.players[room.turnIndex].id;
      safety++;
    }
    message(room, `🎯 第 ${room.round} ${room.roundLimit===null?'輪（無輪數上限）':'/ '+room.roundLimit+' 輪'}：輪到 ${room.players[room.turnIndex].name}！`);
  }

  saveReflection(room,playerId,text) {
    if(room.status!=='finished')throw new GameError('請在遊戲結算後填寫回饋。');
    const player=room.players.find(p=>p.id===playerId);
    if(!player)throw new GameError('找不到這位玩家。');
    if(typeof text!=='string')throw new GameError('請輸入文字回饋。');
    const normalized=text.replace(/\r\n?/g,'\n').trim();
    if(!normalized)throw new GameError('請先寫下至少一句心得，再送出回饋。');
    if([...normalized].length>MAX_REFLECTION_LENGTH)throw new GameError('心得最多 600 字，請精簡後再送出。');
    if(/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(normalized))throw new GameError('心得包含無法儲存的字元。');
    player.reflection={text:normalized,savedAt:Date.now()};
    room.updatedAt=Date.now();
    return player.reflection;
  }

  finish(room) {
    room.status='finished';room.phase='finished';room.currentPlayerId=null;
    room.pending=null;room.duel=null;room.poll=null;room.botAction=null;
    room.rankings=room.players.map(p=>({id:p.id,name:p.name,animal:p.animal,
      cash:p.cash,landValue:p.properties.reduce((v,id)=>v+BOARD[id].price,0),
      score:p.cash+p.properties.reduce((v,id)=>v+BOARD[id].price,0),
      correct:p.correct,attempted:p.attempted,titleId:p.titleId,achievements:p.achievements.length,isBot:!!p.isBot})).sort((a,b)=>b.score-a.score||b.correct-a.correct);
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
    room.round=1;room.rankings=[];room.pending=null;room.properties={};room.botAction=null;
    room.lastRoll=null;room.lastResult=null;room.duel=null;room.lastDuel=null;room.endsAt=null;room.bonusStage=0;room.questionQueues={};room.poll=null;room.lastPoll=null;room.lastAchievement=null;
    room.players.forEach(p=>{p.cash=0;p.properties=[];p.position=0;p.missedTurns=0;p.correct=0;p.attempted=0;p.answerHistory=[];p.reflection=null;p.achievements=[];p.titleId=null;p.spectatorCorrect=0;p.spectatorAttempted=0;});
    message(room,'🔁 房主已開啟下一局，所有玩家保留座位。');
  }

  publicState(room,viewerId=null) {
    const finished=room.status==='finished';
    const viewer=finished?room.players.find(p=>p.id===viewerId):null;
    return {
      code:room.code,status:room.status,phase:room.phase,round:room.round,
      settings:{...room.settings},
      roundLimit:room.roundLimit,startMoney:room.startMoney,currentPlayerId:room.currentPlayerId,
      durationMinutes:room.durationMinutes,endsAt:room.endsAt,questionSeconds:room.questionSeconds,bonusStage:room.bonusStage,
      players:room.players.map(p=>({id:p.id,name:p.name,animal:p.animal,host:p.host,isBot:!!p.isBot,
        connected:p.connected,cash:p.cash,properties:p.properties,position:p.position,
        missedTurns:p.missedTurns,correct:p.correct,attempted:p.attempted,
        achievements:[...p.achievements],titleId:p.titleId})),
      achievementCatalog:ACHIEVEMENTS,lastAchievement:room.lastAchievement,
      mySpectatorScore:(()=>{const mine=room.players.find(p=>p.id===viewerId);return mine?{correct:mine.spectatorCorrect,attempted:mine.spectatorAttempted}:null;})(),
      spectatorPoll:room.poll?{id:room.poll.id,total:Math.max(0,room.players.length-1),submitted:Object.keys(room.poll.choices).length,
        myChoice:viewerId&&Object.hasOwn(room.poll.choices,viewerId)?room.poll.choices[viewerId]:null}:null,
      lastPoll:room.lastPoll?{id:room.lastPoll.id,questionId:room.lastPoll.questionId,total:room.lastPoll.total,
        correctCount:room.lastPoll.correctCount,myCorrect:viewerId&&Object.hasOwn(room.lastPoll.byViewer,viewerId)?room.lastPoll.byViewer[viewerId]:null}:null,
      board:BOARD,properties:room.properties,lastRoll:room.lastRoll,lastResult:room.lastResult,lastDuel:room.lastDuel,
      duel:room.duel&&{id:room.duel.id,mode:room.duel.mode,round:room.duel.round,maxRounds:room.duel.maxRounds,
        renterId:room.duel.renterId,ownerId:room.duel.ownerId,attackerId:room.duel.attackerId,tileId:room.duel.tileId,
        ready:{renter:Object.hasOwn(room.duel.choices,room.duel.renterId),owner:Object.hasOwn(room.duel.choices,room.duel.ownerId)},
        expiresAt:room.duel.expiresAt,stake:room.duel.stake,lastExchange:room.duel.lastExchange},
      pending:room.pending && (room.pending.type==='buying'
        ? {type:'buying',tileId:room.pending.tileId}
        : room.pending.type==='story'
          ? {type:'story',story:{title:room.pending.card.title,scene:room.pending.scene,
              choices:room.pending.choices.map(({id,label,detail,success,fail})=>({id,label,detail,success,fail}))},expiresAt:room.pending.expiresAt}
        : {type:room.pending.type,stage:room.pending.stage,total:room.pending.total,
           card:room.pending.context?.card
             ? {title:room.pending.context.card.title,detail:room.pending.context.card.detail} : null,
           question:{id:room.pending.question.id,text:room.pending.question.text,
             options:room.pending.question.options},expiresAt:room.pending.expiresAt}),
      log:room.log,rankings:room.rankings,
      classFeedback:finished?summarizeClass(room.players.filter(p=>!p.isBot)):null,
      personalFeedback:viewer?summarizePlayer(viewer.answerHistory):null,
      myReflection:viewer?.reflection??null,
      hostReflections:finished&&viewer?.host?room.players.filter(p=>!p.isBot).map(p=>({
        id:p.id,name:p.name,animal:p.animal,reflection:p.reflection?{...p.reflection}:null
      })):null
    };
  }

  tick(onChange) {
    const now=Date.now();
    for(const room of this.rooms.values()) {
      if(now-room.updatedAt>ROOM_TTL_MS) {this.rooms.delete(room.code);continue;}
      if(room.status!=='playing')continue;
      let changed=false;
      const step=Math.min(2,Math.floor((now-(room.endsAt-room.durationMinutes*60*1000))/(room.durationMinutes*60*1000/3)));
      if(step>room.bonusStage){
        room.bonusStage=step;
        message(room,step===1?'✨ 中場加碼！之後數學挑戰答對額外獎勵 $15。':'🚀 最後衝刺！數學挑戰答對額外獎勵 $30，小遊戲補貼上限提高到 $60。');
        changed=true;
      }
      if(room.phase==='story'&&room.pending?.expiresAt<=now){
        this.chooseStory(room,room.currentPlayerId,'safe',true);changed=true;
      }
      if(room.phase==='answering'&&room.pending?.expiresAt && room.pending.expiresAt<=now){
        const p=room.players.find(p=>p.id===room.currentPlayerId);
        if(p){message(room,'⏰ 作答時間到，按未答對處理。');this.resolveAnswer(room,p,false,{reason:'timeout'});changed=true;}
      }
      if(room.duel?.expiresAt && room.duel.expiresAt<=now){this.duelTimeout(room);changed=true;}
      // 時間結束時不截斷正在作答、購地或對戰的回合；完成後結算。
      if(room.endsAt && now>=room.endsAt && ['between','rolling'].includes(room.phase)){
        message(room,`⏰ ${room.durationMinutes} 分鐘課堂時段已結束，開始總資產結算。`);
        this.finish(room);changed=true;
      }
      if(room.status==='playing'&&this.botStep(room,now))changed=true;
      if(changed)onChange(room);
    }
  }
}
module.exports={GameManager,GameError,MAX_PEOPLE,QUESTION_SECONDS};
