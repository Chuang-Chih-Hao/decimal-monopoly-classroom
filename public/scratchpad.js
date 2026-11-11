'use strict';
/**
 * 每位學生私人的數學計算紙，不使用伺服器或 localStorage。
 * 筆跡採比例座標保存於當前瀏覽器記憶體，視窗改變尺寸時可完整重繪。
 */
(function(root){
  class SimpleCalculator{
    constructor(){this.clear();}
    clear(){this.display='0';this.stored=null;this.operator=null;this.fresh=false;return this.display;}
    format(value){
      if(!Number.isFinite(value))return '錯誤';
      const rounded=Math.round((value+Math.sign(value)*Number.EPSILON)*1e6)/1e6;
      return String(Object.is(rounded,-0)?0:rounded);
    }
    compute(a,b,operator){
      switch(operator){
        case '+':return a+b;
        case '−':return a-b;
        case '×':return a*b;
        case '÷':return b===0?NaN:a/b;
        default:return b;
      }
    }
    press(key){
      key=String(key);
      if(key==='AC')return this.clear();
      if(this.display==='錯誤')this.clear();
      if(/^[0-9]$/.test(key)){
        if(this.fresh){this.display=key;this.fresh=false;}
        else if(this.display.length<13)this.display=this.display==='0'?key:this.display+key;
      }else if(key==='.'){
        if(this.fresh){this.display='0.';this.fresh=false;}
        else if(!this.display.includes('.'))this.display+='.';
      }else if(key==='⌫'){
        if(this.fresh){this.display='0';this.fresh=false;}
        else {const next=this.display.slice(0,-1);this.display=next===''||next==='-'?'0':next;}
      }else if(key==='±'){
        if(this.display!=='0')this.display=this.display.startsWith('-')?this.display.slice(1):'-'+this.display;
      }else if(key==='π'){
        this.display='3.14';this.fresh=false;
      }else if(['+','−','×','÷'].includes(key)){
        const current=Number(this.display);
        if(this.operator!==null&&this.stored!==null&&!this.fresh){
          this.display=this.format(this.compute(this.stored,current,this.operator));
          if(this.display==='錯誤'){this.stored=null;this.operator=null;this.fresh=true;return this.display;}
        }
        this.stored=Number(this.display);this.operator=key;this.fresh=true;
      }else if(key==='='){
        if(this.operator!==null&&this.stored!==null){
          this.display=this.format(this.compute(this.stored,Number(this.display),this.operator));
          this.stored=null;this.operator=null;this.fresh=true;
        }
      }
      return this.display;
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={SimpleCalculator};
  if(!root?.document)return;

  const doc=root.document;
  const el=id=>doc.getElementById(id);
  let ready=false,activeKey=null,open=false,tool='pen',color='#265b82';
  let strokes=[],currentStroke=null,canvas=null,context=null;
  const calculator=new SimpleCalculator();
  const buttonKeys=['AC','⌫','÷','×','7','8','9','−','4','5','6','+','1','2','3','=','±','0','.','π'];

  function drawStroke(stroke,width,height){
    const points=stroke.points;if(!points?.length)return;
    context.save();
    context.globalCompositeOperation=stroke.mode==='erase'?'destination-out':'source-over';
    context.strokeStyle=stroke.color;
    context.fillStyle=stroke.color;
    context.lineCap='round';context.lineJoin='round';
    context.lineWidth=stroke.mode==='erase'?24:stroke.mode==='pen'?3:2;
    context.beginPath();
    const first=points[0];
    context.moveTo(first.x*width,first.y*height);
    for(let i=1;i<points.length;i++)context.lineTo(points[i].x*width,points[i].y*height);
    if(points.length===1){
      context.arc(first.x*width,first.y*height,context.lineWidth/2,0,Math.PI*2);
      context.fill();
    }else context.stroke();
    context.restore();
  }
  function repaint(){
    if(!canvas||!context)return;
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const ratio=Math.min(3,root.devicePixelRatio||1);
    const w=Math.max(1,Math.round(rect.width*ratio));
    const h=Math.max(1,Math.round(rect.height*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    context.setTransform(ratio,0,0,ratio,0,0);
    context.clearRect(0,0,rect.width,rect.height);
    for(const stroke of strokes)drawStroke(stroke,rect.width,rect.height);
    if(currentStroke)drawStroke(currentStroke,rect.width,rect.height);
  }
  function point(e){
    const r=canvas.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/Math.max(1,r.width))),
      y:Math.max(0,Math.min(1,(e.clientY-r.top)/Math.max(1,r.height)))};
  }
  function pointerDown(e){
    if(e.button!==0 && e.pointerType!=='touch'&&e.pointerType!=='pen')return;
    e.preventDefault();
    currentStroke={mode:tool,color,points:[point(e)],pointerId:e.pointerId};
    try{canvas.setPointerCapture(e.pointerId);}catch{}
    repaint();
  }
  function pointerMove(e){
    if(!currentStroke||currentStroke.pointerId!==e.pointerId)return;
    e.preventDefault();currentStroke.points.push(point(e));repaint();
  }
  function pointerEnd(e){
    if(!currentStroke||currentStroke.pointerId!==e.pointerId)return;
    currentStroke.points.push(point(e));
    strokes.push(currentStroke);currentStroke=null;repaint();
  }
  function selectTool(next){
    tool=next;
    for(const btn of doc.querySelectorAll('[data-pad-tool]')){
      const selected=btn.dataset.padTool===tool;
      btn.classList.toggle('is-selected',selected);
      btn.setAttribute('aria-pressed',String(selected));
    }
  }
  function closePad(){
    if(!open)return;
    open=false;currentStroke=null;el('scratchpad-modal').hidden=true;
    el('scratchpad-open')?.focus?.();
  }
  function sync(key){
    if(key===activeKey)return;
    closePad();
    strokes=[];currentStroke=null;activeKey=key||null;
    calculator.clear();
    const d=el('scratchpad-calc-display');if(d)d.textContent=calculator.display;
  }
  function openPad(info){
    if(!ready)init();
    if(!ready||!info?.key||!info?.text)return;
    sync(info.key);
    el('scratchpad-question').textContent=info.text;
    el('scratchpad-diagram').innerHTML=info.diagramHtml||'';
    el('scratchpad-modal').hidden=false;
    open=true;
    root.requestAnimationFrame(repaint);
    el('scratchpad-close').focus();
  }
  function init(){
    if(ready)return;
    const modal=el('scratchpad-modal'),paint=el('scratchpad-canvas');
    if(!modal||!paint)return;
    canvas=paint;context=canvas.getContext('2d',{alpha:true});
    if(!context)return;
    ready=true;
    paint.addEventListener('pointerdown',pointerDown);
    paint.addEventListener('pointermove',pointerMove);
    paint.addEventListener('pointerup',pointerEnd);
    paint.addEventListener('pointercancel',pointerEnd);
    paint.addEventListener('lostpointercapture',pointerEnd);
    el('scratchpad-close').addEventListener('click',closePad);
    modal.addEventListener('click',event=>{if(event.target===modal)closePad();});
    doc.addEventListener('keydown',event=>{if(open&&event.key==='Escape'){event.preventDefault();closePad();}});
    for(const btn of doc.querySelectorAll('[data-pad-tool]'))
      btn.addEventListener('click',()=>selectTool(btn.dataset.padTool));
    for(const btn of doc.querySelectorAll('[data-pad-color]'))
      btn.addEventListener('click',()=>{
        color=btn.dataset.padColor;selectTool('pen');
        for(const item of doc.querySelectorAll('[data-pad-color]'))
          item.setAttribute('aria-pressed',String(item===btn));
      });
    el('scratchpad-undo').addEventListener('click',()=>{if(strokes.length)strokes.pop();repaint();});
    el('scratchpad-clear').addEventListener('click',()=>{
      if(strokes.length&&root.confirm('要清空這道題目的所有筆跡嗎？')){strokes=[];repaint();}
    });
    const grid=el('scratchpad-calculator');
    for(const key of buttonKeys){
      const btn=doc.createElement('button');
      btn.type='button';btn.className='scratchpad-calc-key';
      btn.textContent=key;btn.dataset.calcKey=key;
      btn.setAttribute('aria-label','計算機 '+key);
      if(key==='=')btn.classList.add('is-equal');
      if(['+','−','×','÷'].includes(key))btn.classList.add('is-operator');
      grid.appendChild(btn);
    }
    grid.addEventListener('click',event=>{
      const key=event.target.closest('[data-calc-key]')?.dataset.calcKey;
      if(key!==undefined)el('scratchpad-calc-display').textContent=calculator.press(key);
    });
    root.addEventListener('resize',()=>{if(open)repaint();});
    if(typeof root.ResizeObserver==='function')new root.ResizeObserver(()=>{if(open)repaint();}).observe(canvas);
    selectTool('pen');
  }
  root.CircleScratchpad={init,open:openPad,close:closePad,sync};
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(typeof window==='undefined'?null:window);
