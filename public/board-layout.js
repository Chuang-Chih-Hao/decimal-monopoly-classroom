/* 32 格傳統大富翁棋盤：11 欄 × 7 列，順時針沿外圈前進。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DecimalBoardLayout = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const COLUMNS = 11;
  const ROWS = 7;
  const CELL = 118;
  const COUNT = 2 * (COLUMNS + ROWS) - 4;
  function positionFor(index) {
    if (!Number.isInteger(index) || index < 0 || index >= COUNT) throw new RangeError('格子編號必須介於 0 到 31');
    if (index < COLUMNS) return { col: COLUMNS - 1 - index, row: ROWS - 1 };
    index -= COLUMNS;
    if (index < ROWS - 1) return { col: 0, row: ROWS - 2 - index };
    index -= ROWS - 1;
    if (index < COLUMNS - 1) return { col: index + 1, row: 0 };
    index -= COLUMNS - 1;
    return { col: COLUMNS - 1, row: index + 1 };
  }
  return Object.freeze({ COLUMNS, ROWS, CELL, COUNT, WIDTH: COLUMNS * CELL, HEIGHT: ROWS * CELL, positionFor });
});
