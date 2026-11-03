'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {BOARD,ANIMALS}=require('../board');
const layout=require('../public/board-layout');
const palette=require('../public/player-colors');
const index=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const app=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');

test('30 格完整圍成 10×7 方形外圈，四角、相鄰關係與起點正確',()=>{
  assert.equal(BOARD.length,layout.COUNT);
  assert.equal(layout.COLUMNS,10);
  assert.equal(layout.ROWS,7);
  assert.equal(layout.WIDTH,layout.COLUMNS*layout.CELL);
  assert.equal(layout.HEIGHT,layout.ROWS*layout.CELL);
  const tiles=BOARD.map(t=>layout.positionFor(t.id));
  assert.equal(new Set(tiles.map(p=>`${p.col},${p.row}`)).size,30);
  for(const p of tiles)assert.ok(p.col===0||p.row===0||p.col===9||p.row===6);
  assert.deepEqual([tiles[0],tiles[9],tiles[15],tiles[24]], [
    {col:9,row:6},{col:0,row:6},{col:0,row:0},{col:9,row:0}
  ]);
  for(let i=0;i<tiles.length;i++){
    const a=tiles[i],b=tiles[(i+1)%tiles.length];
    assert.equal(Math.abs(a.col-b.col)+Math.abs(a.row-b.row),1,`格 ${i}→${(i+1)%30} 不相鄰`);
  }
  assert.throws(()=>layout.positionFor(30),RangeError);
  assert.throws(()=>layout.positionFor(-1),RangeError);
});

test('所有 12 隻動物都有唯一且固定的代表色與中文色名',()=>{
  const colors=ANIMALS.map(animal=>palette.forAnimal(animal));
  assert.equal(colors.length,12);
  assert.equal(new Set(colors.map(c=>c.hex)).size,12);
  assert.equal(new Set(colors.map(c=>c.name)).size,12);
  colors.forEach(c=>{assert.match(c.hex,/^#[0-9A-Fa-f]{6}$/);assert.ok(c.name.endsWith('色'));});
});

test('網頁會載入地圖與色票，具有聚焦、自由縮放及我的資產明細',()=>{
  for(const src of ['/board-layout.js','/player-colors.js','/app.js'])assert.ok(index.includes(`src="${src}?v=`));
  for(const id of ['map-overview','map-zoom-in','map-zoom-out','map-zoom-label','map-fullsize','board-wrapper','my-assets-panel']) assert.ok(index.includes(`id="${id}"`),id);
  assert.ok(app.includes('focusKey=state.currentPlayerId'), '應在換人時才自動聚焦');
  assert.ok(app.includes('function renderMyAssets()'));
  assert.ok(app.includes('function setMapZoom('));
  assert.ok(app.includes('function focusMapTile('));
  assert.ok(app.includes('房產總值'));
});

test('前端開房選項支援無限輪，結算包含個人錯題與匿名全班分析',()=>{
  assert.match(index,/value="unlimited" selected/);
  assert.ok(index.includes('id="learning-feedback"'));
  assert.ok(app.includes("rounds:$('round-select').value==='unlimited'"));
  assert.ok(app.includes('state.roundLimit===null'));
  assert.ok(app.includes('function renderLearningFeedback()'));
  assert.ok(app.includes('state.personalFeedback'));
  assert.ok(app.includes('state.classFeedback'));
});


test('等待室顯示四種設定，同步訊息由後端提供且只有房主能編輯',()=>{
  for(const id of ['lobby-settings-summary','settings-sync-label','round-select','money-select','question-time-select','duration-select'])assert.ok(index.includes(`id="${id}"`),id);
  assert.ok(app.includes("request('updateSettings',settingsFromForm())"));
  assert.ok(app.includes('const setting=state.settings'));
  assert.ok(app.includes("'🎲 遊戲輪數'"));
  assert.ok(app.includes("'💰 每人起始金額'"));
  assert.ok(app.includes("'⏳ 每題作答時間'"));
  assert.ok(app.includes("'🕒 課堂遊玩時間'"));
});

test('文字反思可以輸入、送出、重新編輯，房主看到全員回饋列表',()=>{
  for(const id of ['reflection-input','reflection-save','reflection-count','reflection-status','teacher-reflections','reflection-list'])assert.ok(index.includes(`id="${id}"`),id);
  assert.ok(index.includes('textarea'));
  assert.ok(app.includes("request('saveReflection',{text}"));
  assert.ok(app.includes('state.myReflection'));
  assert.ok(app.includes('state.hostReflections'));
  assert.ok(app.includes('reflectionDirty'));
  assert.ok(app.includes('esc(item.reflection.text)'));
});


test('學生與房主皆可見同一區塊，且不在房主專用的隱藏表單之內',()=>{
  const common=index.indexOf('class="lobby-settings-preview"');
  const privateControls=index.indexOf('id="host-settings"');
  const studentMessage=index.indexOf('id="guest-waiting"');
  assert.ok(common>0 && privateControls>0 && studentMessage>0);
  assert.ok(common<privateControls,'設定摘要必須在房主選單之前，避免隱藏影響學生');
  assert.ok(studentMessage>privateControls);
  assert.ok(index.includes('id="lobby-settings-summary"'));
  assert.ok(index.includes('id="update-banner"'));
  assert.ok(app.includes('checkClientVersion'));
  assert.ok(app.includes("'/api/client-version'"));
});

// v1.6.1：正式棋子沿用 v1.5 動物圖示，移動時才暫時放大並快速跳格。
test('動物移動不使用旗子對話框，跳完恢復原本格子圖示',()=>{
  const style=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.ok(app.includes('const animalHtml=a=>a==='),'靜態動物應直接顯示圖示');
  assert.ok(!app.includes('animal-flag'),'前端不應再有旗面或旗桿元件');
  assert.ok(!style.includes('.animal-flag'),'樣式檔不應再有立體旗子樣式');
  assert.ok(app.includes('moving-pawn moving-animal position-instant'));
  assert.ok(app.includes('moving-animal-sprite'));
  assert.ok(app.includes('sprite.classList.add(\'is-hopping\')'));
  assert.ok(app.includes('locate((roll.from+step)%state.board.length)'));
  assert.ok(app.includes('activeRollAnimation=null;\n    renderBoard()'),'動畫結束後應繪製靜態動物');
  assert.match(style,/\.board \.moving-pawn\.moving-animal\s*\{/);
  assert.match(style,/@keyframes animal-hop/);
  assert.match(style,/background:transparent;box-shadow:none/);
});

test('防快取版本與套件版本一致',()=>{
  const version=require('../package.json').version;
  assert.ok(index.includes(`/app.js?v=${version}`));
  assert.ok(index.includes(`/style.css?v=${version}`));
  assert.ok(app.includes(`const CLIENT_VERSION='${version}'`));
});
