/* 小數富翁探險島 v1.8.1：免音檔、純 Web Audio 音效。 */
(function(root){
  'use strict';
  const STORAGE_KEY='decimal-monopoly-sound-v1';
  const DEFAULT_VOLUME=0.18;
  const clamp=value=>Math.min(1,Math.max(0,Number.isFinite(Number(value))?Number(value):DEFAULT_VOLUME));
  function createAudioEngine(env){
    const AudioClass=env.AudioContext||env.webkitAudioContext;
    let enabled=true,volume=DEFAULT_VOLUME,context=null,master=null;
    const lastPlayed=new Map();
    try{
      const stored=JSON.parse(env.localStorage?.getItem(STORAGE_KEY)||'null');
      if(stored && typeof stored.enabled==='boolean')enabled=stored.enabled;
      if(stored && typeof stored.volume==='number')volume=clamp(stored.volume);
    }catch{}
    function save(){
      try{env.localStorage?.setItem(STORAGE_KEY,JSON.stringify({enabled,volume}));}catch{}
    }
    function ensure(){
      if(context)return context;
      if(!AudioClass)return null;
      try{
        context=new AudioClass();
        master=context.createGain();
        master.gain.value=volume;
        master.connect(context.destination);
        return context;
      }catch{context=null;master=null;return null;}
    }
    async function unlock(){
      if(!enabled||!ensure())return false;
      try{
        if(context.state!=='running'&&typeof context.resume==='function')await context.resume();
        return context.state==='running';
      }catch{return false;}
    }
    function setEnabled(value){
      enabled=!!value;save();
      // 停用後讓目前發出的音符立即變小；重新啟用還原低音量。
      if(master)master.gain.value=enabled?volume:0;
      return enabled;
    }
    function setVolume(value){
      volume=clamp(value);save();
      if(master)master.gain.value=enabled?volume:0;
      return volume;
    }
    function getSettings(){return {enabled,volume,supported:!!AudioClass,ready:context?.state==='running'};}
    function note(hz,offset=0,duration=.14,type='sine',loudness=.38,endHz=hz){
      if(!context||!master||duration<=0)return;
      const when=context.currentTime+.012+offset;
      const oscillator=context.createOscillator(),gain=context.createGain();
      oscillator.type=type;
      oscillator.frequency.setValueAtTime(Math.max(40,hz),when);
      if(endHz!==hz)oscillator.frequency.exponentialRampToValueAtTime(Math.max(40,endHz),when+duration);
      gain.gain.setValueAtTime(.0001,when);
      gain.gain.exponentialRampToValueAtTime(Math.max(.001,loudness),when+Math.min(.024,duration/3));
      gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
      oscillator.connect(gain);gain.connect(master);
      oscillator.start(when);oscillator.stop(when+duration+.015);
    }
    function sequence(hzList,type='sine',gap=.09,loudness=.33){
      hzList.forEach((hz,i)=>note(hz,i*gap,.12,type,loudness));
    }
    function tick(offset=0,pitch=500,level=.35){
      // 用快速衰減的方波模擬骰子落桌和腳步聲；不需下載音效檔。
      note(pitch,offset,.038,'square',level,pitch*.55);
      note(pitch*.58,offset+.015,.05,'triangle',level*.5,pitch*.35);
    }
    function play(kind,detail={}){
      if(!enabled||!context||context.state!=='running')return false;
      const now=Date.now(),cooldown=kind==='hop'?115:kind==='rent'?280:kind==='preview'?120:90;
      if(now-(lastPlayed.get(kind)||0)<cooldown)return false;
      lastPlayed.set(kind,now);
      switch(kind){
        case 'dice-roll':
          for(let i=0;i<10;i++)tick(i*.084,370+(i%4)*83,.23);
          break;
        case 'dice-result':
          tick(0,350,.33);note(680,.065,.17,'triangle',.27);break;
        case 'hop':tick(0,550,.17);break;
        case 'landing':{
          const type=detail.type||'';
          const id=Number(detail.tileId);
          if(type==='jail'){sequence([430,320,220],'sawtooth',.12,.22);}
          else if(type==='share'){sequence([520,690,580,740],'triangle',.09,.23);}
          else if(type==='fate'){sequence([300,450,385,600],'sine',.095,.27);}
          else if(type==='chance'){sequence([525,660,785],'triangle',.09,.29);}
          else if(type==='chest'){sequence([650,865,1040,1300],'sine',.085,.25);}
          else if(type==='boss'){sequence([245,220,175],'sawtooth',.12,.20);}
          else if(type==='tax'){sequence([490,350,280],'triangle',.1,.21);}
          else if(type==='rest'){sequence([440,565,660],'sine',.1,.26);}
          else if(type==='property'){
            // 每個店面落點都有不同的小旋律；電影院、咖啡館、海洋樂園特別區分。
            const specials={
              22:[392,587,784],24:[523,659,587],27:[440,587,740,880],
              11:[480,600,720],9:[390,525,690],19:[660,830,990],
              15:[523,784,1046],17:[493,587,698]
            };
            const notes=specials[id]||[440+(id%5)*37,565+(id%4)*35];
            sequence(notes,id===19?'square':'sine',.09,.22);
          }else if(type==='discount'||type==='compare'){sequence([580,730],'triangle',.11,.24);}
          else{tick(0,440,.22);note(640,.08,.11,'sine',.18);}
          break;
        }
        case 'correct':sequence([523,659,784,1046],'triangle',.08,.27);break;
        case 'wrong':sequence([392,335,294],'sine',.13,.21);break;
        case 'purchase':
          sequence([392,523,659,784,988],'triangle',.085,.29);break;
        case 'rent':
          tick(0,610,.25);sequence([480,390,335],'triangle',.08,.18);break;
        case 'story':sequence([415,554,370,622],'sine',.105,.20);break;
        case 'duel-start':tick(0,380,.24);tick(.15,450,.24);note(550,.30,.20,'triangle',.22);break;
        case 'duel-end':sequence([440,554,660],'triangle',.10,.24);break;
        case 'achievement':
          sequence([523,659,784,1046,1175],'triangle',.085,.27);break;
        case 'finish':
          note(392,0,.27,'triangle',.28);note(494,.10,.27,'triangle',.24);
          note(588,.20,.34,'sine',.28);note(784,.30,.42,'sine',.28);break;
        case 'preview':sequence([523,659,784],'triangle',.085,.28);break;
        default:return false;
      }
      return true;
    }
    return {unlock,setEnabled,setVolume,getSettings,play};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={createAudioEngine};
  if(root&&typeof root.document!=='undefined')root.DecimalMonopolyAudio=createAudioEngine(root);
})(typeof window!=='undefined'?window:globalThis);
