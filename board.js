'use strict';
const BOARD = [
  { id:0,type:'start',name:'夢想起點',icon:'🏁',tip:'經過領取 $200' },
  { id:1,type:'property',name:'文具補給站',icon:'✏️',price:140,rent:35,group:'青綠' },
  { id:2,type:'discount',name:'折扣百貨',icon:'🏷️',tip:'折扣答題賺獎金' },
  { id:3,type:'property',name:'便利商店',icon:'🏪',price:180,rent:45,group:'青綠' },
  { id:4,type:'chance',name:'機會',icon:'🍀',tip:'答題抽好運' },
  { id:5,type:'property',name:'甜點工坊',icon:'🧁',price:230,rent:55,group:'橘黃' },
  { id:6,type:'compare',name:'比價擂台',icon:'⚖️',tip:'買對才划算' },
  { id:7,type:'property',name:'動物旅館',icon:'🏨',price:260,rent:65,group:'橘黃' },
  { id:8,type:'fate',name:'命運',icon:'🔮',tip:'小數改變命運' },
  { id:9,type:'property',name:'運動用品店',icon:'🏀',price:300,rent:75,group:'紫粉' },
  { id:10,type:'scam',name:'黑心商人',icon:'🕵️',tip:'抓出價格陷阱' },
  { id:11,type:'property',name:'森林書店',icon:'📚',price:340,rent:85,group:'紫粉' },
  { id:12,type:'rest',name:'補給休息站',icon:'🌈',tip:'補助 $30' },
  { id:13,type:'property',name:'時尚服飾店',icon:'👗',price:380,rent:95,group:'粉紅' },
  { id:14,type:'chest',name:'神祕寶箱',icon:'🎁',tip:'密碼解鎖金幣' },
  { id:15,type:'property',name:'玩具王國',icon:'🧸',price:420,rent:105,group:'粉紅' },
  { id:16,type:'calc',name:'小數神算',icon:'🧠',tip:'乘除法挑戰' },
  { id:17,type:'property',name:'水果市集',icon:'🍎',price:260,rent:65,group:'藍色' },
  { id:18,type:'tax',name:'稅務局',icon:'🧾',tip:'繳納 $60' },
  { id:19,type:'property',name:'電子商城',icon:'🎮',price:440,rent:110,group:'藍色' },
  { id:20,type:'fate',name:'命運',icon:'🔮',tip:'答題改變走向' },
  { id:21,type:'boss',name:'終極 Boss',icon:'🐉',tip:'連續 2 題對決' },
  { id:22,type:'property',name:'星光電影院',icon:'🎬',price:480,rent:120,group:'金色' },
  { id:23,type:'chance',name:'機會',icon:'🍀',tip:'答題抽好運' },
];
const ANIMALS = ['capybara','🐈','🐕','🐰','🦊','🐼','🐸','🐧','🦁','🐻','🐹','🐨'];
module.exports={ BOARD, ANIMALS };
