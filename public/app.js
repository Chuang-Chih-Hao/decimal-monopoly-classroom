/* 小數富翁前端：所有資產、擲骰、判分都以伺服器狀態為準。 */
(() => {
  'use strict';
  const CLIENT_VERSION='1.8.2';
  const socket=io({transports:['websocket','polling'],reconnection:true});
  const sound=window.DecimalMonopolyAudio;
  const playSound=(kind,detail)=>sound?.play(kind,detail);
  function initSoundControls(){
    const toggle=document.getElementById('sound-toggle');
    const slider=document.getElementById('sound-volume');
    const preview=document.getElementById('sound-preview');
    if(!toggle||!slider||!preview)return;
    if(!sound?.getSettings().supported){
      toggle.textContent='🔇 不支援音效';toggle.disabled=true;
      slider.disabled=true;preview.disabled=true;
      return;
    }
    const paint=()=>{
      const {enabled,volume}=sound.getSettings();
      toggle.textContent=enabled?'🔉 音效開啟':'🔇 已靜音';
      toggle.setAttribute('aria-pressed',String(enabled));
      toggle.title=enabled?'點擊關閉遊戲音效':'點擊開啟遊戲音效';
      slider.value=String(Math.round(volume*100));
      slider.disabled=!enabled;
      preview.disabled=!enabled||volume===0;
      slider.title='音量 '+Math.round(volume*100)+'%';
      slider.setAttribute('aria-valuetext',Math.round(volume*100)+'%');
    };
    toggle.addEventListener('click',async()=>{
      const enabled=sound.setEnabled(!sound.getSettings().enabled);
      paint();
      if(enabled){await sound.unlock();sound.play('preview');}
    });
    slider.addEventListener('input',()=>{sound.setVolume(Number(slider.value)/100);paint();});
    slider.addEventListener('change',async()=>{await sound.unlock();sound.play('preview');});
    preview.addEventListener('click',async()=>{await sound.unlock();sound.play('preview');});
    // 瀏覽器在使用者首次點擊／按鍵前不允許自動播放聲音。
    // 只在真實互動後解鎖 AudioContext，避免 Socket.IO 廣播觸發未授權播放。
    const unlockOnce=()=>{if(sound.getSettings().enabled&&!sound.getSettings().ready)void sound.unlock();};
    document.addEventListener('pointerdown',unlockOnce,{passive:true});
    document.addEventListener('keydown',unlockOnce);
    paint();
  }
  initSoundControls();
  const $=id=>document.getElementById(id);
  const esc=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=n=>`$${Number(n||0).toLocaleString('zh-TW')}`;
  const animals=['capybara','🐈','🐕','🐰','🦊','🐼','🐸','🐧','🦁','🐢','🐹','🦉'];
  const animalNames=['水豚','貓','狗','兔子','狐狸','貓熊','青蛙','企鵝','獅子','烏龜','倉鼠','貓頭鷹'];
  // 停在格子時採用 v1.5 原始動物圖示；只有移動過程放大成跳躍動物。
  const animalHtml=a=>a==='capybara'?'<img class="animal-img" src="/capybara.svg" alt="水豚" />':esc(a);
  const diceIcons=['','⚀','⚁','⚂','⚃','⚄','⚅'];
  const layout=window.DecimalBoardLayout;
  const playerColors=window.DecimalPlayerColors;
  if(!layout||!playerColors)throw new Error('棋盤版型與動物配色未載入');
  const colorFor=p=>playerColors.forAnimal(p?.animal);
  const colorStyle=p=>`--player-color:${colorFor(p).hex};--player-light:${colorFor(p).light}`;
  const typeNames={purchase:'購地數學考驗',calc:'小數神算',discount:'折扣挑戰',compare:'比價擂台',scam:'破解黑心商人',chest:'寶箱密碼',chance:'機會卡',fate:'命運卡',boss:'終極 Boss',rescue:'緊急救援'};
  let selectedAnimal='capybara';
  let mapZoom=1;
  let mapZoomInitialized=false;
  let mapZoomManual=false;
  let mapFocusKey=null;
  let state=null,me=null;
  let toastTimer;
  let spotlightTimer;
  let seenRollId=null;
  let seenLogId=null;
  let seenAchievementId=null;
  let activeRollAnimation=null;
  let animationNonce=0;
  let deferredFeedback=null;
  let seenDuelResultId=null;
  let reflectionDirty=false;
  const tileEffectTimers=new Map();
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  // 新版部署後，舊分頁不會自動取得新的 HTML：登入或重新開啟分頁時檢查版本。
  // 等待室可安全重載；進行中則讓學生自行選擇，避免突然中斷答題。
  let checkingVersion=false;
  async function checkClientVersion(){
    if(checkingVersion)return;
    checkingVersion=true;
    try{
      const response=await fetch('/api/client-version',{cache:'no-store'});
      if(!response.ok)return;
      const data=await response.json();
      if(data.version&&data.version!==CLIENT_VERSION){
        if(state?.status==='playing'){
          $('update-banner').hidden=false;
          $('update-banner-info').textContent='遊戲已更新，可在這回合結束後重新整理。';
        }else{
          // localStorage 中的房間權杖會在重載後恢復，不需要學生重新加入。
          window.location.reload();
        }
      }
    }catch{}finally{checkingVersion=false;}
  }
  let tokenData=null;
  try {tokenData=JSON.parse(localStorage.getItem('decimal-monopoly-session')||'null');}catch{tokenData=null;}

  function playStateSounds(previous,next){
    // 首次加入／重新連線不重播舊答案、勝負、成就或結算。
    if(!previous)return;
    if(previous.status==='playing'&&next.status==='finished'){
      playSound('finish');
      return;
    }
    if(next.status!=='playing')return;
    if(next.duel?.id&&next.duel.id!==previous.duel?.id)playSound('duel-start');
    if(next.lastDuel?.id&&next.lastDuel.id!==previous.lastDuel?.id)playSound('duel-end');
    if(next.lastResult?.at&&next.lastResult.at!==previous.lastResult?.at){
      playSound(next.lastResult.correct?'correct':'wrong');
    }
    if(next.lastAchievement?.id&&next.lastAchievement.id!==previous.lastAchievement?.id
      &&next.lastAchievement.playerId===me){
      setTimeout(()=>{if(state?.status==='playing')playSound('achievement');},550);
    }
  }
  function showToast(text,error=false){
    const el=$('toast');el.textContent=text;el.classList.toggle('error',error);el.hidden=false;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.hidden=true,4300);
  }
  function showEntry(){ $('entry-screen').hidden=false;$('game-screen').hidden=true; }
  function saveSession(data){
    tokenData={code:data.code,token:data.token,id:data.id};me=data.id;
    try{localStorage.setItem('decimal-monopoly-session',JSON.stringify(tokenData));}catch{}
  }
  function clearSession(){
    animationNonce++;activeRollAnimation=null;deferredFeedback=null;
    seenRollId=null;seenLogId=null;seenDuelResultId=null;seenAchievementId=null;mapFocusKey=null;mapZoom=1;mapZoomInitialized=false;mapZoomManual=false;reflectionDirty=false;
    $('event-spotlight').hidden=true;
    tokenData=null;me=null;state=null;
    try{localStorage.removeItem('decimal-monopoly-session');}catch{}
    showEntry();
  }
  // 首次加入／重新連線時，以伺服器畫面為準，不重播已經結束的擲骰。
  function setInitialState(next){
    animationNonce++;activeRollAnimation=null;deferredFeedback=null;
    state=next;mapFocusKey=null;mapZoomInitialized=false;mapZoomManual=false;reflectionDirty=false;
    seenRollId=next.lastRoll?.id??null;
    seenDuelResultId=next.lastDuel?.id??null;
    seenLogId=next.log?.[0]?.id??null;
    seenAchievementId=next.lastAchievement?.id??null;
    render();
  }
  function showSpotlight(icon,title,detail='',kind='event'){
    const box=$('event-spotlight');
    if(!box)return;
    box.hidden=false;box.className=`event-spotlight kind-${kind}`;
    box.innerHTML=`<span class="spotlight-icon">${esc(icon)}</span><div class="spotlight-copy"><strong>${esc(title)}</strong><span>${esc(detail)}</span></div>`;
    // 重新播放彈出動畫，所有玩家都能注意到最新事件。
    void box.offsetWidth;
    box.classList.add('is-visible');
    clearTimeout(spotlightTimer);
    spotlightTimer=setTimeout(()=>{box.classList.remove('is-visible');setTimeout(()=>{if(!box.classList.contains('is-visible'))box.hidden=true;},260);},3100);
  }
  function highlightNewEvents(previous,next){
    if(!previous||next.status!=='playing')return;
    if(next.lastDuel && next.lastDuel.id!==previous.lastDuel?.id && next.lastDuel.id!==seenDuelResultId){
      seenDuelResultId=next.lastDuel.id;
      const duel=next.lastDuel;
      const winner=next.players.find(p=>p.id===duel.winnerId);
      const item={icon:winner?'🏆':'🤝',title:winner?`${winner.name} 在雙人對決中獲勝！`:'雙人對決平手！',
        detail:winner?`輸家額外補貼 ${money(duel.paid)}，完成本次房產互動。`:'不用額外付零用錢。',kind:winner?'success':'event'};
      if(activeRollAnimation)deferredFeedback=item;
      else showSpotlight(item.icon,item.title,item.detail,item.kind);
      return;
    }
    const result=next.lastResult;
    if(result && result.at!==previous.lastResult?.at){
      const before=previous.players?.find(p=>p.id===next.currentPlayerId);
      const after=next.players?.find(p=>p.id===next.currentPlayerId);
      const delta=before&&after?after.cash-before.cash:0;
      const cashChange=delta>0?`｜💰 獲得 ${money(delta)}`:delta<0?`｜💸 支出 ${money(-delta)}`:'';
      const item={icon:result.correct?'✅':'📘',title:result.correct?'答對了！數學挑戰成功':'再試著理解這題！',detail:`正確答案：${result.correctAnswer}${cashChange}`,kind:result.correct?'success':'warning'};
      if(activeRollAnimation)deferredFeedback=item;
      else showSpotlight(item.icon,item.title,item.detail,item.kind);
      return;
    }
    const previousId=previous.log?.[0]?.id;
    const fresh=[];
    for(const log of next.log||[]){
      if(log.id===previousId)break;
      fresh.push(log);
    }
    const selected=fresh.find(l=>/買下|過路費|救援成功|救援未成功|繳交稅金|獲得|失去|抽中|暫停|完成|放棄購買/.test(l.text));
    if(!selected)return;
    const positive=/買下|救援成功|獲得|抽中/.test(selected.text);
    const item={icon:positive?'🌟':'📣',title:selected.text.slice(0,34),detail:selected.text.length>34?selected.text.slice(34,100):'',kind:positive?'success':'event'};
    if(activeRollAnimation)deferredFeedback=item;
    else showSpotlight(item.icon,item.title,item.detail,item.kind);
  }


  function clearTileEffect(tileId){
    const active=tileEffectTimers.get(tileId);
    if(active){
      clearTimeout(active.timer);
      active.el?.remove();
      active.tile?.classList.remove('tile-effect-active','tile-effect-building');
      tileEffectTimers.delete(tileId);
    }
  }
  function tileFlavorSpec(tile){
    const byId={
      1:{theme:'stationery',badge:'文具補給站',className:'fx-stationery',ambient:'<span class="ambient-piece piece-pencil">✏️</span><span class="ambient-piece piece-spark">✦</span>'},
      3:{theme:'convenience',badge:'便利商店',className:'fx-convenience',ambient:'<span class="ambient-piece piece-store">▤</span><span class="ambient-piece piece-bag">🛍️</span>'},
      5:{theme:'dessert',badge:'甜點工坊',className:'fx-dessert',ambient:'<span class="ambient-piece piece-candy">🍓</span><span class="ambient-piece piece-spark">✦</span>'},
      7:{theme:'hotel',badge:'動物旅館',className:'fx-hotel',ambient:'<span class="ambient-piece piece-bell">🔔</span><span class="ambient-piece piece-z">Z</span>'},
      9:{theme:'sports',badge:'運動用品店',className:'fx-sports',ambient:'<span class="ambient-piece piece-ball">●</span><span class="ambient-piece piece-ball two">●</span>'},
      11:{theme:'bookstore',badge:'森林書店',className:'fx-bookstore',ambient:'<span class="ambient-piece piece-page">📖</span><span class="ambient-piece piece-leaf">🍃</span>'},
      13:{theme:'fashion',badge:'時尚服飾店',className:'fx-fashion',ambient:'<span class="ambient-piece piece-ribbon">🎀</span><span class="ambient-piece piece-spark">✦</span>'},
      15:{theme:'toy',badge:'玩具王國',className:'fx-toy',ambient:'<span class="ambient-piece piece-block">🧩</span><span class="ambient-piece piece-star">★</span>'},
      17:{theme:'fruit',badge:'水果市集',className:'fx-fruit',ambient:'<span class="ambient-piece piece-fruit">🍎</span><span class="ambient-piece piece-leaf">🍃</span>'},
      19:{theme:'electro',badge:'電子商城',className:'fx-electro',ambient:'<span class="ambient-piece piece-pixel">▣</span><span class="ambient-piece piece-pixel two">▣</span>'},
      22:{theme:'cinema',badge:'星光電影院',className:'fx-cinema',ambient:'<span class="ambient-piece piece-film">▥</span><span class="ambient-piece piece-popcorn">🍿</span>'},
      24:{theme:'cafe',badge:'親子咖啡館',className:'fx-cafe',ambient:'<span class="ambient-piece piece-steam">〰</span><span class="ambient-piece piece-steam two">〰</span>'},
      27:{theme:'ocean',badge:'海洋樂園',className:'fx-ocean',ambient:'<span class="ambient-piece piece-wave">≈</span><span class="ambient-piece piece-wave two">≈</span>'},
      4:{theme:'chance',badge:'機會觸發',className:'fx-lucky',ambient:'<span class="ambient-piece piece-star">✦</span><span class="ambient-piece piece-leaf">🍀</span>'},
      8:{theme:'fate',badge:'命運啟動',className:'fx-spin',ambient:'<span class="ambient-piece piece-orb">🔮</span><span class="ambient-piece piece-spark">✦</span>'},
      20:{theme:'fate',badge:'命運啟動',className:'fx-spin',ambient:'<span class="ambient-piece piece-orb">🔮</span><span class="ambient-piece piece-spark">✦</span>'},
      23:{theme:'chance',badge:'機會觸發',className:'fx-lucky',ambient:'<span class="ambient-piece piece-star">✦</span><span class="ambient-piece piece-leaf">🍀</span>'},
      26:{theme:'chest',badge:'寶箱開啟',className:'fx-chest',ambient:'<span class="ambient-piece piece-key">🗝️</span><span class="ambient-piece piece-star">✦</span>'},
      28:{theme:'boss',badge:'Boss 警報',className:'fx-boss',ambient:'<span class="ambient-piece piece-boss">⚡</span><span class="ambient-piece piece-star">✦</span>'},
      29:{theme:'wheel',badge:'命運大轉盤',className:'fx-wheel',ambient:'<span class="ambient-piece piece-wheel">🎡</span><span class="ambient-piece piece-spark">✦</span>'},
      0:{theme:'start',badge:'夢想起點',className:'fx-start',ambient:'<span class="ambient-piece piece-flag">🏁</span><span class="ambient-piece piece-spark">✦</span>'},
      10:{theme:'rescue',badge:'黑心商人',className:'fx-alert',ambient:'<span class="ambient-piece piece-alert">❗</span><span class="ambient-piece piece-star">✦</span>'},
      14:{theme:'chest',badge:'神祕寶箱',className:'fx-chest',ambient:'<span class="ambient-piece piece-key">🎁</span><span class="ambient-piece piece-star">✦</span>'},
      18:{theme:'tax',badge:'稅務提醒',className:'fx-alert',ambient:'<span class="ambient-piece piece-tax">🧾</span><span class="ambient-piece piece-star">✦</span>'},
      21:{theme:'boss',badge:'終極 Boss',className:'fx-boss',ambient:'<span class="ambient-piece piece-boss">⚡</span><span class="ambient-piece piece-star">✦</span>'},
      25:{theme:'compare',badge:'精打細算站',className:'fx-compare',ambient:'<span class="ambient-piece piece-bag">🛒</span><span class="ambient-piece piece-spark">✦</span>'}
    };
    const typeDefaults={
      property:{theme:'property',badge:'店面抵達',className:'fx-shop',ambient:'<span class="ambient-piece piece-star">✦</span>'},
      chance:{theme:'chance',badge:'機會觸發',className:'fx-lucky',ambient:'<span class="ambient-piece piece-leaf">🍀</span>'},
      fate:{theme:'fate',badge:'命運啟動',className:'fx-spin',ambient:'<span class="ambient-piece piece-orb">🔮</span>'},
      chest:{theme:'chest',badge:'寶箱開啟',className:'fx-chest',ambient:'<span class="ambient-piece piece-key">🗝️</span>'},
      boss:{theme:'boss',badge:'Boss 警報',className:'fx-boss',ambient:'<span class="ambient-piece piece-boss">⚡</span>'},
      discount:{theme:'discount',badge:'折扣挑戰',className:'fx-tag',ambient:'<span class="ambient-piece piece-star">🏷️</span>'},
      compare:{theme:'compare',badge:'比價開始',className:'fx-compare',ambient:'<span class="ambient-piece piece-star">⚖️</span>'},
      calc:{theme:'calc',badge:'小數神算',className:'fx-calc',ambient:'<span class="ambient-piece piece-star">🧮</span>'},
      scam:{theme:'scam',badge:'黑心商人',className:'fx-alert',ambient:'<span class="ambient-piece piece-alert">❗</span>'},
      start:{theme:'start',badge:'抵達起點',className:'fx-start',ambient:'<span class="ambient-piece piece-flag">🏁</span>'},
      rest:{theme:'rest',badge:'補給休息',className:'fx-rest',ambient:'<span class="ambient-piece piece-bag">🛍️</span>'},
      tax:{theme:'tax',badge:'稅務提醒',className:'fx-alert',ambient:'<span class="ambient-piece piece-tax">🧾</span>'}
    };
    const picked=byId[tile.id]||typeDefaults[tile.type]||{theme:'event',badge:tile.name||'事件觸發',className:'fx-pop',ambient:'<span class="ambient-piece piece-star">✦</span>'};
    return {...picked,icon:tile.icon||'✨'};
  }
  function landingEffectSpec(tile){
    const flavor=tileFlavorSpec(tile);
    return {badge:flavor.badge||tile.name||'事件觸發',icon:flavor.icon||tile.icon||'✨',className:flavor.className||'fx-pop',theme:flavor.theme||'event'};
  }
  function playTileEffect(tileId,mode,spec={}){
    const tile=$('board')?.querySelector(`[data-tile-id="${tileId}"]`);
    if(!tile)return;
    clearTileEffect(tileId);
    const overlay=document.createElement('div');
    overlay.className=`tile-effect-overlay ${spec.className||'fx-pop'} mode-${mode}`;
    overlay.setAttribute('aria-hidden','true');
    if(mode==='build'){
      playSound('purchase');
      // 購地成功時只繪製一棟房子；不加入徽章、色塊或第二個店面圖示。
      // 狀態類別與圖示類別不得重名，以免 CSS 100% 尺寸套到整個棋盤格。
      overlay.innerHTML='<span class="tile-effect-house" aria-hidden="true">🏠</span>';
      tile.classList.add('tile-effect-building');
    }else{
      overlay.innerHTML=`<span class="tile-effect-badge">${esc(spec.badge||'事件觸發')}</span><span class="tile-effect-icon">${esc(spec.icon||'✨')}</span><span class="tile-effect-ring"></span><span class="tile-effect-stars">✦ ✧ ✦</span>`;
    }
    tile.classList.add('tile-effect-active');
    tile.appendChild(overlay);
    const duration=mode==='build' ? (reducedMotion?380:1700) : (reducedMotion?280:1350);
    const timer=setTimeout(()=>{
      overlay.remove();
      tile.classList.remove('tile-effect-active','tile-effect-building');
      tileEffectTimers.delete(tileId);
    },duration);
    tileEffectTimers.set(tileId,{timer,el:overlay,tile});
  }
  function playLandingTileEffect(tileId){
    const tile=state?.board?.[tileId];
    if(!tile)return;
    playSound('landing',{type:tile.type,tileId:tile.id});
    playTileEffect(tileId,'landing',landingEffectSpec(tile));
  }
  function playPropertyBuildEffect(tileId,ownerId){
    const tile=state?.board?.[tileId];
    if(!tile)return;
    const owner=state?.players?.find(player=>player.id===ownerId);
    const flavor=tileFlavorSpec(tile);
    playTileEffect(tileId,'build',{storeIcon:tile.icon||'🏠',ownerName:owner?.name||'',className:flavor.className||'fx-shop',theme:flavor.theme||'property'});
  }
  function request(event,payload={},done){
    if(!socket.connected){showToast('尚未連線，請檢查網路。',true);return;}
    socket.timeout(10000).emit(event,payload,(err,response)=>{
      if(err){showToast('網路連線逾時，請再試一次。',true);if(done)done(false);return;}
      if(!response?.ok){showToast(response?.error||'操作失敗。',true);if(done)done(false);return;}
      if(done)done(true,response);
    });
  }
  function renderAnimalPicker(){
    const picker=$('animal-picker');picker.innerHTML='';
    animals.forEach((a,i)=>{
      const btn=document.createElement('button');btn.type='button';btn.className='animal-option'+(a===selectedAnimal?' selected':'');
      btn.title=animalNames[i];btn.setAttribute('aria-label',animalNames[i]);btn.setAttribute('aria-pressed',String(a===selectedAnimal));
      const paint=playerColors.forAnimal(a);
      btn.style.cssText=`--player-color:${paint.hex};--player-light:${paint.light}`;
      btn.innerHTML=`<span class="animal-option-icon" aria-hidden="true">${animalHtml(a)}</span><span class="animal-option-name">${esc(animalNames[i])}</span><span class="animal-color-dot" aria-hidden="true"></span>`;
      btn.title=`${animalNames[i]}｜${paint.name}`;
      btn.addEventListener('click',()=>{selectedAnimal=a;renderAnimalPicker();});picker.appendChild(btn);
    });
  }
  renderAnimalPicker();
  const boardWrapper=$('board-wrapper');
  const clampZoom=value=>Math.min(1.65,Math.max(.25,Math.round(value*100)/100));
  // 初始比例依棋盤容器寬度決定。較窄裝置至少保留可辨識的格子尺寸，
  // 不會在每次換人或選取房產時強制切回 100%。
  function responsiveMapZoom(){
    const available=Math.max(1,boardWrapper.clientWidth-18);
    return clampZoom(Math.max(.35,Math.min(.98,available/layout.WIDTH)));
  }
  function fitMapToDevice(){
    if(!boardWrapper.clientWidth)return;
    mapZoomInitialized=true;
    setMapZoom(responsiveMapZoom(),{keepCenter:false});
  }
  function setMapZoom(value,{keepCenter=true}={}){
    const board=$('board');
    const oldZoom=mapZoom;
    const oldLeft=boardWrapper.scrollLeft,oldTop=boardWrapper.scrollTop;
    mapZoom=clampZoom(value);
    board.style.zoom=String(mapZoom);
    $('map-zoom-label').textContent=`${Math.round(mapZoom*100)}%`;
    if(keepCenter && oldZoom>0){
      boardWrapper.scrollLeft=(oldLeft+boardWrapper.clientWidth/2)*mapZoom/oldZoom-boardWrapper.clientWidth/2;
      boardWrapper.scrollTop=(oldTop+boardWrapper.clientHeight/2)*mapZoom/oldZoom-boardWrapper.clientHeight/2;
    }
  }
  function adjustZoom(value){
    if(activeRollAnimation){showToast('棋子移動結束後就能自由縮放。');return;}
    mapZoomManual=true;
    setMapZoom(value);
  }
  $('map-overview').addEventListener('click',()=>{
    if(activeRollAnimation){showToast('棋子移動結束後就能切換全覽。');return;}
    const x=(boardWrapper.clientWidth-24)/layout.WIDTH;
    const y=(Math.min(boardWrapper.clientHeight||590,window.innerWidth<=650?480:590)-24)/layout.HEIGHT;
    mapZoomManual=true;
    setMapZoom(Math.min(.96,x,y),{keepCenter:false});
    boardWrapper.scrollTo({left:0,top:0,behavior:'auto'});
  });
  $('map-zoom-in').addEventListener('click',()=>adjustZoom(mapZoom+.15));
  $('map-zoom-out').addEventListener('click',()=>adjustZoom(mapZoom-.15));
  $('map-fullsize').addEventListener('click',()=>{
    if(activeRollAnimation){showToast('棋子移動結束後即可重新聚焦。');return;}
    focusMapTile(activePlayer()?.position??0,'smooth');
  });
  window.addEventListener('resize',()=>{
    // 只在尚未手動縮放的情況下跟隨裝置尺寸，保留玩家按 +/- 設定的比例。
    if(state?.status==='playing'&&mapZoomInitialized&&!mapZoomManual&&!activeRollAnimation){
      setMapZoom(responsiveMapZoom(),{keepCenter:true});
    }
  });
  // 電腦可按住滑鼠拖曳棋盤，手機和平板則使用原生觸控滑動。
  let pan=null;
  boardWrapper.addEventListener('pointerdown',e=>{
    if(e.pointerType!=='mouse'||e.button!==0)return;
    pan={id:e.pointerId,x:e.clientX,y:e.clientY,left:boardWrapper.scrollLeft,top:boardWrapper.scrollTop};
    boardWrapper.classList.add('is-dragging');
    boardWrapper.setPointerCapture(e.pointerId);
  });
  boardWrapper.addEventListener('pointermove',e=>{
    if(!pan||pan.id!==e.pointerId)return;
    boardWrapper.scrollLeft=pan.left+pan.x-e.clientX;
    boardWrapper.scrollTop=pan.top+pan.y-e.clientY;
  });
  const finishPan=e=>{if(!pan||pan.id!==e.pointerId)return;pan=null;boardWrapper.classList.remove('is-dragging');};
  boardWrapper.addEventListener('pointerup',finishPan);
  boardWrapper.addEventListener('pointercancel',finishPan);
  boardWrapper.addEventListener('lostpointercapture',()=>{pan=null;boardWrapper.classList.remove('is-dragging');});
  const prefill=new URLSearchParams(window.location.search).get('room');
  if(prefill)$('room-code').value=prefill.trim().toUpperCase().slice(0,6);

  $('update-now').addEventListener('click',()=>window.location.reload());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkClientVersion();});
  window.setInterval(()=>{if(socket.connected)void checkClientVersion();},60_000);

  $('create-btn').addEventListener('click',()=>{
    const name=$('player-name').value.trim();if(!name){showToast('請先輸入冒險家暱稱。',true);return;}
    request('create',{name,animal:selectedAnimal},(ok,data)=>{if(ok){saveSession(data);setInitialState(data.state);showToast('已建立房間！把代碼傳給同學。');}});
  });
  $('join-btn').addEventListener('click',()=>{
    const name=$('player-name').value.trim(),code=$('room-code').value.trim().toUpperCase();
    if(!name||!code){showToast('請輸入暱稱和房間代碼。',true);return;}
    request('join',{code,name,animal:selectedAnimal},(ok,data)=>{if(ok){saveSession(data);setInitialState(data.state);showToast('加入成功！');}});
  });
  ['player-name','room-code'].forEach(id=>$(id).addEventListener('keydown',e=>{if(e.key==='Enter')$(id==='room-code'?'join-btn':'create-btn').click();}));
  $('copy-room-btn').addEventListener('click',async()=>{
    if(!state)return;
    const url=new URL(window.location.pathname,window.location.href);url.searchParams.set('room',state.code);
    try{await navigator.clipboard.writeText(url.toString());showToast('已複製邀請連結，貼給同學即可加入！');}
    catch{window.prompt('複製這個連結分享給同學：',url.toString());}
  });
  $('leave-btn').addEventListener('click',()=>{
    if(!window.confirm('確定離開這個房間？房主離開會關閉等待中的房間。'))return;
    request('leave',{},(ok)=>{if(ok)clearSession();});
  });
  const settingsFromForm=()=>({rounds:$('round-select').value==='unlimited'?'unlimited':Number($('round-select').value),money:Number($('money-select').value),questionSeconds:Number($('question-time-select').value),durationMinutes:Number($('duration-select').value)});
  for(const id of ['round-select','money-select','question-time-select','duration-select']){
    $(id).addEventListener('change',()=>{if(isHost()&&state?.status==='lobby')request('updateSettings',settingsFromForm());});
  }
  $('add-bot-btn').addEventListener('click',()=>{
    const btn=$('add-bot-btn');btn.disabled=true;
    request('addBot',{},ok=>{if(!ok){btn.disabled=false;renderLobby();}});
  });
  $('start-btn').addEventListener('click',()=>request('start',settingsFromForm()));
  $('reflection-input').addEventListener('input',()=>{reflectionDirty=true;updateReflectionUI();});
  $('reflection-save').addEventListener('click',()=>{
    const text=$('reflection-input').value.trim();
    if(!text){showToast('請先寫下至少一句學習心得。',true);return;}
    if([...text].length>600){showToast('心得最多 600 字，請精簡後再送出。',true);return;}
    const btn=$('reflection-save');btn.disabled=true;
    request('saveReflection',{text},(ok)=>{
      btn.disabled=false;
      if(ok){
        // 送出期間若又繼續輸入，仍視為尚未送出的新草稿，避免悄悄覆蓋。
        reflectionDirty=$('reflection-input').value.trim()!==text;
        showToast('學習回饋已儲存，房主可以看到！');
      }
      updateReflectionUI();
    });
  });
  $('skip-btn').addEventListener('click',()=>{
    if(window.confirm('即將跳過目前題目或雙人加賽，並進入下一人。對戰跳過時不收額外零用錢，確定嗎？'))request('skip');
  });
  $('finish-btn').addEventListener('click',()=>{
    if(window.confirm('要立即結束遊戲並公布排名嗎？'))request('finish');
  });
  $('restart-btn').addEventListener('click',()=>request('reset'));

  socket.on('connect',()=>{
    void checkClientVersion();
    $('connection').className='connection online';$('connection').innerHTML='<span class="status-dot"></span>已連線';
    if(tokenData){
      request('resume',{code:tokenData.code,token:tokenData.token},(ok,data)=>{
        if(ok){saveSession(data);setInitialState(data.state);}
        else {clearSession();showToast('原先的房間不存在或已過期，請重新進入。',true);}
      });
    } else if(!me)showEntry();
  });
  socket.on('disconnect',()=>{
    $('connection').className='connection offline';$('connection').innerHTML='<span class="status-dot"></span>重新連線中';
  });
  socket.on('state',next=>{
    if(!me)return;
    const previous=state;
    const newPropertyBuilds=previous?.status==='playing'&&next.status==='playing'
      ? Object.entries(next.properties||{}).filter(([tileId,ownerId])=>ownerId&&previous?.properties?.[tileId]!==ownerId).map(([tileId,ownerId])=>({tileId:Number(tileId),ownerId}))
      : [];
    if(previous?.status==='finished'&&next.status==='lobby'){reflectionDirty=false;$('reflection-input').value='';}
    // 若房主在上一位角色移動動畫未播完就跳回合，立即停止舊動畫，避免鏡頭與新回合爭奪焦點。
    if(previous?.currentPlayerId!==next.currentPlayerId&&activeRollAnimation){
      animationNonce++;activeRollAnimation=null;deferredFeedback=null;
    }
    const isNewRoll=next.status==='playing'&&!!next.lastRoll?.id&&next.lastRoll.id!==seenRollId;
    if(next.status!=='playing'){
      animationNonce++;activeRollAnimation=null;deferredFeedback=null;
      if(!next.lastRoll)seenRollId=null;
    }
    if(isNewRoll){
      seenRollId=next.lastRoll.id;
      animationNonce++;
      activeRollAnimation={...next.lastRoll,started:false};
      deferredFeedback=null;
    }
    state=next;
    render();
    playStateSounds(previous,next);
    if(next.lastAchievement?.id && next.lastAchievement.id!==seenAchievementId){
      seenAchievementId=next.lastAchievement.id;
      const badge=next.achievementCatalog?.find(a=>a.id===next.lastAchievement.achievementId);
      if(next.lastAchievement.playerId===me && badge)showToast('🏅 解鎖成就：'+badge.title+'！可到成就區切換稱號。');
    }
    if(isNewRoll)void playRollAnimation(next.lastRoll,animationNonce);
    else {
      highlightNewEvents(previous,next);
      if(newPropertyBuilds.length){
        newPropertyBuilds.forEach((item,index)=>setTimeout(()=>{
          if(!activeRollAnimation&&state?.status==='playing')playPropertyBuildEffect(item.tileId,item.ownerId);
        },120+index*220));
      }
    }
    seenLogId=next.log?.[0]?.id??null;
  });
  socket.on('roomClosed',()=>{clearSession();showToast('房主已解散房間。',true);});
  socket.on('superseded',()=>{state=null;me=null;showEntry();showToast('此角色已在另一個分頁連線，這裡停止操作。',true);});

  function myPlayer(){return state?.players.find(p=>p.id===me);}
  function activePlayer(){return state?.players.find(p=>p.id===state.currentPlayerId);}
  function isMyTurn(){return state?.currentPlayerId===me;}
  function isHost(){return !!myPlayer()?.host;}
  function badgeFor(id){return state?.achievementCatalog?.find(a=>a.id===id);}
  function titleText(p){const badge=badgeFor(p?.titleId);return badge?badge.icon+' '+badge.title:'';}
  function render(){
    if(!state||!me)return;
    $('entry-screen').hidden=true;$('game-screen').hidden=false;
    $('room-code-label').textContent=state.code;
    $('lobby-big-code').textContent=state.code;
    $('game-status-label').textContent=({lobby:'等待加入',playing:'遊戲進行中',finished:'已完成'})[state.status];
    $('whoami').innerHTML=`<span class="identity-chip" style="${colorStyle(myPlayer())}">${animalHtml(myPlayer()?.animal)} ${esc(myPlayer()?.name)} <small>${colorFor(myPlayer()).name}</small>${isHost()?' 👑':''}</span>`;
    $('lobby-screen').hidden=state.status!=='lobby';
    $('playing-screen').hidden=state.status!=='playing';
    $('end-screen').hidden=state.status!=='finished';
    if(state.status==='lobby'){mapZoomInitialized=false;mapZoomManual=false;renderLobby();}
    if(state.status==='playing')renderPlaying();
    if(state.status==='finished')renderEnd();
  }
  function renderLobby(){
    const list=$('lobby-slots');list.innerHTML='';
    for(let i=0;i<6;i++){
      const p=state.players[i];const div=document.createElement('div');
      div.className='lobby-slot'+(p?'':' empty')+(p?.isBot?' lobby-bot-slot':'');
      if(p)div.style.cssText=colorStyle(p);
      div.innerHTML=p
        ? `<div class="lobby-animal">${animalHtml(p.animal)}</div><div class="lobby-slot-info"><div class="lobby-name">${esc(p.name)}${p.id===me?'（我）':''}${p.isBot?' <span class="bot-mini-label">🤖 BOT</span>':''}</div><div class="lobby-meta">${colorFor(p).name}棋子 · ${p.host?'👑 房主':p.isBot?'🤖 自動玩家':'冒險家'} · ${p.isBot?'自動操作':p.connected?'已連線':'暫時離線'}</div></div>${p.isBot&&isHost()?`<button class="lobby-remove-bot" type="button" data-remove-bot="${esc(p.id)}" aria-label="移除 ${esc(p.name)}">移除</button>`:''}`
        :`<div class="lobby-animal">➕</div><div><div class="lobby-name">等待加入</div><div class="lobby-meta">冒險席位 ${i+1}</div></div>`;
      list.appendChild(div);
    }
    list.querySelectorAll('[data-remove-bot]').forEach(btn=>btn.addEventListener('click',()=>{
      btn.disabled=true;
      request('removeBot',{botId:btn.dataset.removeBot},ok=>{if(!ok)renderLobby();});
    }));
    $('host-settings').hidden=!isHost();$('guest-waiting').hidden=isHost();
    const botCount=state.players.filter(p=>p.isBot).length;
    $('lobby-bot-count').textContent=`目前 ${botCount} 位機器人 · ${6-state.players.length} 個空位`;
    $('add-bot-btn').disabled=state.players.length>=6;
    $('start-btn').disabled=state.players.length<2;
    const setting=state.settings||{rounds:'unlimited',money:900,questionSeconds:120,durationMinutes:30};
    const cards=[
      ['🎲 遊戲輪數',setting.rounds==='unlimited'?'♾️ 無限輪':`${setting.rounds} 輪`],
      ['💰 每人起始金額',money(setting.money)],
      ['⏳ 每題作答時間',`${setting.questionSeconds} 秒`],
      ['🕒 課堂遊玩時間',`${setting.durationMinutes} 分鐘`]
    ];
    $('lobby-settings-summary').innerHTML=cards.map(([label,value])=>`<div class="settings-summary-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
    $('settings-sync-label').textContent=isHost()?'修改選單後，全員立即看到':'由房主設定・即時同步';
    if(isHost()){
      for(const [id,key] of [['round-select','rounds'],['money-select','money'],['question-time-select','questionSeconds'],['duration-select','durationMinutes']]){
        if(document.activeElement!==$(id))$(id).value=String(setting[key]);
      }
    }
  }
  // 30 格固定為 10 × 7 的傳統大富翁方格外圈；不變更伺服器的格子編號。
  function renderBoard(){
    const board=$('board');
    for(const tileId of tileEffectTimers.keys())clearTileEffect(tileId);
    board.replaceChildren();board.style.zoom=String(mapZoom);
    if(state.board.length!==layout.COUNT)throw new Error('棋盤格數與版型不一致');
    state.board.forEach(tile=>{
      const {col,row}=layout.positionFor(tile.id),el=document.createElement('div');
      const owner=state.players.find(p=>p.id===state.properties[tile.id]);
      const pawns=state.players.filter(p=>p.position===tile.id&&p.id!==activeRollAnimation?.playerId);
      const currentPos=activeRollAnimation ? activeRollAnimation.from : activePlayer()?.position;
      const flavor=tileFlavorSpec(tile);
      el.className=`tile ${tile.type}${tile.group?' group-'+tile.group:''} tile-theme-${flavor.theme||'event'}${pawns.length?' active-tile':''}${owner?' owned':''}${currentPos===tile.id?' current-turn-tile':''}${[0,9,15,24].includes(tile.id)?' board-corner':''}`;
      el.dataset.tileId=String(tile.id);
      el.dataset.tileTheme=flavor.theme||'event';
      el.style.left=`${(col+.5)*layout.CELL}px`;
      el.style.top=`${(row+.5)*layout.CELL}px`;
      if(owner)el.style.cssText+=`;${colorStyle(owner)}`;
      el.title=tile.type==='property'?`${tile.name}：購地 ${money(tile.price)}，租金 ${money(tile.rent)}${owner?'，屋主 '+owner.name+'（'+colorFor(owner).name+'）':''}`:`${tile.name}：${tile.tip||''}`;
      el.innerHTML=`<div class="tile-ambient ambient-${flavor.theme||'event'}" aria-hidden="true">${flavor.ambient||''}</div><span class="tile-number">${String(tile.id).padStart(2,'0')}</span><span class="tile-icon">${esc(tile.icon)}</span><span class="tile-name">${esc(tile.name)}</span>`
        +(tile.price?`<span class="tile-price">${money(tile.price)}</span>`:'')
        +(owner?`<span class="owner-mini" title="${esc(owner.name)} 的房產">${animalHtml(owner.animal)}<span>${esc(owner.name)}</span></span>`:'')
        +`<div class="tile-pawns">${pawns.map(p=>`<span class="pawn${p.id===state.currentPlayerId?' pawn-current':''}" style="${colorStyle(p)}" title="${esc(p.name)}・${colorFor(p).name}">${animalHtml(p.animal)}</span>`).join('')}</div>`;
      board.appendChild(el);
    });
    const center=document.createElement('div');center.id='board-center';center.className='board-center';
    const last=state.lastRoll,who=last?state.players.find(p=>p.id===last.playerId):null;
    const current=activePlayer();
    const description=last?`${esc(who?.name||'玩家')} 擲出 ${last.die} 點！`:'30 格經典方格棋盤';
    center.innerHTML=`<div class="center-content"><div class="center-logo">🌴 💰 🎲</div><div class="center-title">小數富翁<br/>探險島</div><div class="center-desc">${description}<br/>買店面・算折扣・雙人對戰</div><div class="center-turn" style="${colorStyle(current)}">${animalHtml(current?.animal||'🐾')} 現在輪到 ${esc(current?.name||'冒險家')}</div>${last?`<span class="dice-face" aria-label="${last.die} 點">${diceIcons[last.die]}</span>`:''}</div>`;
    board.appendChild(center);
    const focusKey=state.currentPlayerId;
    if(mapFocusKey!==focusKey){
      mapFocusKey=focusKey;
      const from=activeRollAnimation?.from??current?.position??0;
      const expectedPlayerId=focusKey;
      // 所有裝置都收到同一個 currentPlayerId；只有換人時強制聚焦，後續可自行移動畫面。
      requestAnimationFrame(()=>{
        if(state?.status==='playing'&&state.currentPlayerId===expectedPlayerId){
          focusMapTile(from,reducedMotion?'auto':'smooth');
        }
      });
    }
  }
  function focusMapTile(id,behavior='auto'){
    const board=$('board'),wrapper=$('board-wrapper');
    const tile=board.querySelector(`[data-tile-id="${id}"]`);
    if(!tile||!wrapper)return;
    const scale=board.getBoundingClientRect().width/layout.WIDTH;
    const x=Number.parseFloat(tile.style.left)*scale;
    const y=Number.parseFloat(tile.style.top)*scale;
    wrapper.scrollTo({
      left:Math.max(0,x-wrapper.clientWidth/2),
      top:Math.max(0,y-wrapper.clientHeight/2),
      behavior:reducedMotion?'auto':behavior
    });
  }
  // 伺服器先決定唯一的點數與終點；前端只重播同一個結果，不自行擲骰。
  async function playRollAnimation(roll,nonce){
    const current=activeRollAnimation;
    if(!current||current.id!==roll.id)return;
    current.started=true;
    playSound('dice-roll');
    const board=$('board');
    const center=board.querySelector('.board-center');
    if(!center)return;
    const player=state.players.find(p=>p.id===roll.playerId);
    const playerName=player?.name||'玩家';
    const stage=document.createElement('div');
    stage.className='dice-stage';
    stage.innerHTML=`<span class="dice-stage-label">🎲 ${esc(playerName)} 正在擲骰…</span><span class="dice-rolling-face" aria-label="骰子滾動中">⚀</span><span class="dice-stage-count">準備前進！</span>`;
    center.appendChild(stage);
    const dice=stage.querySelector('.dice-rolling-face');
    let index=0;
    const ticking=setInterval(()=>{dice.textContent=diceIcons[(index++%6)+1];},85);
    const valid=()=>animationNonce===nonce&&activeRollAnimation?.id===roll.id&&state?.status==='playing';
    await sleep(reducedMotion?260:900);
    clearInterval(ticking);
    if(!valid())return;
    dice.textContent=diceIcons[roll.die];
    dice.setAttribute('aria-label',`${roll.die} 點`);
    stage.classList.add('dice-show-result');
    playSound('dice-result');
    stage.querySelector('.dice-stage-label').textContent=`🎲 ${playerName} 擲出`;
    stage.querySelector('.dice-stage-count').textContent=`${roll.die} 點！`;
    await sleep(reducedMotion?330:650);
    if(!valid())return;
    stage.remove();
    // 只在擲骰前進時，將動物從原本的小圖示放大為逐格跳躍的角色。
    const mover=document.createElement('div');
    mover.className='moving-pawn moving-animal position-instant';
    mover.innerHTML=`<span class="moving-animal-art"><span class="moving-animal-sprite">${animalHtml(player?.animal||'🐾')}</span></span><span class="moving-animal-shadow" aria-hidden="true"></span>`;
    mover.style.cssText=colorStyle(player);
    mover.setAttribute('role','img');
    mover.setAttribute('aria-label',`${playerName} 的動物正在逐格跳躍`);
    board.appendChild(mover);
    const sprite=mover.querySelector('.moving-animal-sprite');
    const duration=reducedMotion?65:215;
    mover.style.setProperty('--animal-step-duration',`${duration}ms`);
    const locate=id=>{
      const tile=board.querySelector(`[data-tile-id="${id}"]`);
      if(!tile)return;
      const oldX=Number.parseFloat(mover.style.left);
      const x=Number.parseFloat(tile.style.left);
      if(Number.isFinite(oldX)&&oldX!==x)mover.classList.toggle('facing-left',x<oldX);
      board.querySelectorAll('.tile-move-target').forEach(x=>x.classList.remove('tile-move-target'));
      tile.classList.add('tile-move-target');
      focusMapTile(id);
      // 移動座標仍由伺服器計算的骰子結果決定，不改動實際落點。
      mover.style.left=tile.style.left;
      mover.style.top=tile.style.top;
    };
    locate(roll.from);
    // 動物先出現在原格，再開始跳，避免從左上角飛進棋盤。
    await sleep(40);
    if(!valid())return;
    mover.classList.remove('position-instant');
    for(let step=1;step<=roll.die;step++){
      if(!valid())return;
      locate((roll.from+step)%state.board.length);
      playSound('hop');
      // 每格重播單次跳躍；例如骰出 4 點，動物就跳 4 格。
      if(!reducedMotion){
        sprite.classList.remove('is-hopping');
        void sprite.offsetWidth;
        sprite.classList.add('is-hopping');
      }
      await sleep(duration+20);
    }
    if(!valid())return;
    sprite.classList.remove('is-hopping');
    mover.classList.add('is-landing');
    await sleep(reducedMotion?70:180);
    if(!valid())return;
    // 抵達後重新畫棋盤：動物會恢復成 v1.5 的小棋子圖示。
    activeRollAnimation=null;
    renderBoard();renderTurnActions();renderQuestion();renderDuel();
    focusMapTile(roll.position);
    playLandingTileEffect(roll.position);
    if((state.log||[]).some(l=>l.at>=roll.at&&/支付.*過路費/.test(l.text))){
      setTimeout(()=>{if(animationNonce===nonce)playSound('rent');},250);
    }
    if(isMyTurn() || state.duel?.ownerId===me){
      const panel=state.duel?$('duel-panel'):state.pending?$('question-panel'):null;
      if(panel&&!panel.hidden)setTimeout(()=>{if(animationNonce===nonce)panel.scrollIntoView({behavior:reducedMotion?'instant':'smooth',block:'center'});},450);
    }
    const tile=state.board[roll.position];
    const card=state.pending?.card;
    // 直接付租金、繳稅或領補給金時不會再有問答事件，必須在到站提示裡清楚呈現。
    const immediate=(state.log||[]).find(l=>l.at>=roll.at&&/支付.*過路費|免繳過路費|休息補給|繳交稅金|現金不足/.test(l.text));
    const passStart=roll.from+roll.die>=state.board.length?'｜🏁 經過起點，領到 $200':'';
    const outcome=card?`${card.title}：${card.detail}`:(immediate?.text||tile?.tip||'準備接受下一個挑戰！');
    showSpotlight(tile?.icon||'🎲',`${playerName} 前進 ${roll.die} 格，抵達「${tile?.name||'目的地'}」`,`${outcome}${passStart}`,'event');
    if(deferredFeedback){
      const queued=deferredFeedback;deferredFeedback=null;
      setTimeout(()=>{
        if(animationNonce===nonce)showSpotlight(queued.icon,queued.title,queued.detail,queued.kind);
      },1700);
    }
  }

  // v1.7.2：只有進行數學答題或劇情選擇時，才讓題目優先顯示在資產下方。
  // 答題結束（含「答對後決定購地」）會恢復操作區在上、解析在下的順序。
  // 移動既有節點而不是重建面板，保留按鈕事件及展開的成就區狀態。
  function syncQuestionPanelPosition(){
    const sidebar=document.querySelector('.side-column');
    const question=$('question-panel');
    const current=sidebar?.querySelector('.current-panel');
    const result=$('result-panel');
    if(!sidebar||!question||!current||!result)return;
    const questionFirst=state?.status==='playing'
      && (state.phase==='answering'||state.phase==='story')
      && !question.hidden;
    sidebar.classList.toggle('question-priority',questionFirst);
    if(questionFirst){
      if(question.nextElementSibling!==current)sidebar.insertBefore(question,current);
    }else if(question.nextElementSibling!==result){
      // 讓購地確認在回合操作區下方；解題解析一律在回合操作區之後。
      sidebar.insertBefore(question,result);
    }
  }
  function renderPlaying(){
    $('round-chip').textContent=state.roundLimit===null?`第 ${state.round} 輪 · ♾️ 無限輪`:`第 ${state.round} / ${state.roundLimit} 輪`;
    updateSessionClock();
    $('turn-status').textContent=isMyTurn()?'換你啦！':'等待中';
    const current=activePlayer();
    $('current-player').innerHTML=current
      ?`<div class="current-identity" style="${colorStyle(current)}"><div class="active-animal">${animalHtml(current.animal)}</div><div><div class="active-name">${esc(current.name)}${isMyTurn()?' ✨':''}</div><div class="active-sub"><span class="person-color-dot"></span>${colorFor(current).name}棋子 · 現金 ${money(current.cash)} · ${current.properties.length} 處房產</div></div></div>`:'';
    if(!mapZoomInitialized)fitMapToDevice();
    if(!activeRollAnimation?.started)renderBoard();
    renderTurnActions();renderQuestion();renderDuel();renderResult();renderMyAssets();renderAchievements();renderScoreboard();renderLog();
    syncQuestionPanelPosition();
    $('teacher-panel').hidden=!isHost();
  }
  function renderTurnActions(){
    const el=$('turn-actions');el.innerHTML='';
    const turn=isMyTurn(),phase=state.phase;
    if(activeRollAnimation){el.innerHTML='<div class="phase-help action-moving">🎲 骰子已擲出！正在沿著地圖逐格前進…</div>';return;}
    if(phase==='rolling'){
      el.innerHTML=turn?'<button id="roll-btn" class="btn primary roll-btn">🎲 擲骰子！</button><div class="phase-help">點擊後會沿著地圖前進 1～6 格。</div>':`<div class="phase-help">等待 ${esc(activePlayer()?.name)} 擲骰子…</div>`;
      $('roll-btn')?.addEventListener('click',()=>request('roll'));
    }else if(phase==='story'){
      el.innerHTML=`<div class="phase-help">${turn?'🔮 命運事件！請選擇一條冒險路線。':'🔮 '+esc(activePlayer()?.name)+' 正在決定命運分支！'}</div>`;
    }else if(phase==='answering'){
      el.innerHTML=`<div class="phase-help">${turn?'📖 你遇到了數學挑戰！請看下方題目。':'📖 '+esc(activePlayer()?.name)+' 正在解小數題，大家可以一起算算看！'}</div>`;
    }else if(phase==='buying'){
      el.innerHTML=`<div class="phase-help">${turn?'🏡 答對了！決定要不要購買這間店。':'🏡 等待 '+esc(activePlayer()?.name)+' 決定是否購地…'}</div>`;
    }else if(phase==='duel'){
      const d=state.duel;
      el.innerHTML='<div class="phase-help">⚔️ 屋主與租客正在玩剪刀石頭布！雙方出手後才公開手勢；請看下方對戰區。</div>';
    }else if(phase==='between'){
      const countdown='<div class="phase-help between-turn-help" id="between-timer" aria-live="off"></div>';
      el.innerHTML=turn?'<button id="next-btn" class="btn primary full">➡️ 完成回合，換下一位</button>'+countdown
        :`<div class="phase-help">等待 ${esc(activePlayer()?.name)} 結束回合…</div>`+countdown;
      $('next-btn')?.addEventListener('click',()=>request('next'));
      updateTimer();
    }
  }
  const rpsOptions=[['🪨','石頭'],['📄','布'],['✂️','剪刀']];
  function renderDuel(){
    const panel=$('duel-panel'),d=state.duel;
    if(!d){panel.hidden=true;return;}
    panel.hidden=false;
    const renter=state.players.find(p=>p.id===d.renterId),owner=state.players.find(p=>p.id===d.ownerId);
    const participant=[d.renterId,d.ownerId].includes(me);
    const mySide=me===d.renterId?'renter':'owner';
    const submitted=d.ready?.[mySide];
    const options=rpsOptions;
    const title='✊ 剪刀石頭布對決';
    const how='雙方各選石頭、布或剪刀。石頭勝剪刀、剪刀勝布、布勝石頭。平手重來，最多 3 回合。';
    const prev=d.lastExchange?`<div class="duel-last">上一回合：${esc(options[d.lastExchange.renterChoice]?.[1])} vs ${esc(options[d.lastExchange.ownerChoice]?.[1])}，平手！</div>`:'';
    panel.innerHTML=`<div class="question-tag">⚔️ 抵達他人房產 · 過路費已先結算</div><h3>${title} <small>第 ${d.round}/${d.maxRounds} 回合</small></h3>
      <p class="duel-how">${how}</p><div class="duel-vs"><div>${animalHtml(renter?.animal)} <strong>${esc(renter?.name||'租客')}</strong><small>租客 ${d.ready?.renter?'✓ 已出招':'等待出招'}</small></div><b>VS</b><div>${animalHtml(owner?.animal)} <strong>${esc(owner?.name||'屋主')}</strong><small>屋主 ${d.ready?.owner?'✓ 已出招':'等待出招'}</small></div></div>
      <div class="duel-stake">💰 輸家額外補貼最多 ${money(d.stake)} 給贏家（現金不足只付現有金額）；平手不付。</div>
      ${prev}<div class="duel-timer" id="duel-timer"></div>
      ${participant&&!submitted&&!activeRollAnimation?`<div class="duel-options">${options.map(([emoji,label],i)=>`<button class="duel-choice" data-duel-choice="${i}"><span>${emoji}</span>${esc(label)}</button>`).join('')}</div>`
        :`<p class="duel-wait">${submitted?'✅ 你已出手！手勢保密，等對方出招。':participant?'🎲 角色正在移動，稍後可以出手。':'👀 觀戰中：雙方出手後才會公開。'}</p>`}`;
    panel.querySelectorAll('[data-duel-choice]').forEach(btn=>btn.addEventListener('click',()=>{
      panel.querySelectorAll('[data-duel-choice]').forEach(b=>b.disabled=true);
      request('duelChoice',{choice:Number(btn.dataset.duelChoice)},ok=>{if(!ok)renderDuel();});
    }));
    updateTimer();
  }
  function updateSessionClock(){
    const timer=$('session-clock');if(!timer||!state||state.status!=='playing')return;
    const remaining=Math.max(0,Math.ceil((state.endsAt-Date.now())/1000));
    const minutes=Math.floor(remaining/60),seconds=remaining%60;
    const level=state.bonusStage;
    timer.textContent=`⏱️ ${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')} ${level===2?'🚀 最終衝刺 +$30':level===1?'✨ 中場加碼 +$15':`｜${state.durationMinutes} 分鐘挑戰`}`;
    timer.classList.toggle('ending',remaining<=180);
  }
  function renderQuestion(){
    const el=$('question-panel'),p=state.pending;
    if(!p || (p.type!=='buying'&&p.type!=='story'&&!p.question)){el.hidden=true;return;}
    el.hidden=false;
    const turn=isMyTurn()&&!activeRollAnimation;
    if(p.type==='story'){
      const info=p.story||{};
      const options=info.choices||[];
      const formatChange=n=>n>0?'獲得 '+money(n):n<0?'支出 '+money(-n):'金額不變';
      el.innerHTML=`<div class="question-tag">🔮 劇情選擇 · ${esc(info.title||'命運事件')}</div>
        <h3>📜 ${esc(info.scene||'神祕事件發生了！')}</h3>
        <p class="story-hint">${turn?'選擇後會出現一道小數題，答對或答錯會依選擇決定結果。':'👀 觀戰中：只有當回合玩家能決定命運。'}</p>
        <div class="story-choices">${options.map(c=>`<button class="story-choice" data-story-choice="${esc(c.id)}" ${!turn?'disabled':''}><strong>${esc(c.label)}</strong><span>${esc(c.detail)}</span><small>✅ 答對：${formatChange(c.success)}<br>📘 未答對：${formatChange(c.fail)}</small></button>`).join('')}</div>
        <div id="story-timer-label" class="question-hint"></div>`;
      el.querySelectorAll('[data-story-choice]').forEach(btn=>btn.addEventListener('click',()=>{
        el.querySelectorAll('[data-story-choice]').forEach(b=>b.disabled=true);
        request('storyChoice',{choiceId:btn.dataset.storyChoice},ok=>{if(!ok)renderQuestion();});
      }));
      updateTimer();return;
    }
    if(p.type==='buying'){
      const tile=state.board.find(t=>t.id===p.tileId);
      el.innerHTML=`<div class="question-tag">🏡 購買土地</div><h3>恭喜通過計算！你要買下「${esc(tile.name)}」嗎？</h3><div class="buy-info"><strong>購地 ${money(tile.price)}</strong><small>未來其他玩家走到這格，將支付租金 ${money(tile.rent)} 給你。</small></div>${turn?'<div class="buy-actions"><button id="buy-yes" class="btn primary">💰 買下它！</button><button id="buy-no" class="btn outline">這次不要</button></div>':'<p class="question-hint">等這回合的玩家做決定…</p>'}`;
      $('buy-yes')?.addEventListener('click',()=>request('buy',{buy:true}));
      $('buy-no')?.addEventListener('click',()=>request('buy',{buy:false}));
      return;
    }
    const opts=p.question.options;
    const poll=state.spectatorPoll;
    const hasGuessed=poll?.myChoice!==null && poll?.myChoice!==undefined;
    const canGuess=!isMyTurn()&&!activeRollAnimation&&poll&&!hasGuessed;
    const spectatorNote=isMyTurn()?'選出正確答案；作答送出後不能更改。':hasGuessed?'✅ 你已送出觀戰猜題，答案保密，等待揭曉。':'👀 你也可以選一個答案參與觀戰猜題；不會扣款，也不計入正式答題分數。';
    const eventHeader=p.card?`<div class="event-card-head">🎴 ${esc(p.card.title)}<small>${esc(p.card.choiceLabel||'')}${p.card.detail?'｜'+esc(p.card.detail):''}</small></div>`:'';
    const nextRound=p.total>1?` · 第 ${p.stage} / ${p.total} 題`:'';
    el.innerHTML=`<div class="question-tag">📝 ${esc(typeNames[p.type]||'數學挑戰')}${nextRound}</div>${eventHeader}<h3>${esc(p.question.text)}</h3><div class="timer-bar"><div id="timer-fill" class="timer-fill"></div></div><div id="timer-label" class="question-hint"></div><div class="options">${opts.map((option,i)=>`<button class="option-btn${hasGuessed&&poll?.myChoice===i?' spectator-selected':''}" data-${turn?'choice':'spectator-choice'}="${i}" ${!turn&&!canGuess?'disabled':''}><span style="opacity:.55">${'ABCD'[i]}.</span> ${esc(option)}</button>`).join('')}</div><div class="question-hint">${spectatorNote}${poll?'｜已有 '+poll.submitted+' / '+poll.total+' 位觀戰者提交':''}</div>`;
    el.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>{
      const index=Number(b.dataset.choice);
      el.querySelectorAll('[data-choice]').forEach(x=>x.disabled=true);
      request('answer',{index});
    }));
    el.querySelectorAll('[data-spectator-choice]').forEach(btn=>btn.addEventListener('click',()=>{
      el.querySelectorAll('[data-spectator-choice]').forEach(b=>b.disabled=true);
      request('spectatorGuess',{index:Number(btn.dataset.spectatorChoice)},ok=>{if(!ok)renderQuestion();});
    }));
    updateTimer();
  }
  function updateTimer(){
    const p=state?.pending;
    if(p?.expiresAt){
    const rem=Math.max(0,Math.ceil((p.expiresAt-Date.now())/1000));
    const timer=$('timer-label'),fill=$('timer-fill');
    if(timer)timer.textContent=`⏱️ 還有 ${rem} 秒（本題 ${state?.questionSeconds||120} 秒）｜可使用紙筆計算；逾時視為未答對`;
    if(fill){fill.style.width=`${Math.min(100,rem/(state?.questionSeconds||120)*100)}%`;fill.style.background=rem<20?'#d77470':'#e6a267';}
    }
    const st=$('story-timer-label');
    if(st&&p?.type==='story')st.textContent='⏱️ 還有 '+Math.max(0,Math.ceil((p.expiresAt-Date.now())/1000))+' 秒選擇；逾時自動採取穩健方案。';
    const betweenTimer=$('between-timer');
    if(betweenTimer&&state?.phase==='between'){
      const remaining=Math.max(0,Math.ceil(((state.betweenExpiresAt||Date.now())-Date.now())/1000));
      betweenTimer.textContent=`⏳ 還有 ${remaining} 秒，若未按「完成回合」，系統會自動換人。`;
    }
    const d=state?.duel,dt=$('duel-timer');
    if(dt&&d)dt.textContent=`⏱️ 本次出手剩下 ${Math.max(0,Math.ceil((d.expiresAt-Date.now())/1000))} 秒；超時未出手可能判負。`;
    updateSessionClock();
  }
  setInterval(updateTimer,350);
  function renderResult(){
    const el=$('result-panel'),r=state.lastResult;
    if(!r){el.hidden=true;return;}
    el.hidden=false;el.classList.toggle('is-wrong',!r.correct);
    const questionHtml=r.questionText?`<div class="result-question"><div class="result-question-heading">📖 本題題目</div>
      <p class="result-question-text">${esc(r.questionText)}</p>
      <div class="result-question-options">${(r.questionOptions||[]).map((answer,index)=>{
        const isCorrect=index===r.correctIndex,wasSelected=index===r.selectedIndex;
        return `<div class="result-question-option${isCorrect?' is-correct':''}${wasSelected&&!isCorrect?' is-selected-wrong':''}">
          <span class="option-letter">${String.fromCharCode(65+index)}</span>
          <span>${esc(answer)}</span>${isCorrect?'<strong>✅ 正確</strong>':wasSelected?'<strong>你選的</strong>':''}
        </div>`;
      }).join('')}</div>
      ${r.selectedIndex===null?'<div class="result-choice-hint">本題未提交答案（逾時或由房主略過）。</div>':''}
    </div>`:'';
    const poll=state.lastPoll;
    const pollHtml=poll?`<div class="spectator-summary">👀 本題觀戰：${poll.correctCount} / ${poll.total} 人猜對${poll.myCorrect===true?' · ✅ 你也猜對了！':poll.myCorrect===false?' · 📘 下次再挑戰！':''}</div>`:'';
    el.innerHTML=`<div class="result-head">${r.correct?'✅ 計算正確！':'📘 解題解析'}</div>${questionHtml}<div class="result-answer">正確答案：<strong>${esc(r.correctAnswer)}</strong><br/>${esc(r.explanation)}</div>${pollHtml}`;
  }
  function landValue(p){return p.properties.reduce((sum,id)=>sum+(state.board[id]?.price||0),0);}
  function wealth(p){return p.cash+landValue(p);}
  function renderMyAssets(){
    const el=$('my-assets-panel'),p=myPlayer();
    if(!p){el.hidden=true;return;}
    el.hidden=false;
    const paint=colorFor(p),assetValue=landValue(p);
    const properties=p.properties.map(id=>state.board[id]).filter(Boolean).sort((a,b)=>a.id-b.id);
    el.innerHTML=`<div class="assets-header" style="${colorStyle(p)}"><span class="assets-title">💼 我的資產</span><span class="my-identity">${animalHtml(p.animal)} ${esc(p.name)} · ${paint.name}</span></div>
      <div class="asset-totals" style="${colorStyle(p)}"><div class="asset-metric"><span>💵 現金餘額</span><strong>${money(p.cash)}</strong></div><div class="asset-metric"><span>🏠 房產總值</span><strong>${money(assetValue)}</strong></div><div class="asset-metric asset-sum"><span>💰 總資產</span><strong>${money(wealth(p))}</strong></div></div>
      <div class="assets-land-heading">🏡 我的房產（${properties.length} 處）<small>點選可定位到棋盤</small></div>
      <div class="assets-property-list">${properties.length?properties.map(tile=>`<button type="button" class="asset-property" style="${colorStyle(p)}" data-asset-tile="${tile.id}" title="聚焦到 ${esc(tile.name)}"><span class="asset-property-name">${esc(tile.icon)} ${esc(tile.name)}</span><span>價值 ${money(tile.price)} · 租金 ${money(tile.rent)}</span></button>`).join(''):'<span class="assets-empty">還沒有房產。答對購地題後就能購買，土地會以你的代表色標示。</span>'}</div>`;
    el.querySelectorAll('[data-asset-tile]').forEach(btn=>btn.addEventListener('click',()=>{
      if(activeRollAnimation){showToast('棋子正在移動，請稍後再查看房產。');return;}
      focusMapTile(Number(btn.dataset.assetTile),'smooth');
      boardWrapper.scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'center'});
    }));
  }
  function renderScoreboard(){
    const el=$('scoreboard');
    const ranking=[...state.players].sort((a,b)=>wealth(b)-wealth(a)||b.correct-a.correct);
    el.innerHTML=ranking.map((p,i)=>`<div class="score-row${p.id===me?' me':''}" style="${colorStyle(p)}"><div class="score-place">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</div><div class="score-avatar">${animalHtml(p.animal)}</div><div class="score-content"><div class="score-name"><span class="person-color-dot"></span>${esc(p.name)} <small>${colorFor(p).name}</small>${titleText(p)?'<span class="rank-title">'+esc(titleText(p))+'</span>':''}${p.host?' 👑':''}${p.isBot?' 🤖 BOT':''}${!p.connected&&!p.isBot?' 🔌':''}${p.id===me?'（我）':''}</div><div class="score-detail">💵 現金 <b>${money(p.cash)}</b>　🏠 房產 <b>${money(landValue(p))}</b>（${p.properties.length} 處）</div><div class="score-detail">答對 ${p.correct}/${p.attempted} 題</div></div><div class="score-money"><small>總資產</small><strong>${money(wealth(p))}</strong></div></div>`).join('');
  }
  function renderLog(){
    const current=state.log?.[0]?.id;
    const newEntry=!!seenLogId&&current!==seenLogId;
    $('history').innerHTML=state.log.map((l,i)=>`<div class="log-line${i===0?' latest':''}${i===0&&newEntry?' just-added':''}"><time>${new Date(l.at).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</time>${esc(l.text)}</div>`).join('');
  }
  function renderAchievements(){
    const panel=$('achievement-panel'),content=$('achievement-content'),mePlayer=myPlayer();
    const progress=$('achievement-progress'),currentTitle=$('achievement-current-title');
    if(!panel||!content||!progress||!currentTitle||!mePlayer)return;
    const catalog=state.achievementCatalog||[];
    const earned=new Set(mePlayer.achievements||[]);
    const title=badgeFor(mePlayer.titleId);
    const poll=state.mySpectatorScore;
    // Keep the native <details> element intact so redraws never reopen the panel.
    progress.textContent=`${earned.size} / ${catalog.length}`;
    currentTitle.textContent=title?`目前稱號：${title.icon} ${title.title}`:'目前稱號：尚未解鎖';
    content.innerHTML=`<p class="achievement-current">👀 觀戰猜對 ${poll?.correct||0} / ${poll?.attempted||0} 題</p>
      <div class="achievement-grid">${catalog.map(a=>{
        const unlocked=earned.has(a.id);
        const selected=mePlayer.titleId===a.id;
        return `<div class="achievement-card${unlocked?' unlocked':' locked'}"><div class="achievement-icon">${unlocked?esc(a.icon):'🔒'}</div><strong>${esc(a.title)}</strong><small>${esc(a.description)}</small>${unlocked?`<button type="button" class="achievement-equip" data-title-id="${esc(a.id)}" ${selected?'disabled':''}>${selected?'已裝備':'設為稱號'}</button>`:'<span class="achievement-pending">待解鎖</span>'}</div>`;
      }).join('')}</div>`;
    content.querySelectorAll('[data-title-id]').forEach(btn=>btn.addEventListener('click',()=>{
      const achievementId=btn.dataset.titleId;
      btn.disabled=true;
      request('equipTitle',{achievementId},ok=>{if(!ok)renderAchievements();});
    }));
  }
  function renderEndAchievements(){
    const panel=$('end-achievements'),player=myPlayer();
    if(!panel||!player)return;
    const earned=new Set(player.achievements||[]);
    const badges=(state.achievementCatalog||[]).filter(a=>earned.has(a.id));
    panel.innerHTML='<h3>🏅 本局獲得的冒險成就</h3>'+(badges.length
      ? '<div class="end-badges">'+badges.map(a=>'<span class="end-badge">'+esc(a.icon+' '+a.title)+'</span>').join('')+'</div>'
      : '<p class="feedback-note">這局尚未獲得成就；下一次挑戰更多數學題吧！</p>');
  }

  function renderLearningFeedback(){
    const el=$('learning-feedback');
    const mine=state.personalFeedback;
    const group=state.classFeedback;
    if(!mine){el.innerHTML='<p>正在載入你的學習回饋…</p>';return;}
    const percent=n=>n===null?'尚無資料':`${n}%`;
    const allRows=[...mine.bySkill].sort((a,b)=>b.wrong-a.wrong || a.accuracy-b.accuracy);
    const weak=mine.weakSkills;
    const intro=mine.attempted===0?'這局沒有被計入的作答，暫時無法判斷熟練度。':
      weak.length===0?'這局作答的題目全部正確！繼續練習其他題型，增加挑戰。':
      `這局你答錯 ${mine.wrong} 題，建議先複習下列 ${weak.length} 種題型。題數少時，結果只是練習線索，不代表能力評定。`;
    const weakHtml=weak.length?`<div class="feedback-weak-grid">${weak.map((item,index)=>`<div class="feedback-weak-card"><div class="feedback-weak-heading"><b>${index+1}. ${esc(item.name)}</b><span>答錯 ${item.wrong}/${item.attempted} 題</span></div><p>💡 ${esc(item.tip)}</p>${item.timedOut?`<small>其中 ${item.timedOut} 題是時間到未作答。</small>`:''}</div>`).join('')}</div>`:'';
    const typeRows=allRows.length?allRows.map(item=>`<div class="feedback-skill-row"><span>${esc(item.name)}</span><span>${item.correct} / ${item.attempted} 題</span><strong class="${item.wrong?'need-review':'all-correct'}">${percent(item.accuracy)}</strong></div>`).join(''):'<p class="feedback-note">本局尚無可統計的題目。</p>';
    const examples=mine.examples.map(item=>`<details class="feedback-example"><summary><span class="feedback-example-type">${esc(item.skillName)}</span>${esc(item.question)}${item.timedOut?' <small>（逾時）</small>':''}</summary><div class="feedback-example-solution"><strong>正確答案：${esc(item.answer)}</strong><p>${esc(item.explanation)}</p></div></details>`).join('');
    const classRows=group?.bySkill?.length?group.bySkill.slice(0,5).map(item=>`<div class="feedback-skill-row"><span>${esc(item.name)}</span><span>全班答錯 ${item.wrong}/${item.attempted} 題</span><strong>${percent(item.accuracy)}</strong></div>`).join(''):'<p class="feedback-note">這局沒有全班答題資料。</p>';
    el.innerHTML=`<div class="feedback-heading"><div><span class="overline">PERSONAL LEARNING REPORT</span><h3>🧠 我的數學學習回饋</h3></div><div class="feedback-overall" style="${colorStyle(myPlayer())}">${animalHtml(myPlayer()?.animal)} <strong>${mine.correct} / ${mine.attempted}</strong><small>答對題數 · 正確率 ${percent(mine.accuracy)}</small></div></div>
      <p class="feedback-intro">${esc(intro)}</p>
      ${mine.timedOut?`<p class="feedback-note">⏱️ 有 ${mine.timedOut} 題因時間到而記為未答對，請搭配作答時間看結果。</p>`:''}
      ${weakHtml}<h4>📊 各種題型作答統計</h4><div class="feedback-skill-list">${typeRows}</div>
      <h4>📖 我的錯題複習（最多 6 題）</h4>${examples||'<p class="feedback-note">這局沒有錯題可以回顧。</p>'}
      <div class="feedback-privacy">🔒 這份個人錯題和解析只有你自己能看到；全班共通題型統計不會顯示個人姓名。</div>
      <div class="feedback-class"><h4>🏫 全班共同需要練習的題型</h4><p class="feedback-note">依答錯次數排序，僅供教師規劃下次複習；不同題型的作答次數可能不同。</p>${classRows}</div>`;
  }
  function updateReflectionUI(){
    const area=$('reflection-input');
    const len=[...area.value].length;
    $('reflection-count').textContent=`${len} / 600 字`;
    $('reflection-count').classList.toggle('over-limit',len>600);
    $('reflection-save').disabled=len===0||len>600;
    const saved=state?.myReflection;
    $('reflection-status').textContent=reflectionDirty
      ? '📝 內容已修改，尚未送出。送出後只有你和房主能閱讀。'
      : saved?`✅ 已送出回饋；可以修改後再次送出。`:'🔒 尚未送出。只有你與房主能閱讀你的文字回饋。';
  }
  function renderWrittenReflection(){
    const saved=state.myReflection;
    const area=$('reflection-input');
    if(!reflectionDirty&&area.value!==(saved?.text||''))area.value=saved?.text||'';
    updateReflectionUI();
    const section=$('teacher-reflections');section.hidden=!isHost();
    if(!isHost()){$('reflection-list').replaceChildren();return;}
    const entries=state.hostReflections||[];
    const completed=entries.filter(item=>item.reflection).length;
    $('reflection-list').innerHTML=`<p class="reflection-status">已收到 ${completed} / ${entries.length} 位玩家的回饋（房主也可填寫）。</p>`+entries.map(item=>
      `<article class="reflection-entry" style="${colorStyle(item)}"><div class="reflection-entry-head">${animalHtml(item.animal)} <strong>${esc(item.name)}${item.id===me?'（我）':''}</strong> <span>${item.reflection?'✅ 已填寫':'⏳ 尚未填寫'}</span></div>${item.reflection?`<p>${esc(item.reflection.text)}</p>`:''}</article>`
    ).join('');
  }
  function renderEnd(){
    $('end-rankings').innerHTML=state.rankings.map((r,i)=>`<div class="end-row" style="${colorStyle(r)}"><strong>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</strong><span class="avatar">${animalHtml(r.animal)}</span><div><strong><span class="person-color-dot"></span>${esc(r.name)}${r.isBot?' 🤖 BOT':''}（${colorFor(r).name}）</strong><div class="end-stats">${r.titleId?esc(badgeFor(r.titleId)?.icon+' '+badgeFor(r.titleId)?.title)+' · ':''}現金 ${money(r.cash)} ＋ 房產 ${money(r.landValue)} · 答對 ${r.correct}/${r.attempted}</div></div><div class="end-amount">${money(r.score)}</div></div>`).join('');
    renderLearningFeedback();
    renderEndAchievements();
    renderWrittenReflection();
    $('restart-btn').hidden=!isHost();
  }
})();
