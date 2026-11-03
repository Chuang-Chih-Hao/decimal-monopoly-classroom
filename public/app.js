/* 小數富翁前端：所有資產、擲骰、判分都以伺服器狀態為準。 */
(() => {
  'use strict';
  const socket=io({transports:['websocket','polling'],reconnection:true});
  const $=id=>document.getElementById(id);
  const esc=(value)=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money=n=>`$${Number(n||0).toLocaleString('zh-TW')}`;
  const animals=['capybara','🐈','🐕','🐰','🦊','🐼','🐸','🐧','🦁','🐻','🐹','🐨'];
  const animalNames=['水豚','貓','狗','兔子','狐狸','貓熊','青蛙','企鵝','獅子','熊','倉鼠','無尾熊'];
  const animalHtml=a=>a==='capybara'?'<img class="animal-img" src="/capybara.svg" alt="水豚" />':esc(a);
  const diceIcons=['','⚀','⚁','⚂','⚃','⚄','⚅'];
  const typeNames={purchase:'購地數學考驗',calc:'小數神算',discount:'折扣挑戰',compare:'比價擂台',scam:'破解黑心商人',chest:'寶箱密碼',chance:'機會卡',fate:'命運卡',boss:'終極 Boss',rescue:'緊急救援'};
  let selectedAnimal='capybara';
  let state=null,me=null;
  let toastTimer;
  let spotlightTimer;
  let seenRollId=null;
  let seenLogId=null;
  let activeRollAnimation=null;
  let animationNonce=0;
  let deferredFeedback=null;
  const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  let tokenData=null;
  try {tokenData=JSON.parse(localStorage.getItem('decimal-monopoly-session')||'null');}catch{tokenData=null;}

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
    seenRollId=null;seenLogId=null;
    $('event-spotlight').hidden=true;
    tokenData=null;me=null;state=null;
    try{localStorage.removeItem('decimal-monopoly-session');}catch{}
    showEntry();
  }
  // 首次加入／重新連線時，以伺服器畫面為準，不重播已經結束的擲骰。
  function setInitialState(next){
    animationNonce++;activeRollAnimation=null;deferredFeedback=null;
    state=next;
    seenRollId=next.lastRoll?.id??null;
    seenLogId=next.log?.[0]?.id??null;
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

  function request(event,payload={},done){
    if(!socket.connected){showToast('尚未連線，請檢查網路。',true);return;}
    socket.timeout(10000).emit(event,payload,(err,response)=>{
      if(err){showToast('網路連線逾時，請再試一次。',true);return;}
      if(!response?.ok){showToast(response?.error||'操作失敗。',true);if(done)done(false);return;}
      if(done)done(true,response);
    });
  }
  function renderAnimalPicker(){
    const picker=$('animal-picker');picker.innerHTML='';
    animals.forEach((a,i)=>{
      const btn=document.createElement('button');btn.type='button';btn.className='animal-option'+(a===selectedAnimal?' selected':'');
      btn.title=animalNames[i];btn.setAttribute('aria-label',animalNames[i]);btn.setAttribute('aria-pressed',String(a===selectedAnimal));
      btn.innerHTML=animalHtml(a);
      btn.addEventListener('click',()=>{selectedAnimal=a;renderAnimalPicker();});picker.appendChild(btn);
    });
  }
  renderAnimalPicker();
  const prefill=new URLSearchParams(window.location.search).get('room');
  if(prefill)$('room-code').value=prefill.trim().toUpperCase().slice(0,6);

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
  $('start-btn').addEventListener('click',()=>request('start',{rounds:Number($('round-select').value),money:Number($('money-select').value)}));
  $('skip-btn').addEventListener('click',()=>{
    if(window.confirm('將現在的題目判為未答對（Boss 兩題都會跳過），並進入下一人。確定嗎？'))request('skip');
  });
  $('finish-btn').addEventListener('click',()=>{
    if(window.confirm('要立即結束遊戲並公布排名嗎？'))request('finish');
  });
  $('restart-btn').addEventListener('click',()=>request('reset'));

  socket.on('connect',()=>{
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
    if(isNewRoll)void playRollAnimation(next.lastRoll,animationNonce);
    else highlightNewEvents(previous,next);
    seenLogId=next.log?.[0]?.id??null;
  });
  socket.on('roomClosed',()=>{clearSession();showToast('房主已解散房間。',true);});
  socket.on('superseded',()=>{state=null;me=null;showEntry();showToast('此角色已在另一個分頁連線，這裡停止操作。',true);});

  function myPlayer(){return state?.players.find(p=>p.id===me);}
  function activePlayer(){return state?.players.find(p=>p.id===state.currentPlayerId);}
  function isMyTurn(){return state?.currentPlayerId===me;}
  function isHost(){return !!myPlayer()?.host;}
  function render(){
    if(!state||!me)return;
    $('entry-screen').hidden=true;$('game-screen').hidden=false;
    $('room-code-label').textContent=state.code;
    $('lobby-big-code').textContent=state.code;
    $('game-status-label').textContent=({lobby:'等待加入',playing:'遊戲進行中',finished:'已完成'})[state.status];
    $('whoami').innerHTML=`${animalHtml(myPlayer()?.animal)} ${esc(myPlayer()?.name)}${isHost()?'・房主':''}`;
    $('lobby-screen').hidden=state.status!=='lobby';
    $('playing-screen').hidden=state.status!=='playing';
    $('end-screen').hidden=state.status!=='finished';
    if(state.status==='lobby')renderLobby();
    if(state.status==='playing')renderPlaying();
    if(state.status==='finished')renderEnd();
  }
  function renderLobby(){
    const list=$('lobby-slots');list.innerHTML='';
    for(let i=0;i<6;i++){
      const p=state.players[i];const div=document.createElement('div');div.className='lobby-slot'+(p?'':' empty');
      div.innerHTML=p
        ? `<div class="lobby-animal">${animalHtml(p.animal)}</div><div><div class="lobby-name">${esc(p.name)}${p.id===me?'（我）':''}</div><div class="lobby-meta">${p.host?'👑 房主':'冒險家'} · ${p.connected?'已連線':'暫時離線'}</div></div>`
        :`<div class="lobby-animal">➕</div><div><div class="lobby-name">等待加入</div><div class="lobby-meta">冒險席位 ${i+1}</div></div>`;
      list.appendChild(div);
    }
    $('host-settings').hidden=!isHost();$('guest-waiting').hidden=isHost();
    $('start-btn').disabled=state.players.length<2;
  }
  function positionFor(index){
    if(index<=6)return {r:7,c:index+1};
    if(index<=12)return {r:7-(index-6),c:7};
    if(index<=18)return {r:1,c:7-(index-12)};
    return {r:1+(index-18),c:1};
  }
  function renderBoard(){
    const board=$('board');board.innerHTML='';
    state.board.forEach(tile=>{
      const pos=positionFor(tile.id),el=document.createElement('div');
      el.className=`tile ${tile.type}${tile.group?' group-'+tile.group:''}${state.players.some(p=>p.position===tile.id && p.id!==activeRollAnimation?.playerId)?' active-tile':''}${state.properties[tile.id]?' owned':''}`;
      el.dataset.tileId=String(tile.id);
      el.style.setProperty('--r',pos.r);el.style.setProperty('--c',pos.c);
      el.title=tile.type==='property'?`${tile.name}：購地 ${money(tile.price)}，租金 ${money(tile.rent)}`:`${tile.name}：${tile.tip||''}`;
      const owner=state.players.find(p=>p.id===state.properties[tile.id]);
      const pawns=state.players.filter(p=>p.position===tile.id && p.id!==activeRollAnimation?.playerId);
      el.innerHTML=`<span class="tile-icon">${esc(tile.icon)}</span><span class="tile-name">${esc(tile.name)}</span>`
        +(tile.price?`<span class="tile-price">${money(tile.price)}</span>`:'')
        +(owner?`<span class="owner-mini" title="${esc(owner.name)} 的房產">${animalHtml(owner.animal)}</span>`:'')
        +`<div class="tile-pawns">${pawns.map(p=>`<span class="pawn" title="${esc(p.name)}">${animalHtml(p.animal)}</span>`).join('')}</div>`;
      board.appendChild(el);
    });
    const center=document.createElement('div');center.id='board-center';center.className='board-center';
    const last=state.lastRoll;const who=last?state.players.find(p=>p.id===last.playerId):null;
    const text=last?`${esc(who?.name||'玩家')} 擲出 ${last.die} 點！`:'經過起點可獲得 $200';
    center.innerHTML=`<div class="center-content"><div class="center-logo">🌴 💰 🎲</div><div class="center-title">小數富翁<br/>探險島</div><div class="center-desc">${text}<br/>買店面・算折扣・破解陷阱</div>${last?`<span class="dice-face" aria-label="${last.die} 點">${diceIcons[last.die]}</span>`:''}</div>`;
    board.appendChild(center);
  }
  // 伺服器先決定唯一的點數與終點；前端只重播同一個結果，不自行擲骰。
  async function playRollAnimation(roll,nonce){
    const current=activeRollAnimation;
    if(!current||current.id!==roll.id)return;
    current.started=true;
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
    stage.querySelector('.dice-stage-label').textContent=`🎲 ${playerName} 擲出`;
    stage.querySelector('.dice-stage-count').textContent=`${roll.die} 點！`;
    await sleep(reducedMotion?330:650);
    if(!valid())return;
    stage.remove();
    const mover=document.createElement('div');
    mover.className='moving-pawn';
    mover.innerHTML=animalHtml(player?.animal||'🐾');
    mover.setAttribute('aria-label',`${playerName} 正在前進`);
    board.appendChild(mover);
    const locate=id=>{
      const tile=board.querySelector(`[data-tile-id="${id}"]`);
      if(!tile)return;
      board.querySelectorAll('.tile-move-target').forEach(x=>x.classList.remove('tile-move-target'));
      tile.classList.add('tile-move-target');
      // 以棋盤座標而不是視窗座標定位，縮放螢幕仍能逐格移動。
      mover.style.left=`${tile.offsetLeft+tile.offsetWidth/2}px`;
      mover.style.top=`${tile.offsetTop+tile.offsetHeight/2}px`;
    };
    mover.classList.add('position-instant');
    locate(roll.from);
    await sleep(40);
    mover.classList.remove('position-instant');
    for(let step=1;step<=roll.die;step++){
      if(!valid())return;
      locate((roll.from+step)%state.board.length);
      await sleep(reducedMotion?90:260);
    }
    if(!valid())return;
    await sleep(reducedMotion?100:340);
    if(!valid())return;
    activeRollAnimation=null;
    renderBoard();renderTurnActions();renderQuestion();
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
  function renderPlaying(){
    $('round-chip').textContent=`第 ${state.round} / ${state.roundLimit} 輪`;
    $('turn-status').textContent=isMyTurn()?'換你啦！':'等待中';
    const current=activePlayer();
    $('current-player').innerHTML=current
      ?`<div class="active-animal">${animalHtml(current.animal)}</div><div><div class="active-name">${esc(current.name)}${isMyTurn()?' ✨':''}</div><div class="active-sub">💰 ${money(current.cash)} · 🏠 ${current.properties.length} 處房產</div></div>`:'';
    if(!activeRollAnimation?.started)renderBoard();
    renderTurnActions();renderQuestion();renderResult();renderScoreboard();renderLog();
    $('teacher-panel').hidden=!isHost();
  }
  function renderTurnActions(){
    const el=$('turn-actions');el.innerHTML='';
    const turn=isMyTurn(),phase=state.phase;
    if(activeRollAnimation){el.innerHTML='<div class="phase-help action-moving">🎲 骰子已擲出！正在沿著地圖逐格前進…</div>';return;}
    if(phase==='rolling'){
      el.innerHTML=turn?'<button id="roll-btn" class="btn primary roll-btn">🎲 擲骰子！</button><div class="phase-help">點擊後會沿著地圖前進 1～6 格。</div>':`<div class="phase-help">等待 ${esc(activePlayer()?.name)} 擲骰子…</div>`;
      $('roll-btn')?.addEventListener('click',()=>request('roll'));
    }else if(phase==='answering'){
      el.innerHTML=`<div class="phase-help">${turn?'📖 你遇到了數學挑戰！請看下方題目。':'📖 '+esc(activePlayer()?.name)+' 正在解小數題，大家可以一起算算看！'}</div>`;
    }else if(phase==='buying'){
      el.innerHTML=`<div class="phase-help">${turn?'🏡 答對了！決定要不要購買這間店。':'🏡 等待 '+esc(activePlayer()?.name)+' 決定是否購地…'}</div>`;
    }else if(phase==='between'){
      el.innerHTML=turn?'<button id="next-btn" class="btn primary full">➡️ 完成回合，換下一位</button>':`<div class="phase-help">等待 ${esc(activePlayer()?.name)} 結束回合…</div>`;
      $('next-btn')?.addEventListener('click',()=>request('next'));
    }
  }
  function renderQuestion(){
    const el=$('question-panel'),p=state.pending;
    if(!p || (p.type!=='buying'&&!p.question)){el.hidden=true;return;}
    el.hidden=false;
    const turn=isMyTurn()&&!activeRollAnimation;
    if(p.type==='buying'){
      const tile=state.board.find(t=>t.id===p.tileId);
      el.innerHTML=`<div class="question-tag">🏡 購買土地</div><h3>恭喜通過計算！你要買下「${esc(tile.name)}」嗎？</h3><div class="buy-info"><strong>購地 ${money(tile.price)}</strong><small>未來其他玩家走到這格，將支付租金 ${money(tile.rent)} 給你。</small></div>${turn?'<div class="buy-actions"><button id="buy-yes" class="btn primary">💰 買下它！</button><button id="buy-no" class="btn outline">這次不要</button></div>':'<p class="question-hint">等這回合的玩家做決定…</p>'}`;
      $('buy-yes')?.addEventListener('click',()=>request('buy',{buy:true}));
      $('buy-no')?.addEventListener('click',()=>request('buy',{buy:false}));
      return;
    }
    const opts=p.question.options;
    const eventHeader=p.card?`<div class="event-card-head">🎴 ${esc(p.card.title)}<small>${esc(p.card.detail)}</small></div>`:'';
    const nextRound=p.total>1?` · 第 ${p.stage} / ${p.total} 題`:'';
    el.innerHTML=`<div class="question-tag">📝 ${esc(typeNames[p.type]||'數學挑戰')}${nextRound}</div>${eventHeader}<h3>${esc(p.question.text)}</h3><div class="timer-bar"><div id="timer-fill" class="timer-fill"></div></div><div id="timer-label" class="question-hint"></div><div class="options">${opts.map((option,i)=>`<button class="option-btn" data-choice="${i}" ${!turn?'disabled':''}><span style="opacity:.55">${'ABCD'[i]}.</span> ${esc(option)}</button>`).join('')}</div><div class="question-hint">${turn?'選出正確答案；作答送出後不能更改。':'👀 現在只有當回合的玩家能送出答案。可以一起討論！'}</div>`;
    el.querySelectorAll('[data-choice]').forEach(b=>b.addEventListener('click',()=>{
      const index=Number(b.dataset.choice);
      el.querySelectorAll('[data-choice]').forEach(x=>x.disabled=true);
      request('answer',{index});
    }));
    updateTimer();
  }
  function updateTimer(){
    const p=state?.pending;
    if(!p?.expiresAt)return;
    const rem=Math.max(0,Math.ceil((p.expiresAt-Date.now())/1000));
    const timer=$('timer-label'),fill=$('timer-fill');
    if(timer)timer.textContent=`⏱️ 剩下 ${rem} 秒｜時間到視為未答對`;
    if(fill){fill.style.width=`${Math.min(100,rem/80*100)}%`;fill.style.background=rem<15?'#d77470':'#e6a267';}
  }
  setInterval(updateTimer,350);
  function renderResult(){
    const el=$('result-panel'),r=state.lastResult;
    if(!r){el.hidden=true;return;}
    el.hidden=false;el.classList.toggle('is-wrong',!r.correct);
    el.innerHTML=`<div class="result-head">${r.correct?'✅ 計算正確！':'📘 解題解析'}</div><div class="result-answer">正確答案：<strong>${esc(r.correctAnswer)}</strong><br/>${esc(r.explanation)}</div>`;
  }
  function renderScoreboard(){
    const el=$('scoreboard');
    const ranking=[...state.players].sort((a,b)=>wealth(b)-wealth(a)||b.correct-a.correct);
    el.innerHTML=ranking.map((p,i)=>`<div class="score-row${p.id===me?' me':''}"><div class="score-place">${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</div><div class="score-avatar">${animalHtml(p.animal)}</div><div><div class="score-name">${esc(p.name)}${p.host?' 👑':''}${!p.connected?' 🔌':''}</div><div class="score-detail">現金 ${money(p.cash)} · 房產 ${p.properties.length} · 答對 ${p.correct}/${p.attempted}</div></div><div class="score-money">${money(wealth(p))}</div></div>`).join('');
  }
  function wealth(p){return p.cash+p.properties.reduce((sum,id)=>sum+(state.board[id]?.price||0),0);}
  function renderLog(){
    const current=state.log?.[0]?.id;
    const newEntry=!!seenLogId&&current!==seenLogId;
    $('history').innerHTML=state.log.map((l,i)=>`<div class="log-line${i===0?' latest':''}${i===0&&newEntry?' just-added':''}"><time>${new Date(l.at).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})}</time>${esc(l.text)}</div>`).join('');
  }
  function renderEnd(){
    $('end-rankings').innerHTML=state.rankings.map((r,i)=>`<div class="end-row"><strong>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</strong><span class="avatar">${animalHtml(r.animal)}</span><div><strong>${esc(r.name)}</strong><div class="end-stats">現金 ${money(r.cash)} ＋ 房產 ${money(r.landValue)} · 答對 ${r.correct}/${r.attempted}</div></div><div class="end-amount">${money(r.score)}</div></div>`).join('');
    $('restart-btn').hidden=!isHost();
  }
})();
