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

test('32 格完整圍成 11×7 長方形外圈，四角、相鄰關係與起點正確',()=>{
  assert.equal(BOARD.length,layout.COUNT);
  assert.equal(layout.COLUMNS,11);
  assert.equal(layout.ROWS,7);
  assert.equal(layout.WIDTH,layout.COLUMNS*layout.CELL);
  assert.equal(layout.HEIGHT,layout.ROWS*layout.CELL);
  const tiles=BOARD.map(t=>layout.positionFor(t.id));
  assert.equal(new Set(tiles.map(p=>`${p.col},${p.row}`)).size,32);
  for(const p of tiles)assert.ok(p.col===0||p.row===0||p.col===10||p.row===6);
  assert.deepEqual([tiles[0],tiles[10],tiles[16],tiles[26]], [
    {col:10,row:6},{col:0,row:6},{col:0,row:0},{col:10,row:0}
  ]);
  for(let i=0;i<tiles.length;i++){
    const a=tiles[i],b=tiles[(i+1)%tiles.length];
    assert.equal(Math.abs(a.col-b.col)+Math.abs(a.row-b.row),1,`格 ${i}→${(i+1)%32} 不相鄰`);
  }
  assert.throws(()=>layout.positionFor(32),RangeError);
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
  assert.match(style,/\.tile\.tile-effect-building/);
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
  assert.ok(app.includes("tile.classList.remove('tile-effect-active','tile-effect-building')"),'正常結束時應恢復圖示');
  assert.ok(app.includes("active.tile?.classList.remove('tile-effect-active','tile-effect-building')"),'動畫重播或中斷時應恢復圖示');
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

// v1.7.1：修正成就面板擋住骰子／答題操作的右側佈局。
test('v1.7.1 右側依序顯示資產、擲骰答題、排行榜，最後才是收合成就',()=>{
  const sidebar=index.slice(index.indexOf('<aside class="side-column">'),index.indexOf('</aside>'));
  const selectors=['id="my-assets-panel"','class="panel current-panel"','id="duel-panel"','id="question-panel"',
    'id="result-panel"','class="panel ranking-panel"','id="achievement-panel"','id="teacher-panel"'];
  const positions=selectors.map(name=>sidebar.indexOf(name));
  assert.ok(positions.every((pos,i)=>pos>=0&&(i===0||pos>positions[i-1])),
    '骰子、答題與排行榜必須排在成就面板之前');
  assert.match(sidebar,/<details id="achievement-panel"[^>]*>/);
  assert.doesNotMatch(sidebar,/<details id="achievement-panel"[^>]*\sopen(?:\s|=|>)/);
  assert.ok(sidebar.includes('<summary class="achievement-summary">'));
  assert.ok(sidebar.includes('id="achievement-progress"'));
  assert.ok(sidebar.includes('id="achievement-current-title"'));
});

test('v1.7.1 成就面板更新時保留使用者展開狀態與原有稱號切換',()=>{
  const style=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  const part=app.slice(app.indexOf('function renderAchievements(){'),app.indexOf('function renderEndAchievements(){'));
  assert.ok(part.includes("const panel=$('achievement-panel'),content=$('achievement-content')"));
  assert.ok(part.includes('content.innerHTML='),'僅重建成就內容');
  assert.ok(part.includes('progress.textContent='));
  assert.ok(part.includes('currentTitle.textContent='));
  assert.doesNotMatch(part,/panel\.innerHTML\s*=/,'不得重建 details 元素');
  assert.doesNotMatch(part,/panel\.open\s*=/,'狀態更新不能強制切換展開');
  assert.ok(part.includes("request('equipTitle',{achievementId}"));
  assert.match(style,/\.achievement-panel:not\(\[open\]\) \.achievement-summary-toggle::after/);
  assert.match(style,/\.achievement-panel\[open\] \.achievement-summary-toggle::after/);
});

// v1.7.2：答題階段動態將題目移至資產下方，解完題後還原。
test('v1.7.2 答題優先：題目移到資產後、操作前；完成後操作回到上方，解析仍在下方',()=>{
  const start=app.indexOf('function syncQuestionPanelPosition(){');
  const end=app.indexOf('  function renderPlaying(){',start);
  assert.ok(start>=0 && end>start,'應有獨立的側欄順序函式');
  const source=app.slice(start,end);
  const names=['my-assets-panel','current-panel','duel-panel','question-panel','result-panel','ranking-panel','achievement-panel'];
  const nodes=new Map(names.map(id=>[id,{id,hidden:id==='question-panel'}]));
  const current=nodes.get('current-panel');
  const sidebar={
    children:[...nodes.values()],
    classList:{priority:false,toggle(name,enabled){assert.equal(name,'question-priority');this.priority=enabled;}},
    querySelector(selector){assert.equal(selector,'.current-panel');return current;},
    insertBefore(child,reference){
      this.children.splice(this.children.indexOf(child),1);
      this.children.splice(this.children.indexOf(reference),0,child);
    }
  };
  nodes.forEach(node=>{
    Object.defineProperty(node,'nextElementSibling',{get(){return sidebar.children[sidebar.children.indexOf(this)+1]||null;}});
  });
  const $=id=>nodes.get(id);
  const document={querySelector:selector=>selector==='.side-column'?sidebar:null};
  const order=()=>sidebar.children.map(node=>node.id);
  const state={status:'playing',phase:'rolling'};
  const sync=new Function('document','$','state',source+'\nreturn syncQuestionPanelPosition;')(document,$,state);
  sync();
  assert.ok(order().indexOf('current-panel')<order().indexOf('result-panel'));
  nodes.get('question-panel').hidden=false;
  state.phase='answering';sync();
  assert.deepEqual(order().slice(0,3),['my-assets-panel','question-panel','current-panel']);
  assert.equal(sidebar.classList.priority,true);
  assert.ok(order().indexOf('result-panel')>order().indexOf('current-panel'));
  // 房主／學生從數學題進入購地確認，操作區先恢復靠上。
  state.phase='buying';sync();
  assert.deepEqual(order().slice(0,2),['my-assets-panel','current-panel']);
  assert.ok(order().indexOf('question-panel')>order().indexOf('current-panel'));
  assert.ok(order().indexOf('result-panel')>order().indexOf('current-panel'));
  state.phase='story';sync();
  assert.deepEqual(order().slice(0,3),['my-assets-panel','question-panel','current-panel']);
  nodes.get('question-panel').hidden=true;
  state.phase='between';sync();
  assert.deepEqual(order().slice(0,2),['my-assets-panel','current-panel']);
  assert.ok(order().indexOf('result-panel')>order().indexOf('current-panel'));
  assert.equal(sidebar.classList.priority,false);
  assert.ok(app.includes('syncQuestionPanelPosition();'));
});

test('v1.7.2 題目優先狀態在平板上獨佔一列，解析依然跟隨操作區',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.match(css,/@media\(min-width:641px\) and \(max-width:960px\)/);
  assert.match(css,/\.side-column > \.my-assets-panel,[\s\S]*?\.side-column > \.question-panel,[\s\S]*?\.side-column > \.result-panel\{grid-column:1\/-1\}/);
  assert.ok(index.includes('id="question-panel"'));
  assert.ok(index.includes('id="result-panel"'));
  assert.ok(index.includes('id="achievement-panel"'));
  assert.ok(index.includes('class="panel current-panel"'));
});

// v1.7.3：購地建造動畫不得把格子撐大或顯示大片色塊。
test('v1.7.3 購地只顯示一棟房子，沒有額外標籤、槌子或背景遮罩',()=>{
  const style=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  const start=app.indexOf("if(mode==='build'){");
  const end=app.indexOf("}else{",start);
  assert.ok(start>=0&&end>start,'應具有購地特效的獨立分支');
  const block=app.slice(start,end);
  assert.ok(block.includes("class=\"tile-effect-house\""));
  assert.ok(block.includes('>🏠</span>'));
  assert.ok(block.includes("tile.classList.add('tile-effect-building')"));
  assert.doesNotMatch(block,/tile-effect-badge|tile-effect-build-store|tile-effect-build-hammer|tile-effect-build-flash/);
  assert.doesNotMatch(style,/\.board \.tile-effect-build\s*\{/,'不能用一般類別選擇器設定整格寬高');
  assert.match(style,/\.board \.tile\.tile-effect-building\{overflow:hidden;isolation:isolate\}/);
  assert.match(style,/\.board \.tile > \.tile-effect-overlay\.mode-build\s*\{[^}]*inset:0;[^}]*width:100%;height:100%;[^}]*overflow:hidden;[^}]*background:transparent;box-shadow:none/s);
  assert.match(style,/\.board \.tile > \.tile-effect-overlay\.mode-build > \.tile-effect-house/);
  assert.doesNotMatch(style,/\.board \.tile-effect-overlay\.mode-build\s*\{[^}]*radial-gradient/);
  assert.doesNotMatch(style,/\.board \.tile\.tile-effect-build\s*\{[^}]*box-shadow/);
});

test('v1.7.3 購地結束或中斷會恢復原圖，原有其他到格特效繼續存在',()=>{
  const style=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.ok(app.includes("tile.classList.remove('tile-effect-active','tile-effect-building')"));
  assert.ok(app.includes("active.tile?.classList.remove('tile-effect-active','tile-effect-building')"));
  assert.ok(app.includes("playTileEffect(tileId,'landing'"));
  assert.ok(app.includes("playTileEffect(tileId,'build'"));
  assert.match(style,/@keyframes tile-build-rise/);
  assert.match(style,/@media\(prefers-reduced-motion:reduce\)[\s\S]*?\.tile-effect-house\{animation:none!important\}/);
});

// v1.7.4：等待室離開按鈕應醒目、固定在房號旁而非頁尾，且只出現一次。
test('v1.7.4 等待室離開按鈕位於標頭房間代碼旁，且只有一個可操作的離房按鈕',()=>{
  const start=index.indexOf('<section id="lobby-screen"');
  const end=index.indexOf('<section id="playing-screen"',start);
  assert.ok(start>=0&&end>start);
  const lobby=index.slice(start,end);
  assert.equal((lobby.match(/id="leave-btn"/g)||[]).length,1);
  const headerEnd=lobby.indexOf('<div id="lobby-slots"');
  assert.ok(headerEnd>0);
  const header=lobby.slice(0,headerEnd);
  assert.ok(header.includes('class="lobby-header-actions"'));
  assert.ok(header.includes('id="lobby-big-code"'));
  assert.ok(header.includes('id="leave-btn"'));
  assert.ok(header.indexOf('id="lobby-big-code"')<header.indexOf('id="leave-btn"'));
  assert.match(header,/<button id="leave-btn" type="button" class="btn lobby-leave-btn">🚪 離開此房間<\/button>/);
  assert.ok(app.includes("$('leave-btn').addEventListener('click'"));
  assert.ok(app.includes("window.confirm('確定離開這個房間？房主離開會關閉等待中的房間。')"));
});

test('v1.7.4 離開房間按鈕具對比、足夠觸控高度與手機全寬布局',()=>{
  const style=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.match(style,/\.lobby-header-actions\{display:flex;flex:none;flex-direction:column;align-items:flex-end;gap:10px\}/);
  assert.match(style,/\.lobby-leave-btn\s*\{[^}]*min-height:46px;min-width:176px;[^}]*border:2px solid #[0-9a-f]{6};[^}]*background:#[0-9a-f]{6};color:#[0-9a-f]{6};/);
  assert.match(style,/@media\(max-width:640px\)\{[^}]*\.lobby-header-actions\{width:100%;[^}]*\}/);
  assert.match(style,/\.lobby-leave-btn\{width:100%;min-height:48px\}/);
  assert.match(style,/\.lobby-leave-btn:focus-visible\{outline:/);
});


// v1.8.0：機器人玩家等待室 UI / Socket.IO 串接回歸。
test('v1.8.0 等待室只有房主設定區提供新增機器人按鈕，可顯示空位及移除操作',()=>{
  const start=index.indexOf('<section id="lobby-screen"');
  const end=index.indexOf('<section id="playing-screen"',start);
  const lobby=index.slice(start,end);
  assert.ok(start>=0&&end>start);
  assert.equal((lobby.match(/id="add-bot-btn"/g)||[]).length,1);
  const host=lobby.indexOf('id="host-settings"'),panel=lobby.indexOf('class="lobby-bot-controls"');
  const settings=lobby.indexOf('class="setting-grid"');
  assert.ok(host>=0&&panel>host&&panel<settings);
  assert.ok(lobby.includes('id="lobby-bot-count"'));
  assert.ok(lobby.includes('aria-label="新增機器人玩家"'));
  assert.ok(app.includes("request('addBot',{},ok=>"));
  assert.ok(app.includes("request('removeBot',{botId:btn.dataset.removeBot}"));
  assert.ok(app.includes('p?.isBot'));
  assert.ok(app.includes('data-remove-bot'));
  assert.ok(app.includes('state.players.length>=6'));
});

test('v1.8.0 機器人與真人在等待室及排行榜有清楚區隔，手機保持可點擊',()=>{
  const style=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.match(style,/\.lobby-bot-controls\s*\{/);
  assert.match(style,/\.lobby-bot-slot\s*\{/);
  assert.match(style,/\.bot-mini-label\s*\{/);
  assert.match(style,/\.add-bot-btn\s*\{/);
  assert.match(style,/\.lobby-remove-bot\s*\{/);
  assert.match(style,/\.add-bot-btn\{width:100%;min-height:48px\}/);
  assert.ok(app.includes("p.isBot?' 🤖 BOT'"));
  assert.ok(app.includes("r.isBot?' 🤖 BOT'"));
});

test('v1.8.0 機器人事件只有伺服器處理，不能由外部 Socket.IO 模擬自動行動',()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
  assert.match(server,/socket\.on\('addBot',action\(/);
  assert.match(server,/socket\.on\('removeBot',action\(/);
  assert.ok(server.includes('games.addBot(room,playerId)'));
  assert.ok(server.includes('games.removeBot(room,playerId,botId)'));
  assert.ok(game.includes("botStep(room,now=Date.now())"));
  assert.ok(game.includes("this.botStep(room,now)"));
  assert.ok(game.includes('requireHost(room,hostId)'));
  assert.ok(game.includes('room.players.filter(p=>!p.isBot)'));
  assert.doesNotMatch(server,/socket\.on\('botStep'/);
});


// v1.8.1：遊戲音效控制與實際動畫事件連結。
test('v1.8.1 音效模組在主程式前載入，頁首有靜音、音量與試聽功能',()=>{
  const scripts=['sound.js','app.js'].map(name=>index.indexOf('/'+name+'?v='));
  assert.ok(scripts.every(n=>n>0)&&scripts[0]<scripts[1],'先載入音效引擎，再啟動遊戲');
  for(const id of ['sound-toggle','sound-volume','sound-preview'])
    assert.equal((index.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  assert.match(index,/id="sound-volume" min="0" max="60" step="1" value="18"/);
  assert.match(index,/id="sound-toggle"[^>]*aria-pressed="true"/);
  assert.ok(app.includes('function initSoundControls()'));
  assert.ok(app.includes("sound.setEnabled(!sound.getSettings().enabled)"));
  assert.ok(app.includes("sound.setVolume(Number(slider.value)/100)"));
  assert.ok(app.includes("document.addEventListener('pointerdown',unlockOnce"));
  assert.ok(app.includes("document.addEventListener('keydown',unlockOnce"));
});

test('v1.8.1 擲骰、動物跳格、落點、購地與收租由動畫本身觸發對應音效',()=>{
  const check=[
    "playSound('dice-roll')","playSound('dice-result')","playSound('hop')",
    "playSound('landing',{type:tile.type,tileId:tile.id})",
    "playSound('purchase')","playSound('rent')"
  ];
  for(const item of check)assert.ok(app.includes(item),item);
  const start=app.indexOf('async function playRollAnimation(');
  const landing=app.indexOf('playLandingTileEffect(roll.position)',start);
  const dice=app.indexOf("playSound('dice-roll')",start);
  const result=app.indexOf("playSound('dice-result')",start);
  const hop=app.indexOf("playSound('hop')",start);
  assert.ok(start>0&&dice>start&&result>dice&&hop>result&&landing>hop);
});

test('v1.8.1 正確、錯誤、雙人對戰、成就與結算音效只在新事件時播放',()=>{
  const start=app.indexOf('function playStateSounds(previous,next){');
  const end=app.indexOf('function showToast(',start);
  const block=app.slice(start,end);
  assert.ok(start>0&&end>start);
  assert.ok(block.includes('if(!previous)return;'));
  for(const piece of ["playSound('finish')","playSound('duel-start')","playSound('duel-end')",
    "playSound(next.lastResult.correct?'correct':'wrong')","playSound('achievement')"])
    assert.ok(block.includes(piece),piece);
  assert.ok(app.includes('playStateSounds(previous,next);'));
  assert.ok(!app.slice(app.indexOf('function setInitialState(next){'),app.indexOf('function showSpotlight(')).includes('playStateSounds('));
});

test('v1.8.1 音效控制在手機維持可觸控且可鍵盤聚焦',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  for(const cls of ['.header-utilities','.sound-controls','.sound-toggle','.sound-preview','#sound-volume'])
    assert.ok(css.includes(cls+'{'),cls);
  assert.match(css,/\.sound-toggle:focus-visible,\.sound-preview:focus-visible,#sound-volume:focus-visible\{/);
  assert.match(css,/@media\(max-width:480px\)\{[\s\S]*?\.sound-controls\{flex:1;justify-content:center/);
  assert.ok(index.includes('aria-label="遊戲音效音量"'));
});


// v1.8.2：詳解保留原題／選項、純剪刀石頭布、60 秒自動換人、響應式地圖。
test('v1.8.2 解題解析會完整對照原題、四個選項、學生選擇與正解',()=>{
  const start=app.indexOf('function renderResult(){');
  const end=app.indexOf('function landValue(',start);
  const block=app.slice(start,end);
  assert.ok(start>=0&&end>start);
  for(const phrase of ['r.questionText','r.questionOptions','r.correctIndex','r.selectedIndex',
    "esc(r.questionText)","esc(answer)",'r.correctAnswer','r.explanation','result-question-options'])
    assert.ok(block.includes(phrase),phrase);
  assert.ok(block.includes('is-selected-wrong'));
  assert.ok(block.includes('is-correct'));
  const css=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.match(css,/\.result-question-option\.is-correct\{/);
  assert.match(css,/\.result-question-option\.is-selected-wrong\{/);
});

test('v1.8.2 只顯示剪刀石頭布，不再提供烏龜烏龜翹或五種手指',()=>{
  const duel=app.slice(app.indexOf('function renderDuel(){'),app.indexOf('function updateSessionClock(){'));
  const game=fs.readFileSync(path.join(__dirname,'../game.js'),'utf8');
  assert.ok(app.includes("const rpsOptions=[['🪨','石頭'],['📄','布'],['✂️','剪刀']]"));
  assert.doesNotMatch(app,/turtleOptions|烏龜烏龜翹/);
  assert.doesNotMatch(duel,/d\.mode==='turtle'|attackerId/);
  assert.ok(duel.includes("const options=rpsOptions"));
  assert.ok(duel.includes('剪刀石頭布對決'));
  assert.ok(game.includes("const mode='rps'"));
  assert.doesNotMatch(game,/烏龜烏龜翹|'turtle'/);
  assert.ok(index.includes('⚔️ 剪刀石頭布'));
});

test('v1.8.2 每次完成回合會顯示 60 秒自動換人倒數',()=>{
  const start=app.indexOf('function renderTurnActions(){');
  const end=app.indexOf('function renderDuel(){',start);
  const snippet=app.slice(start,end);
  assert.ok(snippet.includes('id="between-timer"'));
  assert.ok(snippet.includes('updateTimer();'));
  assert.ok(app.includes('state.betweenExpiresAt'));
  assert.ok(app.includes('系統會自動換人'));
  assert.ok(app.includes("request('next')"));
});

test('v1.8.2 地圖依裝置初始適配、不再在換人或選房產時強制縮放',()=>{
  const focus=app.slice(app.indexOf('function renderBoard(){'),app.indexOf('function focusMapTile('));
  const asset=app.slice(app.indexOf('function renderMyAssets(){'),app.indexOf('function renderScoreboard(){'));
  assert.ok(app.includes('function responsiveMapZoom(){'));
  assert.ok(app.includes('function fitMapToDevice(){'));
  assert.ok(app.includes('window.addEventListener(\'resize\''));
  assert.ok(app.includes('mapZoomManual=true'));
  assert.ok(app.includes('if(!mapZoomInitialized)fitMapToDevice();'));
  assert.ok(app.includes("setMapZoom(responsiveMapZoom(),{keepCenter:true})"));
  assert.doesNotMatch(focus,/if\(mapZoom<1\)setMapZoom\(1/);
  assert.doesNotMatch(asset,/setMapZoom\(1\)/);
  const control=app.slice(app.indexOf("$('map-fullsize').addEventListener"),app.indexOf('// 電腦可按住滑鼠'));
  assert.ok(control.includes('focusMapTile(activePlayer()?.position'));
  assert.doesNotMatch(control,/setMapZoom\(Math\.max\(1,mapZoom\)\)/);
  for(const id of ['map-zoom-in','map-zoom-out','map-overview','map-fullsize'])
    assert.ok(index.includes('id="'+id+'"'));
});

test('v1.8.2 手機初始比例有可讀下限，桌面按容器比例調整',()=>{
  const snippet=app.slice(app.indexOf('const clampZoom='),app.indexOf('function setMapZoom('));
  assert.ok(snippet.includes('Math.max(.35,Math.min(.98,available/layout.WIDTH))'));
  const factory=new Function('boardWrapper','layout',snippet+'\nreturn responsiveMapZoom;');
  const mobile=factory({clientWidth:375},{WIDTH:1450});
  const desktop=factory({clientWidth:1150},{WIDTH:1450});
  assert.equal(mobile(),.35);
  assert.ok(desktop()>.7&&desktop()<.9);
  assert.ok(desktop()>mobile());
});

// v1.8.3：購地通知原本任意依字數切割，導致同一句大小字混用。
test('v1.8.3 購地成功的玩家、店面、過路費都在同一段完整說明',()=>{
  const start=app.indexOf('function spotlightFromLog(text){');
  const end=app.indexOf('  function highlightNewEvents(',start);
  assert.ok(start>=0&&end>start,'應有語意化的事件通知格式函式');
  const snippet=app.slice(start,end);
  const format=new Function(snippet+'\nreturn spotlightFromLog;')();
  const examples=[
    '🎉 小數機器人1 以 $300 買下「運動用品店」！其他玩家經過需付 $75。',
    '🎉 姓名比較長的機器人冒險家 以 $420 買下「超級無敵奇幻玩具王國」！其他玩家經過需付 $105。',
    '🎉 '+('機器人玩家'.repeat(17))+' 以 $260 買下「動物旅館」！其他玩家經過需付 $65。'
  ];
  for(const line of examples){
    const item=format(line);
    assert.equal(item.title,'🏠 購地成功！');
    assert.equal(item.detail,line,'原始事件必須完整保留，不能依字數截斷');
    assert.equal(item.kind,'success');
    assert.ok(!item.title.includes('需付'));
  }
  assert.ok(app.includes('const item=spotlightFromLog(selected.text)'));
  assert.doesNotMatch(app,/selected\.text\.slice\(0,34\)|selected\.text\.slice\(34,100\)/);
});

test('v1.8.3 其他長事件也不截斷，且標題與訊息有獨立一致的字級',()=>{
  const src=app.slice(app.indexOf('function spotlightFromLog(text){'),app.indexOf('  function highlightNewEvents('));
  const format=new Function(src+'\nreturn spotlightFromLog;')();
  for(const msg of [
    '🏠 冒險家支付 $75 過路費給屋主小數機器人。',
    '🛟 救援成功！'+('額外補助 '.repeat(22)),
    '🧾 玩家繳交稅金 $60。',
    '↪️ 玩家放棄購買「運動用品店」。'
  ]){
    const result=format(msg);
    assert.equal(result.detail,msg);
    assert.ok(result.title.length<=12);
  }
  const css=fs.readFileSync(path.join(__dirname,'../public/style.css'),'utf8');
  assert.ok(app.includes('class="spotlight-title"'));
  assert.ok(app.includes('class="spotlight-detail"'));
  assert.match(css,/\.event-spotlight \.spotlight-copy \.spotlight-title\s*\{[^}]*font-size:/);
  assert.match(css,/\.event-spotlight \.spotlight-copy \.spotlight-detail\s*\{[^}]*font-size:/);
  assert.match(css,/\.spotlight-detail\s*\{[^}]*overflow-wrap:anywhere/);
  assert.match(css,/@media\(max-width:640px\)\{[^}]*\.event-spotlight \.spotlight-copy \.spotlight-title/);
  assert.ok(index.includes('/app.js?v=1.9.0'));
});


test('v1.9.0 32 格地圖依舊保留 11×7 外圈與手機縮放控制',()=>{
  assert.equal(layout.COUNT,32);
  assert.equal(layout.COLUMNS,11);
  assert.deepEqual(BOARD.slice(-2).map(x=>x.type),['jail','share']);
  assert.ok(index.includes('32 格經典'));
  assert.ok(app.includes('[0,10,16,26].includes(tile.id)'));
  for(const tile of ['jail','share'])assert.ok(app.includes("theme:'"+tile+"'"));
  for(const id of ['map-zoom-out','map-zoom-in','map-overview','map-fullsize'])
    assert.ok(index.includes('id="'+id+'"'));
});

test('v1.9.0 監獄面板提供服刑、保釋與逾時提示，購地禁令在資產面板標示',()=>{
  const start=app.indexOf("}else if(phase==='jail-choice')");
  assert.ok(start>0);
  const block=app.slice(start,app.indexOf("}else if(phase==='story')",start));
  for(const phrase of ['jail-serve','jail-pay','jailDecision','jail-timer','bailPurchaseBan','state.jailBail']) {
    const code=phrase==='bailPurchaseBan'?app:block;
    assert.ok(code.includes(phrase),phrase);
  }
  assert.ok(app.includes('jailChoiceExpiresAt'));
  assert.ok(index.includes('服刑一回合'));
  assert.ok(index.includes('均付'));
});

test('v1.9.0 破產在結算頁註明原因，不再等待手動結束',()=>{
  for(const id of ['end-title','end-reason'])assert.ok(index.includes('id="'+id+'"'));
  assert.ok(app.includes("state.finishReason==='bankrupt'"));
  assert.ok(app.includes('state.bankruptPlayerId'));
  assert.ok(app.includes('現金歸零'));
});

test('v1.9.0 歷史回饋只有持房主金鑰者可讀，能搜尋、備份、匯入及刪除',()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const store=fs.readFileSync(path.join(__dirname,'../feedback-store.js'),'utf8');
  for(const id of ['feedback-history-open','feedback-history-modal','feedback-history-status',
    'feedback-history-results','feedback-history-search','feedback-history-copy-key',
    'feedback-history-import-key','feedback-history-refresh'])
    assert.equal((index.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  assert.ok(app.includes('crypto.getRandomValues(bytes)'));
  assert.ok(app.includes('historyKey:'));
  assert.ok(server.includes("socket.on('feedbackHistory'"));
  assert.ok(server.includes("socket.on('feedbackDelete'"));
  assert.ok(store.includes('owner_hash=$1'));
  assert.ok(store.includes('ownerHash(key)'));
  assert.doesNotMatch(server,/socket\.emit\('feedbackHistory'/);
});
