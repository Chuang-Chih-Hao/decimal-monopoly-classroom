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
  for(const src of ['/board-layout.js','/player-colors.js','/app.js'])assert.ok(index.includes(`src="${src}"`));
  for(const id of ['map-overview','map-zoom-in','map-zoom-out','map-zoom-label','map-fullsize','board-wrapper','my-assets-panel']) assert.ok(index.includes(`id="${id}"`),id);
  assert.ok(app.includes('focusKey=state.currentPlayerId'), '應在換人時才自動聚焦');
  assert.ok(app.includes('function renderMyAssets()'));
  assert.ok(app.includes('function setMapZoom('));
  assert.ok(app.includes('function focusMapTile('));
  assert.ok(app.includes('房產總值'));
});
