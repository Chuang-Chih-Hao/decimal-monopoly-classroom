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


// v1.6.2：全房間使用同一份動物合法清單，不再包含易混淆的熊類。
test('12 種選角動物物種不重複，前後端清單與配色同步',()=>{
  const expected=['capybara','🐈','🐕','🐰','🦊','🐼','🐸','🐧','🦁','🐢','🐹','🦉'];
  const names=['水豚','貓','狗','兔子','狐狸','貓熊','青蛙','企鵝','獅子','烏龜','倉鼠','貓頭鷹'];
  assert.deepEqual(ANIMALS,expected);
  assert.equal(new Set(ANIMALS).size,12);
  assert.ok(!ANIMALS.includes('🐻'));
  assert.ok(!ANIMALS.includes('🐨'));
  const parsedList=app.match(/const animals=\[([^\]]+)\]/)?.[1];
  const parsedNames=app.match(/const animalNames=\[([^\]]+)\]/)?.[1];
  assert.ok(parsedList,'前端動物清單必須存在');
  assert.ok(parsedNames,'前端動物名稱必須存在');
  assert.deepEqual([...parsedList.matchAll(/'([^']+)'/g)].map(x=>x[1]),expected);
  assert.deepEqual([...parsedNames.matchAll(/'([^']+)'/g)].map(x=>x[1]),names);
  assert.deepEqual(Object.keys(palette.COLORS),expected);
});

// v1.6.3：水豚外觀與選角名稱應可直接辨認，不影響其他角色的 ID。
test('水豚使用側身 SVG，12 種動物在選角格都有可見中文名稱',()=>{
  const svg=fs.readFileSync(path.join(__dirname,'../public/capybara.svg'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.match(svg,/<svg\s[^>]*viewBox="0 0 120 120"/);
  assert.match(svg,/<title>水豚<\/title>/);
  assert.match(svg,/Side profile/);
  assert.match(svg,/<path[^>]+d="M12 72/); // long side body, not round face
  assert.ok(app.includes('const animalHtml=a=>a===\'capybara\'?'), '水豚仍使用自訂 SVG');
  assert.ok(app.includes('src="/capybara.svg"'), '所有畫面共用同一圖示');
  assert.ok(app.includes('<span class="animal-option-name">${esc(animalNames[i])}</span>'));
  assert.match(css,/\.animal-option-name\s*\{/);
  assert.match(css,/\.animal-picker \.animal-option\s*\{/);
  assert.equal(ANIMALS[0],'capybara');
});


// v1.6.4：落點格子動畫與購地蓋房動畫。
test('前端包含到格事件特效與購地蓋房動畫',()=>{
  const style=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.ok(app.includes('function playTileEffect('));
  assert.ok(app.includes('function playLandingTileEffect('));
  assert.ok(app.includes('function playPropertyBuildEffect('));
  assert.ok(app.includes('playLandingTileEffect(roll.position)'));
  assert.ok(app.includes('newPropertyBuilds'));
  assert.match(style,/\.tile-effect-overlay/);
  assert.match(style,/@keyframes tile-fx-spin/);
  assert.match(style,/@keyframes tile-build-rise/);
  assert.match(style,/\.tile\.tile-effect-build/);
});


// v1.6.5：每種店面都有專屬常駐風格與到格特效。
test('前端為地圖格子加入主題風格與專屬到格動畫',()=>{
  const style=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.ok(app.includes('function tileFlavorSpec('));
  assert.ok(app.includes("theme:'cinema'"));
  assert.ok(app.includes("theme:'cafe'"));
  assert.ok(app.includes('fx-ocean'));
  assert.ok(app.includes('fx-cinema'));
  assert.match(style,/\.tile-theme-cinema \.piece-film/);
  assert.match(style,/\.tile-theme-cafe \.piece-steam/);
  assert.match(style,/\.tile-theme-ocean \.piece-wave/);
  assert.match(style,/@keyframes ambient-film/);
  assert.match(style,/@keyframes ambient-steam/);
  assert.match(style,/@keyframes ambient-wave/);
});

// 上線前核對：保留原有的格子事件類型與號碼徽章絕對定位。
test('專屬動畫不應把第 25 格比價站當成休息站，也不覆蓋格子定位',()=>{
  const style=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.match(app,/25:\{theme:'compare',badge:'精打細算站'/);
  assert.doesNotMatch(app,/25:\{theme:'rest'/);
  assert.match(style,/\.board \.tile>\.tile-icon,\.board \.tile>\.tile-name,\.board \.tile>\.tile-price/);
  assert.doesNotMatch(style,/\.board \.tile>\*:not\(\.tile-ambient\)/);
  assert.ok(app.includes('for(const tileId of tileEffectTimers.keys())clearTileEffect(tileId)'));
});


// v1.6.6：到格及購地動畫不能與原本格子圖示疊在一起。
test('格子動畫期間隱藏原主圖及常駐裝飾，完成或中斷後自動恢復',()=>{
  const style=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.match(style,/\.board \.tile\.tile-effect-active > \.tile-icon,\s*\.board \.tile\.tile-effect-active > \.tile-ambient\s*\{\s*visibility:hidden;/);
  assert.ok(app.includes("tile.classList.add('tile-effect-active')"),'動畫開始時應套用隱藏狀態');
  assert.ok(app.includes("tile.classList.remove('tile-effect-active','tile-effect-build')"),'正常結束時應恢復圖示');
  assert.ok(app.includes("active.tile?.classList.remove('tile-effect-active','tile-effect-build')"),'動畫重播或中斷時應恢復圖示');
  assert.ok(app.includes('for(const tileId of tileEffectTimers.keys())clearTileEffect(tileId)'),'棋盤重繪前應清理動畫');
  assert.doesNotMatch(style,/\.tile-effect-active > \.tile-name\s*\{/,'格子名稱仍應保留');
});

// v1.7.0：觀戰猜題、劇情分支、成就稱號介面。
test('v1.7 觀戰猜題在問題面板有獨立的選項事件，且不使用正式 answer 事件提交',()=>{
  assert.ok(app.includes("request('spectatorGuess',{index:Number(btn.dataset.spectatorChoice)}"));
  assert.ok(app.includes('data-spectator-choice'));
  assert.ok(app.includes('spectatorPoll'));
  assert.ok(app.includes('spectator-summary'));
  assert.ok(app.includes('poll.correctCount'));
  assert.ok(!app.includes("request('answer',{index:Number(btn.dataset.spectatorChoice)}"));
});

test('v1.7 劇情選擇可顯示兩條分支與風險、逾時提示，只有當回合玩家能送出',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.ok(app.includes("p.type==='story'"));
  assert.ok(app.includes("request('storyChoice',{choiceId:btn.dataset.storyChoice}"));
  assert.ok(app.includes('data-story-choice'));
  assert.ok(app.includes('逾時自動採取穩健方案'));
  assert.match(css,/\.story-choices\s*\{/);
  assert.match(css,/\.story-choice:disabled/);
});

test('v1.7 成就面板和結算徽章存在，稱號可以從已解鎖的成就裝備',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.ok(index.includes('id="achievement-panel"'));
  assert.ok(index.includes('id="end-achievements"'));
  assert.ok(app.includes('function renderAchievements()'));
  assert.ok(app.includes('function renderEndAchievements()'));
  assert.ok(app.includes("request('equipTitle',{achievementId}"));
  assert.ok(app.includes('achievementCatalog'));
  assert.ok(app.includes('rank-title'));
  assert.match(css,/\.achievement-grid\s*\{/);
});
