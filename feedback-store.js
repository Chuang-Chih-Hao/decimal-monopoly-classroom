'use strict';
const {createHash}=require('node:crypto');
const SQL_CREATE="CREATE TABLE IF NOT EXISTS teacher_feedback_history (id UUID PRIMARY KEY, owner_hash CHAR(64) NOT NULL, room_code VARCHAR(8) NOT NULL, teacher_name VARCHAR(100) NOT NULL, created_at BIGINT NOT NULL, finished_at BIGINT NOT NULL, finish_reason VARCHAR(32) NOT NULL DEFAULT 'normal', bankrupt_player_name VARCHAR(100), player_count INTEGER NOT NULL, player_summary JSONB NOT NULL DEFAULT '[]', rankings JSONB NOT NULL DEFAULT '[]', class_feedback JSONB, reflections JSONB NOT NULL DEFAULT '[]', updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS idx_teacher_feedback_owner_time ON teacher_feedback_history(owner_hash,finished_at DESC)";
const SQL_UPSERT="INSERT INTO teacher_feedback_history (id,owner_hash,room_code,teacher_name,created_at,finished_at,finish_reason,bankrupt_player_name,player_count,player_summary,rankings,class_feedback,reflections) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb) ON CONFLICT (id) DO UPDATE SET finish_reason=EXCLUDED.finish_reason,bankrupt_player_name=EXCLUDED.bankrupt_player_name,player_summary=EXCLUDED.player_summary,rankings=EXCLUDED.rankings,class_feedback=EXCLUDED.class_feedback,reflections=EXCLUDED.reflections,updated_at=CURRENT_TIMESTAMP WHERE teacher_feedback_history.owner_hash=EXCLUDED.owner_hash";
const SQL_LIST="SELECT id,room_code AS \"roomCode\",teacher_name AS \"teacherName\",created_at AS \"createdAt\",finished_at AS \"finishedAt\",finish_reason AS \"finishReason\",bankrupt_player_name AS \"bankruptPlayerName\",player_count AS \"playerCount\",player_summary AS \"playerSummary\",rankings,class_feedback AS \"classFeedback\",reflections FROM teacher_feedback_history WHERE owner_hash=$1 ORDER BY finished_at DESC LIMIT $2";
function ownerHash(key){
  if(typeof key!=='string'||!/^[0-9a-f]{64}$/i.test(key))throw new Error('房主資料金鑰無效，請使用本裝置建立房間時保存的金鑰。');
  return createHash('sha256').update(key.toLowerCase()).digest('hex');
}
function snapshot(room,state){
  if(!room.archiveId||!room.historyOwnerHash||room.status!=='finished')return null;
  const teacher=room.players.find(p=>p.host);
  if(!teacher)return null;
  return {
    id:room.archiveId,ownerHash:room.historyOwnerHash,roomCode:room.code,
    teacherName:teacher.name,createdAt:room.startedAt||room.createdAt,
    finishedAt:room.finishedAt||Date.now(),finishReason:room.finishReason||'normal',
    bankruptPlayerName:state.players.find(p=>p.bankrupt)?.name||room.players.find(p=>p.bankrupt)?.name||null,
    playerCount:room.players.length,
    playerSummary:state.players.map(p=>({name:p.name,animal:p.animal,isBot:!!p.isBot,
      cash:p.cash,propertyCount:p.properties?.length||0,correct:p.correct,attempted:p.attempted,bankrupt:!!p.bankrupt})),
    rankings:state.rankings||[],classFeedback:state.classFeedback||null,
    reflections:(state.hostReflections||[]).filter(x=>x?.reflection?.text&&!x.isBot)
      .map(x=>({name:x.name,text:x.reflection.text,savedAt:x.reflection.savedAt}))
  };
}
function feedbackRepository({connectionString=process.env.DATABASE_URL,poolFactory}={}){
  let pool=null,ready=false,error=null;
  const factory=poolFactory||(()=>new(require('pg').Pool)({
    connectionString,max:3,connectionTimeoutMillis:6000,idleTimeoutMillis:10000,
    ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined
  }));
  async function init(){
    if(!connectionString)return false;
    try{
      pool=factory();await pool.query(SQL_CREATE);
      ready=true;error=null;return true;
    }catch(err){
      ready=false;error=err?.message||'資料庫連線失敗';
      console.error('[Feedback DB] Initialization failed:',error);
      try{await pool?.end?.();}catch{}
      pool=null;return false;
    }
  }
  function status(){return {configured:!!connectionString,ready,error:ready?null:(error||'資料庫尚未設定連線網址')}};
  function requireReady(){if(!ready)throw new Error('歷史回饋資料庫尚未啟用，請房主先完成 Render DATABASE_URL 設定。');}
  async function upsert(record){
    if(!record)return false;
    requireReady();
    await pool.query(SQL_UPSERT,[
      record.id,record.ownerHash,record.roomCode,record.teacherName,record.createdAt,
      record.finishedAt,record.finishReason,record.bankruptPlayerName,record.playerCount,
      JSON.stringify(record.playerSummary),JSON.stringify(record.rankings),
      JSON.stringify(record.classFeedback),JSON.stringify(record.reflections)
    ]);
    return true;
  }
  async function list(key,{limit=100}={}){
    requireReady();
    const hash=ownerHash(key),safeLimit=Math.max(1,Math.min(300,Number.isInteger(limit)?limit:100));
    const rows=await pool.query(SQL_LIST,[hash,safeLimit]);
    return rows.rows;
  }
  async function remove(key,id){
    requireReady();
    const hash=ownerHash(key);
    if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))throw new Error('無效的歷史紀錄 ID。');
    const result=await pool.query('DELETE FROM teacher_feedback_history WHERE owner_hash=$1 AND id=$2',[hash,id]);
    return result.rowCount===1;
  }
  return {init,status,upsert,list,remove};
}
module.exports={ownerHash,snapshot,feedbackRepository};
