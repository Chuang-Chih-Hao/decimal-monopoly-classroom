'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SimpleCalculator}=require('../public/scratchpad.js');
test('v2.2.0 計算紙的簡易計算機支援小數、四則運算與圓周率 3.14',()=>{
  const calc=new SimpleCalculator();
  assert.equal(calc.display,'0');
  for(const key of ['1','2','.','5','×','π','='])calc.press(key);
  assert.equal(calc.display,'39.25');
  calc.press('AC');
  for(const key of ['9','−','4','='])calc.press(key);
  assert.equal(calc.display,'5');
  calc.press('AC');
  for(const key of ['8','÷','2','='])calc.press(key);
  assert.equal(calc.display,'4');
  calc.press('AC');
  for(const key of ['4','+','5','='])calc.press(key);
  assert.equal(calc.display,'9');
});
test('v2.2.0 計算機除以零需顯示錯誤，恢復後可重新計算',()=>{
  const calc=new SimpleCalculator();
  for(const key of ['8','÷','0','='])calc.press(key);
  assert.equal(calc.display,'錯誤');
  calc.press('2');assert.equal(calc.display,'2');
  calc.press('AC');assert.equal(calc.display,'0');
  calc.press('9');calc.press('±');assert.equal(calc.display,'-9');
  calc.press('⌫');assert.equal(calc.display,'0');
  calc.press('AC');assert.equal(calc.display,'0');
});
test('v2.2.0 計算機支援連續運算、小數四捨五入與操作後的狀態清除',()=>{
  const calc=new SimpleCalculator();
  for(const key of ['3','+','2','×','4','='])calc.press(key);
  assert.equal(calc.display,'20');
  calc.press('AC');for(const key of ['1','÷','3','='])calc.press(key);
  assert.equal(calc.display,'0.333333');
  calc.press('5');assert.equal(calc.display,'5');
});
