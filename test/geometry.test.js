'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {BANK,TOTAL,SKILLS,PI}=require('../questions');
const {GameManager}=require('../game');
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
const parse=n=>Number.parseFloat(n);
function expected(q){
  const d=q.diagram,r=Number(d.value||0);
  if(d.shape==='circle'){
    if(d.label==='circumference'){
      return q.question.includes('半徑是多少')?round2(d.value/PI/2):round2(d.value/PI);
    }
    const radius=d.label==='diameter'?r/2:r;
    if(q.skill==='circumference')return round2(2*PI*radius);
    if(q.skill==='area')return round2(PI*radius**2);
  }
  if(d.shape==='semicircle'){
    return q.question.includes('面積')?round2(PI*r*r/2):round2(PI*r+2*r);
  }
  if(d.shape==='ring')return round2(PI*(d.outer**2-d.inner**2));
  if(d.shape==='square-circle')return round2((2*r)**2-PI*r*r);
  if(d.shape==='pair'){
    if(q.answer==='乙圓')return null;
    const biggest=Number(d.second);
    return q.question.includes('圓周長')?round2(2*PI*biggest):round2(PI*biggest**2);
  }
  throw new Error('未支援題形：'+q.id+' '+d.shape);
}
test('圓周長與圓面積題庫 400 題完整，10 種事件各 40 題、答案和選項不重複',()=>{
  assert.equal(PI,3.14);assert.equal(TOTAL,400);
  assert.equal(Object.keys(BANK).length,10);
  for(const [kind,items] of Object.entries(BANK)){
    assert.equal(items.length,40,kind);
    assert.equal(new Set(items.map(x=>x.id)).size,40,kind);
    for(const q of items){
      assert.match(q.question,/圓周率取 3\.14/);
      assert.match(q.explanation,/解題步驟/);
      assert.match(q.explanation,/解題提醒/);
      assert.ok(q.diagram?.shape,q.id);
      assert.ok(SKILLS[q.skill],q.id);
      assert.equal(new Set([q.answer,...q.distractors]).size,4,q.id);
      assert.doesNotMatch(q.question,/打折|折扣|特價|商品售價|小數除法|單位價格|單價/);
    }
  }
});
test('全部 400 題按附圖已知半徑／直徑獨立反算，答案符合 3.14',()=>{
  for(const items of Object.values(BANK))for(const q of items){
    const solution=expected(q);
    if(solution===null){assert.equal(q.answer,'乙圓');continue;}
    assert.equal(parse(q.answer),solution,q.id+' '+q.question);
    assert.ok(q.answer.includes('公')||q.answer==='乙圓',q.id);
    assert.ok(q.distractors.every(x=>x!==q.answer),q.id);
  }
});
test('兩種基本公式及面積平方單位必須清楚區分',()=>{
  const base=Object.values(BANK).flat();
  assert.ok(base.some(q=>q.skill==='circumference'&&q.diagram.label==='radius'));
  assert.ok(base.some(q=>q.skill==='circumference'&&q.diagram.label==='diameter'));
  assert.ok(base.some(q=>q.skill==='area'&&q.diagram.label==='radius'));
  assert.ok(base.some(q=>q.skill==='area'&&q.diagram.label==='diameter'));
  assert.ok(base.some(q=>q.skill==='inverse'));
  assert.ok(base.some(q=>q.diagram.shape==='semicircle'));
  assert.ok(base.some(q=>q.diagram.shape==='ring'));
  assert.ok(base.some(q=>q.diagram.shape==='square-circle'));
  for(const q of base){
    if(q.skill==='area'||(q.skill==='combined'&&q.question.includes('面積')))
      assert.match(q.answer,/平方公分|平方公尺/);
    if(q.skill==='circumference'||q.skill==='inverse')
      assert.doesNotMatch(q.answer,/平方/);
  }
});
test('作答之前僅送題幹和圖上已知條件，不透露正解；作答後詳解帶相同附圖',()=>{
  const game=new GameManager();
  const {room,player:host}=game.newRoom('老師','capybara');
  game.join(room.code,'同學','🐈');
  game.start(room,host.id);
  const q=BANK.calc.find(item=>item.skill==='inverse'&&item.diagram.label==='circumference');
  room.questionQueues.calc=[q.id];
  game.ask(room,'calc');
  const pending=game.publicState(room,host.id).pending.question;
  assert.equal(pending.id,q.id);
  assert.deepEqual(pending.diagram,q.diagram);
  assert.equal(pending.correctIndex,undefined);
  assert.equal(pending.correctText,undefined);
  assert.equal(pending.diagram.value,q.diagram.value);
  assert.equal(pending.diagram.radius,undefined);
  game.answer(room,host.id,room.pending.question.correctIndex);
  const result=game.publicState(room,host.id).lastResult;
  assert.deepEqual(result.questionDiagram,q.diagram);
  assert.equal(result.questionText,q.question);
  assert.equal(result.correctAnswer,q.answer);
});
test('新成就依實際圓周長／圓面積學習能力解鎖，舊折扣稱號已撤換',()=>{
  const game=new GameManager();
  const {room,player:host}=game.newRoom('老師','capybara');
  game.join(room.code,'同學','🐈');
  game.start(room,host.id);
  for(const [skill,title] of [['circumference','circumference_master'],['area','area_master']]){
    const qs=BANK.calc.filter(q=>q.skill===skill).slice(0,2);
    assert.equal(qs.length,2);
    for(const q of qs){
      room.questionQueues.calc=[q.id];
      game.ask(room,'calc');
      game.answer(room,host.id,room.pending.question.correctIndex);
    }
    assert.ok(host.achievements.includes(title),title);
  }
  assert.ok(!room.players[0].achievements.includes('discount_master'));
});
