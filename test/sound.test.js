'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAudioEngine}=require('../public/sound');

class FakeAudioContext {
  static instances=[];
  constructor(){
    this.state='suspended';this.currentTime=5;this.destination={};this.notes=[];
    FakeAudioContext.instances.push(this);
  }
  createGain(){
    return {gain:{
      value:0,
      setValueAtTime(value){this.value=value;},
      exponentialRampToValueAtTime(value){this.value=value;}
    },connect(){}};
  }
  createOscillator(){
    const context=this;
    return {type:'sine',frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},
      connect(){},start(t){context.notes.push(t);},stop(){}};
  }
  async resume(){this.state='running';}
}
function makeEnvironment(storage=new Map()){
  return {
    AudioContext:FakeAudioContext,
    localStorage:{
      getItem(key){return storage.get(key)||null;},
      setItem(key,value){storage.set(key,value);}
    }
  };
}
test('音效引擎無須外部音檔，初始不自動建立音訊播放環境',()=>{
  FakeAudioContext.instances.length=0;
  const engine=createAudioEngine(makeEnvironment());
  assert.equal(engine.getSettings().enabled,true);
  assert.equal(engine.getSettings().volume,0.18);
  assert.equal(engine.getSettings().supported,true);
  assert.equal(engine.getSettings().ready,false);
  assert.equal(FakeAudioContext.instances.length,0);
  assert.equal(engine.play('dice-roll'),false,'第一次使用者互動前不准播放');
});
test('使用者互動解鎖後，骰子、移動、答題與購地音效使用同一個 AudioContext',async()=>{
  FakeAudioContext.instances.length=0;
  const engine=createAudioEngine(makeEnvironment());
  assert.equal(await engine.unlock(),true);
  assert.equal(engine.getSettings().ready,true);
  const soundNames=['dice-roll','dice-result','hop','correct','wrong','purchase','rent','story',
    'duel-start','duel-end','achievement','finish','preview'];
  for(const name of soundNames)assert.equal(engine.play(name),true,name);
  const ctx=FakeAudioContext.instances[0];
  assert.ok(ctx.notes.length>20,'需要真的排程 Web Audio 音符');
  assert.equal(FakeAudioContext.instances.length,1,'避免每個音效都建立新環境');
  assert.equal(engine.play('nonexistent-kind'),false);
});
test('命運、機會、寶箱與 13 種店面落點可用不同音高音效',async()=>{
  const engine=createAudioEngine(makeEnvironment());
  await engine.unlock();
  const effects=['fate','chance','chest','boss','tax','rest','property','discount'];
  for(const type of effects){
    const themed=createAudioEngine(makeEnvironment());
    await themed.unlock();
    assert.equal(themed.play('landing',{type,tileId:1}),true,type);
  }
  for(const tileId of [1,3,5,7,9,11,13,15,17,19,22,24,27]){
    // 落點有短暫去重保護；不同播放環境可獨立驗證店面主題。
    const another=createAudioEngine(makeEnvironment());
    await another.unlock();
    assert.equal(another.play('landing',{type:'property',tileId}),true,tileId);
  }
});
test('靜音立即禁止新音效，音量與開關保留至下次開啟',async()=>{
  const storage=new Map(),engine=createAudioEngine(makeEnvironment(storage));
  await engine.unlock();
  engine.setVolume(0.32);
  assert.equal(engine.getSettings().volume,0.32);
  engine.setEnabled(false);
  assert.equal(engine.play('purchase'),false);
  assert.equal(await engine.unlock(),false);
  const settings=JSON.parse(storage.get('decimal-monopoly-sound-v1'));
  assert.deepEqual(settings,{enabled:false,volume:0.32});
  const restored=createAudioEngine(makeEnvironment(storage));
  assert.deepEqual({...restored.getSettings(),supported:true,ready:false},
    {enabled:false,volume:0.32,supported:true,ready:false});
  restored.setEnabled(true);
  await restored.unlock();
  assert.equal(restored.play('preview'),true);
});
test('防止無效音量、連續同類音效過度重疊',async()=>{
  const engine=createAudioEngine(makeEnvironment());
  assert.equal(engine.setVolume(-1),0);
  assert.equal(engine.setVolume(8),1);
  assert.equal(engine.setVolume('unknown'),0.18);
  await engine.unlock();
  assert.equal(engine.play('hop'),true);
  assert.equal(engine.play('hop'),false,'同一時刻重複腳步聲應被節流');
});
test('不支援 Web Audio 或 localStorage 不可用時不會影響遊戲',async()=>{
  const unsupported=createAudioEngine({localStorage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});
  assert.equal(unsupported.getSettings().supported,false);
  assert.equal(await unsupported.unlock(),false);
  assert.equal(unsupported.play('correct'),false);
  unsupported.setEnabled(false);unsupported.setVolume(.4);
  assert.equal(unsupported.getSettings().enabled,false);
});
test('音訊被瀏覽器阻擋時安全返回，等待下一次使用者互動',async()=>{
  class BlockedContext extends FakeAudioContext {
    async resume(){throw new Error('NotAllowedError');}
  }
  const engine=createAudioEngine({AudioContext:BlockedContext});
  assert.equal(await engine.unlock(),false);
  assert.equal(engine.play('dice-roll'),false);
});
