'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ownerHash,snapshot,feedbackRepository}=require('../feedback-store');
const teacherKey='ab'.repeat(32);
const otherKey='cd'.repeat(32);
function mockDb(){
  const calls=[],rows=[];
  const pool={
    async query(sql,args=[]){
      calls.push({sql,args});
      if(sql.startsWith('INSERT INTO')){
        rows.push({ownerHash:args[1],id:args[0],roomCode:args[2],reflections:JSON.parse(args[12])});
        return {rowCount:1};
      }
      if(sql.startsWith('SELECT'))return {rows:rows.filter(r=>r.ownerHash===args[0]).slice(0,args[1])};
      if(sql.startsWith('DELETE')){
        const i=rows.findIndex(r=>r.ownerHash===args[0]&&r.id===args[1]);
        if(i>=0){rows.splice(i,1);return {rowCount:1};}
        return {rowCount:0};
      }
      return {rows:[],rowCount:0};
    },
    async end(){}
  };
  return {pool,calls,rows};
}
test('v1.9.0 房主金鑰至少 256 bit，資料庫只保存不可逆 SHA-256 摘要',()=>{
  const hash=ownerHash(teacherKey);
  assert.match(hash,/^[a-f0-9]{64}$/);
  assert.notEqual(hash,teacherKey);
  assert.notEqual(hash,ownerHash(otherKey));
  assert.throws(()=>ownerHash('password123'));
  assert.throws(()=>ownerHash(''));
});
test('v1.9.0 不讓機器人文字回饋入庫；房主才可見本局公開學習總覽',()=>{
  const room={
    archiveId:'123e4567-e89b-42d3-a456-426614174000',code:'A1B2C3',
    historyOwnerHash:ownerHash(teacherKey),status:'finished',finishReason:'bankrupt',
    startedAt:12345,finishedAt:67890,createdAt:11111,
    players:[{name:'老師',host:true},{name:'學生',host:false},{name:'小數機器人1',host:false,isBot:true}]
  };
  const state={players:[
    {name:'老師',properties:[],cash:900,attempted:1,correct:1},
    {name:'學生',properties:[1],cash:0,attempted:2,correct:1,bankrupt:true},
    {name:'小數機器人1',properties:[],cash:500,isBot:true,attempted:1,correct:0}
  ],rankings:[{name:'老師',score:900}],classFeedback:{attempted:3,correct:2},
    hostReflections:[{name:'學生',reflection:{text:'我學會了小數乘法。',savedAt:68000}},
      {name:'小數機器人1',isBot:true,reflection:{text:'bot',savedAt:68000}}]};
  const record=snapshot(room,state);
  assert.equal(record.ownerHash,ownerHash(teacherKey));
  assert.equal(record.finishReason,'bankrupt');
  assert.equal(record.bankruptPlayerName,'學生');
  assert.equal(record.reflections.length,1);
  assert.equal(record.reflections[0].text,'我學會了小數乘法。');
  assert.equal(record.playerSummary.length,3);
  assert.equal(record.classFeedback.attempted,3);
  assert.equal(snapshot({...room,status:'playing'},state),null);
});
test('v1.9.0 紀錄儲存採參數化查詢，跨房主金鑰不可查看或刪除',async()=>{
  const mock=mockDb();
  const repo=feedbackRepository({connectionString:'mock://private',poolFactory:()=>mock.pool});
  assert.equal(await repo.init(),true);
  assert.equal(repo.status().ready,true);
  const record={id:'123e4567-e89b-42d3-a456-426614174000',ownerHash:ownerHash(teacherKey),
    roomCode:'A1B2C3',teacherName:'老師',createdAt:100,finishedAt:200,finishReason:'normal',
    bankruptPlayerName:null,playerCount:2,playerSummary:[],rankings:[],classFeedback:null,
    reflections:[{name:'學生',text:'折扣計算需要先乘0.75',savedAt:200}]};
  await repo.upsert(record);
  assert.equal(mock.rows.length,1);
  assert.equal(mock.calls.find(c=>c.sql.startsWith('INSERT')).args[12].includes('折扣'),true);
  assert.equal((await repo.list(otherKey)).length,0);
  assert.equal((await repo.list(teacherKey)).length,1);
  assert.equal(await repo.remove(otherKey,record.id),false);
  assert.equal((await repo.list(teacherKey)).length,1);
  assert.equal(await repo.remove(teacherKey,record.id),true);
  assert.equal((await repo.list(teacherKey)).length,0);
  assert.ok(mock.calls.some(c=>c.sql.includes('WHERE owner_hash=$1')));
});
test('v1.9.0 無 DATABASE_URL 時不假裝已持久化保存',async()=>{
  const repo=feedbackRepository({connectionString:''});
  assert.equal(await repo.init(),false);
  assert.equal(repo.status().ready,false);
  assert.equal(repo.status().configured,false);
  await assert.rejects(repo.list(teacherKey),/資料庫尚未啟用/);
});
