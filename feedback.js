'use strict';
const {BANK,SKILLS}=require('./questions');
const QUESTION_LOOKUP=new Map(Object.values(BANK).flat().map(q=>[q.id,q]));

// 每位學生的作答紀錄只在伺服器保留；遊戲結束後只回傳給本人。
function summarizePlayer(history=[]) {
  const counted=history.filter(a=>a.result!=='skipped'&&SKILLS[a.skill]);
  const bySkill=Object.entries(SKILLS).map(([key,info])=>{
    const attempts=counted.filter(a=>a.skill===key);
    const correct=attempts.filter(a=>a.result==='correct').length;
    const wrong=attempts.length-correct;
    const timedOut=attempts.filter(a=>a.result==='timeout').length;
    const mistaken=attempts.filter(a=>a.result!=='correct');
    return {key,name:info.name,tip:info.tip,attempted:attempts.length,correct,wrong,timedOut,
      accuracy:attempts.length?Math.round(correct/attempts.length*100):null,
      exampleIds:[...new Set(mistaken.map(a=>a.questionId))].slice(0,2)};
  }).filter(s=>s.attempted>0);
  const weakest=[...bySkill].filter(s=>s.wrong>0).sort((a,b)=>
    b.wrong-a.wrong || a.accuracy-b.accuracy || b.attempted-a.attempted
  );
  const examples=[...counted].reverse().filter(a=>a.result!=='correct')
    .filter((a,i,arr)=>arr.findIndex(other=>other.questionId===a.questionId)===i).slice(0,6)
    .map(a=>{
      const q=QUESTION_LOOKUP.get(a.questionId);
      return q?{questionId:q.id,skill:q.skill,skillName:SKILLS[q.skill].name,
        question:q.question,answer:q.answer,explanation:q.explanation,timedOut:a.result==='timeout'}:null;
    }).filter(Boolean);
  return {attempted:counted.length,correct:counted.filter(a=>a.result==='correct').length,
    wrong:counted.filter(a=>a.result!=='correct').length,
    timedOut:counted.filter(a=>a.result==='timeout').length,
    accuracy:counted.length?Math.round(counted.filter(a=>a.result==='correct').length/counted.length*100):null,
    bySkill:bySkill.sort((a,b)=>b.attempted-a.attempted || a.name.localeCompare(b.name,'zh-Hant')),
    weakSkills:weakest.slice(0,3),examples};
}
function summarizeClass(players=[]) {
  const all=players.flatMap(p=>p.answerHistory||[]);
  const summary=summarizePlayer(all);
  return {attempted:summary.attempted,correct:summary.correct,wrong:summary.wrong,
    accuracy:summary.accuracy,
    bySkill:summary.bySkill.map(({key,name,attempted,correct,wrong,accuracy})=>({key,name,attempted,correct,wrong,accuracy}))
      .sort((a,b)=>b.wrong-a.wrong || a.accuracy-b.accuracy),
    topWeakSkills:[...summary.weakSkills].map(({key,name,wrong,attempted})=>({key,name,wrong,attempted}))};
}
module.exports={summarizePlayer,summarizeClass};
