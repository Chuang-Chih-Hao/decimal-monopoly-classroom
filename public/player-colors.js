/* 固定動物色：不同裝置、重新連線及遊戲重開時，角色與資產顏色一致。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DecimalPlayerColors = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const COLORS = Object.freeze({
    capybara: Object.freeze({ hex: '#98613A', light: '#F4E5D8', name: '咖啡色' }),
    '🐈': Object.freeze({ hex: '#8A52B3', light: '#EFE3F6', name: '紫色' }),
    '🐕': Object.freeze({ hex: '#2171C1', light: '#E0EDFC', name: '藍色' }),
    '🐰': Object.freeze({ hex: '#CA4E85', light: '#F9E0EB', name: '桃紅色' }),
    '🦊': Object.freeze({ hex: '#D66A22', light: '#FCE9D7', name: '橘色' }),
    '🐼': Object.freeze({ hex: '#3E525F', light: '#E3EBEF', name: '深灰色' }),
    '🐸': Object.freeze({ hex: '#20835F', light: '#DFF5E9', name: '綠色' }),
    '🐧': Object.freeze({ hex: '#167E90', light: '#D9F3F6', name: '青色' }),
    '🦁': Object.freeze({ hex: '#A37405', light: '#F9EEC6', name: '金黃色' }),
    '🐢': Object.freeze({ hex: '#734F36', light: '#EDE3D9', name: '深棕色' }),
    '🐹': Object.freeze({ hex: '#C14C39', light: '#F9E4DD', name: '紅色' }),
    '🦉': Object.freeze({ hex: '#5658AD', light: '#E7E8FC', name: '靛色' }),
  });
  function forAnimal(animal) { return COLORS[animal] || Object.freeze({ hex: '#586B78', light: '#EFF2F4', name: '灰色' }); }
  return Object.freeze({ COLORS, forAnimal });
});
