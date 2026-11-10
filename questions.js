'use strict';
// 2026 第 2 週主題：國小六年級「圓周長與圓面積」。
// 圓周率統一 3.14；所有數值與干擾選項都從公式建立，不依賴手工填寫答案。
const PI=3.14;
const SKILLS=Object.freeze({
  radius:{name:'半徑與直徑',tip:'直徑是半徑的 2 倍；看到直徑要先除以 2 才能算面積。'},
  circumference:{name:'圓周長計算',tip:'圓周長＝直徑 × 3.14，或半徑 × 2 × 3.14；周長單位是公分、公尺等長度單位。'},
  area:{name:'圓面積計算',tip:'圓面積＝半徑 × 半徑 × 3.14；注意是半徑平方，不是直徑平方。面積單位要寫平方公分、平方公尺。'},
  inverse:{name:'由周長反求半徑',tip:'已知圓周長：先除以 3.14 求直徑，再除以 2 求半徑。'},
  compare:{name:'兩個圓的周長與面積比較',tip:'先確認要比較周長還是面積；半徑放大 2 倍，周長變 2 倍，面積變 4 倍。'},
  combined:{name:'半圓與複合圖形',tip:'半圓面積是整圓的一半；半圓的完整周界還要加上直徑。陰影面積通常先算大圖，再減小圖。'}
});
const KINDS=['purchase','calc','discount','compare','scam','chest','chance','fate','boss','rescue'];
const BANK=Object.fromEntries(KINDS.map(kind=>[kind,[]]));
const SCENES=[
  '星光電影院的圓形招牌','親子咖啡館的圓桌','運動用品店的飛盤','海洋樂園的圓形水池',
  '森林書店的圓形地毯','文具補給站的圓形貼紙','甜點工坊的圓形蛋糕','動物旅館的圓形遊戲墊',
  '便利商店的圓形地貼','水果市集的圓形果籃','電子商城的圓形展示臺','玩具王國的圓形玩具',
  '公園的圓形花圃','校園的圓形跑道','操場的圓形標誌','班級布置的圓形海報',
  '園遊會的圓形攤位','探險島的圓形廣場','校園的圓形噴泉','森林步道的圓形休息區'
];
const round2=value=>Math.round((value+Number.EPSILON)*100)/100;
const show=value=>String(round2(value));
const circumference=r=>round2(2*PI*r);
const area=r=>round2(PI*r*r);
function numberQuestion(kind,text,value,unit,steps,skill,diagram){
  const correct=show(value);
  const candidates=[
    round2(value*2),round2(value/2),round2(value+PI),round2(value-PI),
    round2(value*4),round2(value/4),round2(value+2),round2(value+5),
    round2(value+10),round2(value+1),round2(value-1)
  ].filter(n=>Number.isFinite(n)&&n>=0&&show(n)!==correct);
  const distractors=[...new Set(candidates.map(show))].slice(0,3);
  if(distractors.length!==3)throw new Error('題目干擾選項不夠');
  BANK[kind].push({
    id:kind+'-'+(BANK[kind].length+1),type:kind,
    question:'本題圓周率取 3.14。'+text,
    answer:correct+' '+unit,
    distractors:distractors.map(n=>n+' '+unit),
    explanation:'解題步驟：'+steps+'。解題提醒：'+SKILLS[skill].tip,
    skill,diagram
  });
}
function choiceQuestion(kind,text,answer,other,steps,skill,diagram){
  const distractors=[other,'兩個一樣','資料不足，無法比較'];
  if(new Set([answer,...distractors]).size!==4)throw new Error('比較選項重複');
  BANK[kind].push({
    id:kind+'-'+(BANK[kind].length+1),type:kind,
    question:'本題圓周率取 3.14。'+text,
    answer,distractors,
    explanation:'解題步驟：'+steps+'。解題提醒：'+SKILLS[skill].tip,
    skill,diagram
  });
}
function circle(label,value,unit){
  return {shape:'circle',label,value,unit};
}
function pair(r1,r2,unit){
  return {shape:'pair',first:r1,second:r2,label:'radius',unit};
}
function create(kind,index){
  const category=KINDS.indexOf(kind);
  const scene=SCENES[(index*3+category*5)%SCENES.length];
  const radius=3+((index*7+category*3)%19);
  const radius2=radius+2+index%4;
  const unit=index%3===0?'公尺':'公分';
  const areaUnit=unit==='公尺'?'平方公尺':'平方公分';
  const mode=(index+category*3)%13;
  const c=circumference(radius),a=area(radius),d=radius*2;
  const prefix=kind==='boss'?'Boss 幾何挑戰：':kind==='chest'?'圓形寶箱密碼：':kind==='rescue'?'緊急幾何救援：':'';
  if(mode===0){
    numberQuestion(kind,prefix+scene+'的半徑為 '+radius+unit+'，請計算沿著圓形邊緣一圈的圓周長是多少？',
      c,unit,show(radius)+' × 2 × 3.14 = '+show(c)+'（'+unit+'）','circumference',circle('radius',radius,unit));
  }else if(mode===1){
    numberQuestion(kind,prefix+scene+'的直徑為 '+d+unit+'，如果沿著完整圓周走一圈，長度是多少？',
      c,unit,show(d)+' × 3.14 = '+show(c)+'（'+unit+'）','circumference',circle('diameter',d,unit));
  }else if(mode===2){
    numberQuestion(kind,prefix+scene+'的半徑為 '+radius+unit+'，需要鋪滿整個圓形表面，面積是多少？',
      a,areaUnit,show(radius)+' × '+show(radius)+' × 3.14 = '+show(a)+'（'+areaUnit+'）','area',circle('radius',radius,unit));
  }else if(mode===3){
    numberQuestion(kind,prefix+scene+'的直徑為 '+d+unit+'，先求出半徑，再計算整個圓形的面積是多少？',
      a,areaUnit,show(d)+' ÷ 2 = '+show(radius)+'（'+unit+'）；'+show(radius)+' × '+show(radius)+' × 3.14 = '+show(a)+'（'+areaUnit+'）','area',circle('diameter',d,unit));
  }else if(mode===4){
    numberQuestion(kind,prefix+scene+'量得整圈圓周長為 '+show(c)+unit+'，求出這個圓的半徑是多少？',
      radius,unit,show(c)+' ÷ 3.14 = '+show(d)+'（'+unit+'，直徑）；'+show(d)+' ÷ 2 = '+show(radius)+'（'+unit+'，半徑）','inverse',circle('circumference',c,unit));
  }else if(mode===5){
    numberQuestion(kind,prefix+scene+'的圓周長為 '+show(c)+unit+'，若要測量圓形最寬的直線距離，直徑是多少？',
      d,unit,show(c)+' ÷ 3.14 = '+show(d)+'（'+unit+'）','inverse',circle('circumference',c,unit));
  }else if(mode===6){
    numberQuestion(kind,prefix+scene+'的半徑為 '+radius+unit+'，若把半徑增加到原來的兩倍，新的圓周長是多少？',
      circumference(radius*2),unit,'新半徑＝'+radius+' × 2 = '+(radius*2)+'；新圓周長＝'+(radius*2)+' × 2 × 3.14 = '+show(circumference(radius*2))+'（'+unit+'）','compare',pair(radius,radius*2,unit));
  }else if(mode===7){
    numberQuestion(kind,prefix+scene+'的半徑為 '+radius+unit+'，若改成半徑是原來兩倍的圓形，新面積是多少？',
      area(radius*2),areaUnit,'新半徑＝'+radius+' × 2 = '+(radius*2)+'；新面積＝'+(radius*2)+' × '+(radius*2)+' × 3.14 = '+show(area(radius*2))+'（'+areaUnit+'）','compare',pair(radius,radius*2,unit));
  }else if(mode===8){
    const r=2*Math.ceil(radius/2);
    numberQuestion(kind,prefix+scene+'改成半圓形，原本整個圓的半徑是 '+r+unit+'。只求半圓的面積，應是多少？',
      round2(area(r)/2),areaUnit,'整圓面積＝'+r+' × '+r+' × 3.14 = '+show(area(r))+'；半圓面積＝'+show(area(r))+' ÷ 2 = '+show(area(r)/2)+'（'+areaUnit+'）','combined',{shape:'semicircle',label:'radius',value:r,unit});
  }else if(mode===9){
    numberQuestion(kind,prefix+scene+'做成半圓形，原本整圓半徑為 '+radius+unit+'。含下方直徑的完整半圓周界是多少？',
      round2(PI*radius+2*radius),unit,'弧長＝3.14 × '+radius+' = '+show(PI*radius)+'；再加直徑 '+d+'；周界＝'+show(PI*radius+2*radius)+'（'+unit+'）','combined',{shape:'semicircle',label:'radius',value:radius,unit});
  }else if(mode===10){
    const outer=radius+3,inner=radius;
    numberQuestion(kind,prefix+scene+'有一個圓環形區域，外圓半徑 '+outer+unit+'，內圓半徑 '+inner+unit+'。圓環面積是多少？',
      round2(area(outer)-area(inner)),areaUnit,'外圓面積＝'+outer+' × '+outer+' × 3.14 = '+show(area(outer))+'；內圓面積＝'+inner+' × '+inner+' × 3.14 = '+show(area(inner))+'；相減＝'+show(area(outer)-area(inner))+'（'+areaUnit+'）','combined',{shape:'ring',outer,inner,unit});
  }else if(mode===11){
    numberQuestion(kind,prefix+scene+'有一個邊長 '+d+unit+' 的正方形，裡面正好畫一個內切圓，圓的半徑 '+radius+unit+'。正方形扣掉圓的面積是多少？',
      round2(d*d-a),areaUnit,'正方形面積＝'+d+' × '+d+' = '+(d*d)+'；圓面積＝'+radius+' × '+radius+' × 3.14 = '+show(a)+'；相減＝'+show(d*d-a)+'（'+areaUnit+'）','combined',{shape:'square-circle',label:'radius',value:radius,unit});
  }else{
    choiceQuestion(kind,prefix+scene+'有甲、乙兩個完整圓，甲圓半徑 '+radius+unit+'，乙圓半徑 '+radius2+unit+'。如果比較兩圓的面積，哪一個比較大？',
      '乙圓','甲圓','甲圓面積＝'+show(area(radius))+'（'+areaUnit+'）；乙圓面積＝'+show(area(radius2))+'（'+areaUnit+'）。因為 '+show(area(radius2))+' > '+show(area(radius))+'，乙圓較大。','compare',pair(radius,radius2,unit));
  }
}
for(const kind of KINDS)for(let i=0;i<40;i++)create(kind,i);
const TOTAL=Object.values(BANK).reduce((sum,items)=>sum+items.length,0);
if(TOTAL!==400)throw new Error('題庫數量不符：'+TOTAL);
module.exports={BANK,TOTAL,SKILLS,PI};
