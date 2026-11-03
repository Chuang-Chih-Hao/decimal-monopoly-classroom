'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {GameManager,GameError}=require('../game');
const {BANK,TOTAL}=require('../questions');
const {BOARD,ANIMALS}=require('../board');

function setup() {
  const game=new GameManager();
  const {room,player:host}=game.newRoom('房主','capybara');
  const {player:student}=game.join(room.code,'學生','🐈');
  game.start(room,host.id,{rounds:4,money:900});
  return {game,room,host,student};
}
function forceDie(game,room,playerId,die) {
  const old=Math.random;
  Math.random=()=> (die-1)/6+0.00001;
  try {return game.roll(room,playerId);} finally {Math.random=old;}
}
function chooseCorrect(room) {return room.pending.question.correctIndex;}
function chooseWrong(room) {return (room.pending.question.correctIndex+1)%4;}

test('題庫各類別存在、每題 4 個不同選項，共超過 75 題',()=>{
  assert.ok(TOTAL>=75,`題庫只有 ${TOTAL} 題`);
  for(const type of ['purchase','calc','discount','compare','scam','chest','chance','fate','boss','rescue']){
    assert.ok(BANK[type]?.length>=8,`${type} 題數不足`);
    for(const q of BANK[type]) assert.equal(new Set([q.answer,...q.distractors]).size,4,q.id);
  }
});

test('房主＋五人最多六位，動物與暱稱不可重複',()=>{
  const game=new GameManager();
  const {room}=game.newRoom('老師',ANIMALS[0]);
  assert.throws(()=>game.join(room.code,'學生一',ANIMALS[0]),GameError);
  for(let i=1;i<=5;i++)game.join(room.code,`學生${i}`,ANIMALS[i]);
  assert.equal(room.players.length,6);
  assert.throws(()=>game.join(room.code,'第六位學生',ANIMALS[6]),GameError);
});

test('學生不能擅自開始，至少兩人且可自訂輪數與資金',()=>{
  const game=new GameManager();
  const {room,player:host}=game.newRoom('老師',ANIMALS[0]);
  assert.throws(()=>game.start(room,host.id),GameError);
  const {player:guest}=game.join(room.code,'小宇',ANIMALS[1]);
  assert.throws(()=>game.start(room,guest.id),GameError);
  game.start(room,host.id,{rounds:6,money:1200});
  assert.equal(room.roundLimit,6);assert.equal(guest.cash,1200);
});

test('答對購地，付購地金額並取得所有權，前端看不到正解',()=>{
  const {game,room,host}=setup();
  forceDie(game,room,host.id,1);
  assert.equal(room.phase,'answering');
  assert.equal(room.pending.type,'purchase');
  const snapshot=game.publicState(room);
  assert.equal(snapshot.pending.question.correctIndex,undefined);
  assert.equal(snapshot.pending.question.correctText,undefined);
  assert.equal(JSON.stringify(snapshot).includes('correctIndex'),false);
  game.answer(room,host.id,chooseCorrect(room));
  assert.equal(room.phase,'buying');
  game.decideBuy(room,host.id,true);
  assert.equal(host.cash,760);assert.equal(room.properties[1],host.id);
  assert.deepEqual(host.properties,[1]);
});

test('答錯購地不可買房；不能重複作答',()=>{
  const {game,room,host}=setup();
  forceDie(game,room,host.id,1);
  game.answer(room,host.id,chooseWrong(room));
  assert.equal(room.phase,'between');
  assert.equal(room.properties[1],undefined);
  assert.throws(()=>game.answer(room,host.id,0),GameError);
});

test('正常過路費從租客轉給屋主',()=>{
  const {game,room,host,student}=setup();
  room.properties[1]=host.id;host.properties.push(1);
  game.nextTurn(room,host.id,true);
  forceDie(game,room,student.id,1);
  assert.equal(student.cash,865);assert.equal(host.cash,935);
  assert.equal(room.phase,'duel');
  assert.equal(room.duel.renterId,student.id);
  assert.equal(room.duel.ownerId,host.id);
});

test('租金不足先作救援題，答對有補助，答錯暫停下一輪',()=>{
  for(const correct of [true,false]){
    const {game,room,host,student}=setup();
    room.properties[1]=host.id;host.properties.push(1);
    student.cash=10;
    game.nextTurn(room,host.id,true);
    forceDie(game,room,student.id,1);
    assert.equal(room.phase,'answering');assert.equal(room.pending.type,'rescue');
    game.answer(room,student.id,correct?chooseCorrect(room):chooseWrong(room));
    assert.equal(student.cash,0);
    assert.equal(host.cash,correct?935:910);
    assert.equal(student.missedTurns,correct?0:1);
  }
});

test('Boss 有 2 道題，兩題對加 $140、只有一題對加 $45',()=>{
  const {game,room,host}=setup();
  host.position=20;
  forceDie(game,room,host.id,1);
  assert.equal(room.pending.type,'boss');assert.equal(room.pending.total,2);
  game.answer(room,host.id,chooseCorrect(room));
  assert.equal(room.pending.stage,2);
  game.answer(room,host.id,chooseWrong(room));
  assert.equal(host.cash,945);assert.equal(room.phase,'between');
  assert.equal(host.attempted,2);assert.equal(host.correct,1);
});

test('經過起點領薪水，回合結束排序以資產計算',()=>{
  const {game,room,host,student}=setup();
  host.position=BOARD.length-1;
  forceDie(game,room,host.id,1);
  assert.equal(host.position,0);assert.equal(host.cash,1100);
  assert.equal(room.phase,'between');
  game.finishByHost(room,host.id);
  assert.equal(room.status,'finished');
  assert.equal(room.rankings[0].id,host.id);
  assert.throws(()=>game.roll(room,host.id),GameError);
  game.reset(room,host.id);
  assert.equal(room.status,'lobby');assert.equal(room.players.length,2);
});

test('問答逾時視為答錯、題目會在同類型用完前不重複',()=>{
  const {game,room,host}=setup();
  const ids=new Set();
  for(let i=0;i<BANK.purchase.length;i++){
    const question=game.takeQuestion(room,'purchase');
    assert.ok(!ids.has(question.id));ids.add(question.id);
  }
  game.ask(room,'calc');
  room.pending.expiresAt=Date.now()-1;
  game.tick(()=>{});
  assert.equal(room.phase,'between');
  assert.equal(host.attempted,1);
});


test('每次擲骰附有唯一事件 ID、起點與終點，供全房間重播動畫',()=>{
  const {game,room,host,student}=setup();
  host.position=BOARD.length-1;
  forceDie(game,room,host.id,3);
  const first=game.publicState(room).lastRoll;
  assert.match(first.id,/^[0-9a-f-]{36}$/);
  assert.equal(first.from,BOARD.length-1);
  assert.equal(first.position,2);
  assert.equal(first.die,3);
  game.nextTurn(room,host.id,true);
  forceDie(game,room,student.id,2);
  const second=game.publicState(room).lastRoll;
  assert.notEqual(first.id,second.id);
  assert.equal(second.from,0);
  assert.equal(second.position,2);
});

test('80 元打 7.5 折：省下 20 元、售價 60 元的題目解析完整且不混淆',()=>{
  const discount=BANK.discount.find(q=>q.question.includes('原價 80 元'));
  const scam=BANK.scam.find(q=>q.question.includes('原價 80 元'));
  assert.ok(discount);assert.equal(discount.answer,'20 元');
  assert.match(discount.explanation,/80 × 0\.75 = 60/);
  assert.match(discount.explanation,/80 − 60 = 20/);
  assert.ok(scam);assert.equal(scam.answer,'60 元');
  assert.match(scam.explanation,/多收了 10 元/);
});


test('棋盤剛好 30 格、索引連續且房產價格／租金合法',()=>{
  assert.equal(BOARD.length,30);
  for(let i=0;i<BOARD.length;i++){
    assert.equal(BOARD[i].id,i);
    if(BOARD[i].type==='property'){
      assert.ok(BOARD[i].price>0);assert.ok(BOARD[i].rent>0);
      assert.ok(BOARD[i].rent<BOARD[i].price);
    }
  }
});

test('每題預設 120 秒、房主可調整至 180 秒，30 分鐘結算上限',()=>{
  const {game,room,host}=setup();
  const now=Date.now();
  game.ask(room,'calc');
  assert.ok(room.pending.expiresAt-now<=121000);
  assert.ok(room.pending.expiresAt-now>=119000);
  assert.equal(room.questionSeconds,120);
  const publicRoom=game.publicState(room);
  assert.equal(publicRoom.questionSeconds,120);
  assert.equal(publicRoom.durationMinutes,30);
  const newGame=new GameManager();
  const {room:other,player:teacher}=newGame.newRoom('老師','capybara');
  newGame.join(other.code,'同學','🐈');
  newGame.start(other,teacher.id,{rounds:12,money:900,questionSeconds:180,durationMinutes:30});
  newGame.ask(other,'calc');
  assert.equal(other.questionSeconds,180);
  assert.ok(other.pending.expiresAt-Date.now()>=179000);
});

test('91 題均有具體情境和完整解析、對比價／折扣關鍵量明確',()=>{
  for(const qs of Object.values(BANK))for(const q of qs){
    assert.ok(q.question.length>=33,`${q.id} 題目太短`);
    assert.ok(q.explanation.includes('解題步驟'),`${q.id} 缺解析`);
    assert.ok(q.explanation.includes('解題提醒'),`${q.id} 缺提醒`);
  }
  assert.match(BANK.discount[6].question,/省下多少元/);
  assert.match(BANK.scam[4].question,/應付售價/);
  assert.match(BANK.boss[6].question,/半箱/);
});

test('租金先扣，再雙人猜拳，伺服器不外洩雙方未公開的手勢',()=>{
  const {game,room,host,student}=setup();
  room.properties[1]=host.id;host.properties.push(1);
  game.nextTurn(room,host.id,true);forceDie(game,room,student.id,1);
  assert.equal(student.cash,865);assert.equal(host.cash,935);
  assert.equal(room.phase,'duel');
  room.duel.mode='rps';
  const snap=game.publicState(room);
  assert.deepEqual(snap.duel.ready,{renter:false,owner:false});
  assert.equal(JSON.stringify(snap.duel).includes('choices'),false);
  assert.throws(()=>game.duelChoice(room,'路人',0),GameError);
  game.duelChoice(room,student.id,0); // 石頭
  assert.deepEqual(game.publicState(room).duel.ready,{renter:true,owner:false});
  assert.equal(JSON.stringify(game.publicState(room).duel).includes('choices'),false);
  assert.throws(()=>game.duelChoice(room,student.id,0),GameError);
  game.duelChoice(room,host.id,2); // 剪刀
  assert.equal(room.phase,'between');
  assert.equal(room.lastDuel.winnerId,student.id);
  assert.equal(room.lastDuel.paid,40);
  assert.equal(student.cash,905);assert.equal(host.cash,895);
});

test('猜拳平手重賽、烏龜烏龜翹相同手指時攻擊方獲勝',()=>{
  const {game,room,host,student}=setup();
  game.beginDuel(room,student,host,BOARD[1]);
  room.duel.mode='rps';room.duel.maxRounds=3;
  game.duelChoice(room,host.id,1);
  game.duelChoice(room,student.id,1);
  assert.equal(room.duel.round,2);
  assert.equal(room.phase,'duel');
  room.duel.mode='turtle';room.duel.maxRounds=4;
  room.duel.attackerId=host.id;
  game.duelChoice(room,host.id,3);
  game.duelChoice(room,student.id,3);
  assert.equal(room.phase,'between');
  assert.equal(room.lastDuel.winnerId,host.id);
  assert.equal(student.cash,860);assert.equal(host.cash,940);
});

test('烏龜烏龜翹不同手指交換攻守；無限迴圈由回合上限阻止',()=>{
  const {game,room,host,student}=setup();
  game.beginDuel(room,student,host,BOARD[1]);
  room.duel.mode='turtle';room.duel.maxRounds=4;room.duel.attackerId=host.id;
  for(let round=1;round<=4;round++){
    game.duelChoice(room,host.id,0);
    game.duelChoice(room,student.id,1);
    if(round<4){assert.equal(room.duel.round,round+1);assert.equal(room.duel.attackerId,round%2?student.id:host.id);}
  }
  assert.equal(room.phase,'between');assert.equal(room.lastDuel.winnerId,null);
  assert.equal(host.cash,900);assert.equal(student.cash,900);
});

test('小遊戲逾時：已出招者獲勝；兩人皆未出招則免付補貼',()=>{
  const {game,room,host,student}=setup();
  game.beginDuel(room,student,host,BOARD[1]);
  room.duel.mode='rps';game.duelChoice(room,host.id,0);
  room.duel.expiresAt=Date.now()-1;game.tick(()=>{});
  assert.equal(room.phase,'between');assert.equal(room.lastDuel.winnerId,host.id);
  game.beginDuel(room,student,host,BOARD[1]);
  room.duel.expiresAt=Date.now()-1;game.tick(()=>{});
  assert.equal(room.lastDuel.winnerId,null);
});

test('補貼只付身上有的現金，且租金不足救援後仍會觸發加賽',()=>{
  const {game,room,host,student}=setup();
  room.properties[1]=host.id;host.properties.push(1);
  game.nextTurn(room,host.id,true);
  student.cash=10;forceDie(game,room,student.id,1);
  assert.equal(room.pending.type,'rescue');
  game.answer(room,student.id,chooseCorrect(room));
  assert.equal(student.cash,0);
  assert.equal(room.phase,'duel');
  room.duel.mode='rps';
  game.duelChoice(room,host.id,2);game.duelChoice(room,student.id,0);
  assert.equal(room.lastDuel.winnerId,student.id);
  assert.equal(room.lastDuel.paid,40); // 屋主有足夠現金
  assert.equal(student.cash,40);
  game.beginDuel(room,student,host,BOARD[1]);
  room.duel.mode='rps';student.cash=2;
  game.duelChoice(room,host.id,0);game.duelChoice(room,student.id,2);
  assert.equal(room.lastDuel.paid,2);assert.equal(student.cash,0);
});

test('30 分鐘到期後由伺服器自動結算；進行中的答題不會被半途截斷',()=>{
  const {game,room,host}=setup();
  game.ask(room,'calc');room.endsAt=Date.now()-1;
  game.tick(()=>{});
  assert.equal(room.status,'playing');
  game.answer(room,host.id,chooseCorrect(room));
  game.tick(()=>{});
  assert.equal(room.status,'finished');
});

test('後段加碼會更新獎勵，答對數學題額外獲得 $30',()=>{
  const {game,room,host}=setup();
  room.endsAt=Date.now()+9*60*1000; // 從 30 分鐘原始期限倒推，已遊玩 21 分鐘
  game.tick(()=>{});
  assert.equal(room.bonusStage,2);
  game.ask(room,'calc');game.answer(room,host.id,chooseCorrect(room));
  assert.equal(host.cash,900+45+30);
});

test('小遊戲由房主略過時不進行額外轉帳',()=>{
  const {game,room,host,student}=setup();
  room.properties[1]=host.id;host.properties.push(1);
  game.nextTurn(room,host.id,true);forceDie(game,room,student.id,1);
  assert.equal(room.phase,'duel');
  const before=[host.cash,student.cash];
  game.nextTurn(room,host.id,true);
  assert.deepEqual([host.cash,student.cash],before);
  assert.equal(room.duel,null);
  assert.equal(room.currentPlayerId,host.id);
});

// v1.4：無限輪與學習回饋
const {SKILLS}=require('../questions');
const {summarizePlayer,summarizeClass}=require('../feedback');

test('開房提供無限輪設定；合法值不會被轉成 NaN，非法值會拒絕',()=>{
  const g=new GameManager();const {room,player:host}=g.newRoom('教師','capybara');
  g.join(room.code,'小安','🐈');
  assert.throws(()=>g.start(room,host.id,{rounds:'forever'}),GameError);
  g.start(room,host.id,{rounds:'unlimited',durationMinutes:30});
  assert.equal(room.roundLimit,null);
  assert.equal(g.publicState(room).roundLimit,null);
  assert.ok(room.endsAt-Date.now()>29*60*1000);
});

test('無限輪跑超過 12 輪不會提前結算；30 分鐘時仍會自動結束',()=>{
  const g=new GameManager();const {room,player:host}=g.newRoom('教師','capybara');
  g.join(room.code,'小安','🐈');
  g.start(room,host.id,{rounds:'unlimited',durationMinutes:30});
  for(let i=0;i<30;i++)g.nextTurn(room,host.id,true);
  assert.equal(room.round,16);
  assert.equal(room.status,'playing');
  room.endsAt=Date.now()-1;
  g.tick(()=>{});
  assert.equal(room.status,'finished');
  assert.equal(room.rankings.length,2);
});

test('有限輪仍依正常規則結算；房主在無限輪可主動提前結算',()=>{
  const {game,room,host}=setup();
  room.roundLimit=2;
  for(let i=0;i<4;i++)game.nextTurn(room,host.id,true);
  assert.equal(room.status,'finished');
  const g=new GameManager();const created=g.newRoom('教師','capybara');
  g.join(created.room.code,'學生','🐈');g.start(created.room,created.player.id,{rounds:'unlimited'});
  g.finishByHost(created.room,created.player.id);
  assert.equal(created.room.status,'finished');
});

test('91 道題目均有一個有效的數學能力分類，包括機會、命運、Boss',()=>{
  for(const qs of Object.values(BANK))for(const q of qs){
    assert.ok(SKILLS[q.skill],`${q.id} 沒有正確技能標籤`);
  }
  assert.equal(BANK.chance[0].skill,'discount');
  assert.equal(BANK.chance[1].skill,'multiply');
  assert.equal(BANK.boss[2].skill,'unit');
  assert.equal(BANK.scam[4].skill,'discount');
});

test('依實際數學能力分類錯題；錯誤數與正確率、解析都正確',()=>{
  const {game,room,host,student}=setup();
  room.questionQueues.chance=[BANK.chance[0].id];
  game.ask(room,'chance');
  assert.equal(room.pending.question.id,'chance-1');
  game.answer(room,host.id,chooseWrong(room));
  room.questionQueues.chance=[BANK.chance[1].id];
  game.ask(room,'chance');game.answer(room,host.id,chooseCorrect(room));
  game.finishByHost(room,host.id);
  const feedback=game.publicState(room,host.id).personalFeedback;
  assert.equal(feedback.attempted,2);
  assert.equal(feedback.correct,1);
  assert.equal(feedback.accuracy,50);
  assert.equal(feedback.weakSkills[0].name,'折扣、折數與省錢');
  assert.equal(feedback.weakSkills[0].wrong,1);
  assert.equal(feedback.examples[0].questionId,'chance-1');
  assert.match(feedback.examples[0].explanation,/解題步驟/);
  assert.equal(game.publicState(room,student.id).personalFeedback.attempted,0);
  assert.equal(game.publicState(room).personalFeedback,null);
  assert.equal(game.publicState(room,student.id).classFeedback.attempted,2);
  assert.equal(game.publicState(room,student.id).classFeedback.bySkill.find(s=>s.key==='discount').wrong,1);
  assert.equal(JSON.stringify(game.publicState(room,student.id)).includes(BANK.chance[0].question),false);
});

test('逾時與選錯分開標註，超時按答案亦視為逾時',()=>{
  const {game,room,host}=setup();
  game.ask(room,'calc');room.pending.expiresAt=Date.now()-10;
  game.answer(room,host.id,chooseCorrect(room));
  game.finishByHost(room,host.id);
  const feedback=game.publicState(room,host.id).personalFeedback;
  assert.equal(feedback.attempted,1);
  assert.equal(feedback.timedOut,1);
  assert.equal(feedback.weakSkills[0].timedOut,1);
  assert.equal(feedback.examples[0].timedOut,true);
});

test('教師跳過題目不列入學習弱項，重新開局清除舊資料',()=>{
  const {game,room,host}=setup();
  game.ask(room,'calc');
  game.nextTurn(room,host.id,true);
  assert.equal(host.attempted,0);
  assert.equal(host.answerHistory.length,0);
  game.nextTurn(room,host.id,true); // 重新輪到教師角色
  game.ask(room,'discount');
  game.answer(room,host.id,chooseWrong(room));
  game.finishByHost(room,host.id);
  assert.equal(game.publicState(room,host.id).personalFeedback.wrong,1);
  game.reset(room,host.id);
  assert.equal(host.answerHistory.length,0);
  assert.equal(game.publicState(room,host.id).personalFeedback,null);
  game.start(room,host.id,{rounds:'unlimited'});
  assert.equal(game.publicState(room,host.id).personalFeedback,null);
});

test('未答題者有空白學習報告，不以空樣本判定弱項',()=>{
  const blank=summarizePlayer([]);
  assert.equal(blank.attempted,0);
  assert.equal(blank.accuracy,null);
  assert.deepEqual(blank.weakSkills,[]);
  assert.deepEqual(blank.examples,[]);
  assert.equal(summarizeClass([{answerHistory:[]}]).attempted,0);
});


test('等待室四項設定有預設值、房主改選單後所有玩家看到同一版本',()=>{
  const game=new GameManager();
  const {room,player:host}=game.newRoom('主持人','capybara');
  const {player:guest}=game.join(room.code,'玩家','🐈');
  const initial=game.publicState(room,guest.id).settings;
  assert.deepEqual(initial,{rounds:'unlimited',money:900,questionSeconds:120,durationMinutes:30});
  assert.throws(()=>game.updateSettings(room,guest.id,{money:1200}),GameError);
  game.updateSettings(room,host.id,{rounds:8,money:600,questionSeconds:180,durationMinutes:40});
  assert.deepEqual(game.publicState(room,host.id).settings,game.publicState(room,guest.id).settings);
  assert.deepEqual(game.publicState(room,guest.id).settings,{rounds:8,money:600,questionSeconds:180,durationMinutes:40});
  assert.throws(()=>game.updateSettings(room,host.id,{money:999}),GameError);
  assert.throws(()=>game.updateSettings(room,host.id,{admin:true}),GameError);
  assert.equal(game.publicState(room,guest.id).settings.money,600);
  game.start(room,host.id);
  assert.equal(room.roundLimit,8);
  assert.equal(guest.cash,600);
  assert.equal(room.questionSeconds,180);
  assert.equal(room.durationMinutes,40);
  assert.throws(()=>game.updateSettings(room,host.id,{money:1200}),GameError);
});

test('同局結束後學生可提交並修改文字回饋，房主可查看，其他學生不可看',()=>{
  const game=new GameManager();
  const {room,player:host}=game.newRoom('老師','capybara');
  const {player:first}=game.join(room.code,'小安','🐈');
  const {player:second}=game.join(room.code,'小琪','🐕');
  assert.throws(()=>game.saveReflection(room,first.id,'還沒開局'),GameError);
  game.start(room,host.id);
  assert.throws(()=>game.saveReflection(room,first.id,'遊戲進行中'),GameError);
  game.finishByHost(room,host.id);
  const firstText='我學到了 7.5 折是原價乘以 0.75。';
  game.saveReflection(room,first.id,firstText);
  assert.equal(game.publicState(room,first.id).myReflection.text,firstText);
  assert.equal(game.publicState(room,first.id).hostReflections,null);
  assert.equal(game.publicState(room,second.id).myReflection,null);
  assert.equal(game.publicState(room,second.id).hostReflections,null);
  assert.ok(!JSON.stringify(game.publicState(room,second.id)).includes(firstText));
  const all=game.publicState(room,host.id).hostReflections;
  assert.equal(all.length,3);
  assert.equal(all.find(p=>p.id===first.id).reflection.text,firstText);
  assert.equal(all.find(p=>p.id===second.id).reflection,null);
  game.saveReflection(room,first.id,'我下次會先估算答案。');
  assert.equal(game.publicState(room,host.id).hostReflections.find(p=>p.id===first.id).reflection.text,'我下次會先估算答案。');
  assert.throws(()=>game.saveReflection(room,first.id,'  '),GameError);
  assert.throws(()=>game.saveReflection(room,first.id,'字'.repeat(601)),GameError);
  assert.throws(()=>game.saveReflection(room,first.id,'危險\u0000字'),GameError);
  assert.throws(()=>game.saveReflection(room,'fake-id','內容'),GameError);
  assert.equal(game.publicState(room,first.id).myReflection.text,'我下次會先估算答案。');
  game.reset(room,host.id);
  assert.equal(first.reflection,null);
  assert.equal(game.publicState(room,first.id).myReflection,null);
  assert.deepEqual(game.publicState(room,second.id).settings,{rounds:'unlimited',money:900,questionSeconds:120,durationMinutes:30});
});

test('調整金錢平衡：普通題、寶箱與 Boss 頒發較少獎金，基礎購地規則不變',()=>{
  const {game,room,host}=setup();
  game.ask(room,'calc');game.answer(room,host.id,chooseCorrect(room));
  assert.equal(host.cash,945); // 普通數學題從 85 降到 45
  game.ask(room,'compare');game.answer(room,host.id,chooseCorrect(room));
  assert.equal(host.cash,1010); // 比價題從 130 降到 65
  game.ask(room,'chest');game.answer(room,host.id,chooseCorrect(room));
  assert.equal(host.cash,1100); // 寶箱從 180 降到 90
  room.bonusStage=1;game.ask(room,'discount');game.answer(room,host.id,chooseCorrect(room));
  assert.equal(host.cash,1165); // 折扣題 50 + 中場 15
  room.bonusStage=2;game.ask(room,'discount');game.answer(room,host.id,chooseCorrect(room));
  assert.equal(host.cash,1245); // 折扣題 50 + 最後 30
});


// v1.7.0：觀戰猜題由伺服器儲存，玩家之間不可偷看答案。
test('全員觀戰猜題：非當回合玩家可投一票，答案揭曉前不洩漏正解與他人選項',()=>{
  const {game,room,host,student}=setup();
  game.ask(room,'discount');
  const index=chooseCorrect(room);
  assert.throws(()=>game.spectatorGuess(room,host.id,index),GameError);
  assert.throws(()=>game.spectatorGuess(room,student.id,4),GameError);
  game.spectatorGuess(room,student.id,index);
  assert.throws(()=>game.spectatorGuess(room,student.id,0),GameError);
  assert.equal(game.publicState(room,host.id).spectatorPoll.myChoice,null);
  assert.equal(game.publicState(room,student.id).spectatorPoll.myChoice,index);
  assert.equal(game.publicState(room,host.id).spectatorPoll.submitted,1);
  assert.equal(JSON.stringify(game.publicState(room,host.id)).includes('correctIndex'),false);
  assert.equal(student.attempted,0);
  game.answer(room,host.id,index);
  assert.equal(game.publicState(room,host.id).lastPoll.correctCount,1);
  assert.equal(game.publicState(room,student.id).lastPoll.myCorrect,true);
  assert.equal(game.publicState(room,host.id).lastPoll.myCorrect,null);
  assert.equal(student.cash,room.startMoney);
  assert.equal(student.attempted,0);
  assert.equal(student.answerHistory.length,0);
});

test('觀戰猜題：答錯不扣現金、正式答題統計不變，跳過題目不計觀戰成績',()=>{
  const {game,room,host,student}=setup();
  game.ask(room,'calc');game.spectatorGuess(room,student.id,chooseWrong(room));
  game.answer(room,host.id,chooseCorrect(room));
  assert.equal(student.spectatorAttempted,1);
  assert.equal(student.spectatorCorrect,0);
  assert.equal(student.attempted,0);
  assert.equal(student.cash,900);
  game.ask(room,'calc');game.spectatorGuess(room,student.id,chooseCorrect(room));
  game.nextTurn(room,host.id,true);
  assert.equal(student.spectatorAttempted,1);
  assert.equal(room.lastPoll,null);
  assert.throws(()=>game.spectatorGuess(room,student.id,0),GameError);
});

test('觀戰連續猜對三題可解鎖觀戰成就，稱號可裝備但不能冒領未解鎖稱號',()=>{
  const {game,room,host,student}=setup();
  assert.throws(()=>game.equipTitle(room,student.id,'spectator_star'),GameError);
  for(let n=0;n<3;n++){
    game.ask(room,'discount');
    game.spectatorGuess(room,student.id,chooseCorrect(room));
    game.answer(room,host.id,chooseWrong(room));
  }
  assert.equal(student.spectatorCorrect,3);
  assert.equal(student.attempted,0);
  assert.ok(student.achievements.includes('spectator_star'));
  game.equipTitle(room,student.id,'spectator_star');
  assert.equal(game.publicState(room,host.id).players.find(p=>p.id===student.id).titleId,'spectator_star');
  assert.throws(()=>game.equipTitle(room,student.id,'unknown'),GameError);
});

test('命運與機會事件新增劇情兩選一，再進入原題庫作答，其他玩家不能選',()=>{
  const {game,room,host,student}=setup();
  game.land(room,host,BOARD[4]);
  assert.equal(room.phase,'story');
  const options=room.pending.choices;
  assert.equal(options.length,2);
  assert.ok(options[0].fail>=options[1].fail);
  const snapshot=game.publicState(room,student.id);
  assert.ok(snapshot.pending.story.scene.length>10);
  assert.equal(snapshot.pending.question,undefined);
  assert.throws(()=>game.chooseStory(room,student.id,'safe'),GameError);
  assert.throws(()=>game.chooseStory(room,host.id,'hack'),GameError);
  game.chooseStory(room,host.id,'bold');
  assert.equal(room.phase,'answering');
  assert.equal(room.pending.type,'chance');
  assert.ok(host.achievements.includes('story_brave'));
  assert.ok(!JSON.stringify(game.publicState(room,student.id)).includes('correctIndex'));
  const card=room.pending.context.card;
  assert.equal(card.success,options[1].success);
  game.answer(room,host.id,chooseCorrect(room));
  assert.equal(room.phase,'between');
  assert.ok(room.log.some(l=>l.text.includes('分支')));
});

test('劇情選擇逾時自動採穩健分支，房主可以略過且不會卡住遊戲',()=>{
  const {game,room,host}=setup();
  game.land(room,host,BOARD[8]);
  const expected=room.pending.choices[0].success;
  room.pending.expiresAt=Date.now()-1;
  game.tick(()=>{});
  assert.equal(room.phase,'answering');
  assert.equal(room.pending.type,'fate');
  assert.equal(room.pending.context.card.success,expected);
  game.nextTurn(room,host.id,true);
  assert.equal(room.phase,'rolling');
  room.currentPlayerId=host.id;
  game.land(room,host,BOARD[23]);
  assert.equal(room.phase,'story');
  game.nextTurn(room,host.id,true);
  assert.equal(room.phase,'rolling');
  assert.equal(room.pending,null);
});

test('成就與稱號：正式答題、購地達標自動解鎖，結算後保留、重開局清空',()=>{
  const {game,room,host}=setup();
  game.ask(room,'calc');
  game.answer(room,host.id,chooseCorrect(room));
  assert.ok(host.achievements.includes('first_answer'));
  for(let n=0;n<2;n++){game.ask(room,'discount');game.answer(room,host.id,chooseCorrect(room));}
  assert.ok(host.achievements.includes('three_correct'));
  assert.ok(host.achievements.includes('discount_master'));
  game.ask(room,'purchase',{tileId:1});
  game.answer(room,host.id,chooseCorrect(room));
  game.decideBuy(room,host.id,true);
  assert.ok(host.achievements.includes('first_property'));
  game.equipTitle(room,host.id,'discount_master');
  game.finishByHost(room,host.id);
  assert.equal(game.publicState(room,host.id).rankings.find(p=>p.id===host.id).titleId,'discount_master');
  assert.equal(game.publicState(room,host.id).players.find(p=>p.id===host.id).titleId,'discount_master');
  game.reset(room,host.id);
  assert.equal(host.titleId,null);
  assert.deepEqual(host.achievements,[]);
  assert.equal(host.spectatorCorrect,0);
  assert.equal(room.lastAchievement,null);
});
