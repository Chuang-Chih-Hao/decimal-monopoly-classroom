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
  assert.equal(room.phase,'between');
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

test('Boss 有 2 道題，兩題對加 $250、只有一題對加 $90',()=>{
  const {game,room,host}=setup();
  host.position=20;
  forceDie(game,room,host.id,1);
  assert.equal(room.pending.type,'boss');assert.equal(room.pending.total,2);
  game.answer(room,host.id,chooseCorrect(room));
  assert.equal(room.pending.stage,2);
  game.answer(room,host.id,chooseWrong(room));
  assert.equal(host.cash,990);assert.equal(room.phase,'between');
  assert.equal(host.attempted,2);assert.equal(host.correct,1);
});

test('經過起點領薪水，回合結束排序以資產計算',()=>{
  const {game,room,host,student}=setup();
  host.position=23;
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
  host.position=23;
  forceDie(game,room,host.id,3);
  const first=game.publicState(room).lastRoll;
  assert.match(first.id,/^[0-9a-f-]{36}$/);
  assert.equal(first.from,23);
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
