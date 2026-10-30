'use strict';
// World constants (virtual resolution 960x540, scaled to the screen)
const T = 24;          // tile size in px
const ROWS = 22;       // level height in tiles
const FLOOR = 18;      // default floor row
const VW = 960, VH = 540;
const VIEW_Y = (VH - ROWS * T) / 2;

// Tile types
const EMPTY = 0, SOLID = 1, BOOST = 2, CRATE = 3;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash(n) {
  n = Math.imul((n | 0) ^ 0x27d4eb2d, 0x165667b1);
  n ^= n >>> 15; n = Math.imul(n, 0x85ebca6b); n ^= n >>> 13;
  return (n >>> 0) / 4294967296;
}
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
