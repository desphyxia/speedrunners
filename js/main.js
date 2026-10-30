'use strict';
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const game = new Game();
let scale = 1, ox = 0, oy = 0;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  scale = Math.min(canvas.width / VW, canvas.height / VH);
  ox = (canvas.width - VW * scale) / 2;
  oy = (canvas.height - VH * scale) / 2;
}
addEventListener('resize', resize);
resize();

addEventListener('dblclick', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  else document.exitFullscreen();
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.frame(dt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, ox, oy);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();
  game.render(ctx);
  ctx.restore();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
