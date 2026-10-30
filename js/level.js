'use strict';
// Endless procedural race track, built from hand-designed chunk templates.
// Every chunk starts and ends with floor at row FLOOR, so they can be chained in any order.
class Level {
  constructor(seed) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.cols = [];
    this.anchors = [];
    this.boxes = [];
    this.chunks = [];
    this.crates = [];
    this.hue = Math.floor(this.rng() * 360);
    this.last = null;
    this.count = 0;
    // start area
    this.floor(0, 27);
    this.box(20, FLOOR - 2);
    this.chunks.push({ x0: 0, x1: 27, type: 'start' });
  }
  r(n) { return Math.floor(this.rng() * n); }
  col(cx) {
    while (this.cols.length <= cx) { const c = new Uint8Array(ROWS); c[0] = SOLID; this.cols.push(c); }
    return this.cols[cx];
  }
  get(cx, cy) {
    if (cx < 0 || cy < 0) return SOLID;
    if (cy >= ROWS) return EMPTY;
    const c = this.cols[cx];
    return c ? c[cy] : SOLID;
  }
  set(cx, cy, t) { if (cy >= 0 && cy < ROWS) this.col(cx)[cy] = t; }
  fill(x0, y0, x1, y1, t = SOLID) { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) this.set(x, y, t); }
  floor(x0, x1, top = FLOOR) { this.fill(x0, top, x1, ROWS - 1, SOLID); }
  anchor(cx, cy) { this.anchors.push({ x: cx * T + T / 2, y: cy * T + T / 2 }); }
  box(cx, cy) { this.boxes.push({ x: cx * T + T / 2, y: cy * T + T / 2, cd: [0, 0] }); }
  width() { return this.cols.length * T; }

  ensure(px) { while (this.width() < px) this.genChunk(); }

  chunkAt(px) {
    const cx = Math.floor(px / T);
    for (let i = this.chunks.length - 1; i >= 0; i--) if (this.chunks[i].x0 <= cx) return this.chunks[i];
    return this.chunks[0];
  }

  genChunk() {
    const easy = this.count < 2;
    const table = easy
      ? [['flat', 3], ['gap', 3], ['stairs', 2], ['barrier', 2]]
      : [['flat', 2], ['gap', 3], ['grapple', 4], ['hop', 3], ['chimney', 2], ['tunnel', 2],
         ['stairs', 2], ['boostJump', 2], ['barrier', 2], ['ceilingSwing', 2]];
    let type;
    do {
      let total = table.reduce((s, e) => s + e[1], 0), roll = this.rng() * total;
      for (const [name, w] of table) { roll -= w; if (roll <= 0) { type = name; break; } }
      type = type || table[0][0];
    } while (type === this.last && type !== 'gap');
    this.last = type;
    const x0 = this.cols.length;
    const w = this[type](x0);
    this.col(x0 + w - 1);
    this.chunks.push({ x0, x1: x0 + w - 1, type });
    this.count++;
  }

  // ---- chunk templates (each returns its width in tiles) ----
  flat(x0) {
    const w = 10 + this.r(8);
    this.floor(x0, x0 + w - 1);
    const o = this.r(3);
    if (o === 1) this.fill(x0 + 6, FLOOR - 1, x0 + 6, FLOOR - 1);
    else if (o === 2) this.fill(x0 + 6, FLOOR - 2, x0 + 7, FLOOR - 1);
    if (this.rng() < 0.6) this.box(x0 + 3, FLOOR - 2);
    if (this.rng() < 0.35) this.set(x0 + w - 2, FLOOR, BOOST);
    return w;
  }
  gap(x0) {
    const g = 3 + this.r(3);
    this.floor(x0, x0 + 2);
    this.floor(x0 + 3 + g, x0 + 5 + g);
    return g + 6;
  }
  grapple(x0) {
    const g = 9 + this.r(5);
    this.floor(x0, x0 + 1);
    this.floor(x0 + 2 + g, x0 + 4 + g);
    if (g <= 10) this.anchor(x0 + 2 + Math.floor(g / 2), 8);
    else { this.anchor(x0 + 2 + Math.floor(g / 3), 8); this.anchor(x0 + 2 + Math.floor(g * 2 / 3), 8); }
    return g + 5;
  }
  hop(x0) {
    this.floor(x0, x0 + 1);
    let x = x0 + 2, row = 16;
    const n = 3 + this.r(2);
    for (let i = 0; i < n; i++) {
      x += 2 + this.r(2);
      row = clamp(row + this.r(3) - 1, 14, 16);
      this.fill(x, row, x + 3, row);
      if (i === 1 && this.rng() < 0.6) this.box(x + 2, row - 2);
      x += 4;
    }
    x += 2 + this.r(2);
    this.floor(x, x + 2);
    return x + 3 - x0;
  }
  chimney(x0) {
    this.floor(x0, x0 + 19);
    this.fill(x0 + 4, 1, x0 + 5, 14);          // hanging wall from the ceiling
    this.fill(x0 + 9, 10, x0 + 14, FLOOR - 1); // tall step: wall-jump between the two
    this.box(x0 + 12, 8);
    return 20;
  }
  tunnel(x0) {
    this.floor(x0, x0 + 15);
    this.set(x0 + 2, FLOOR, BOOST);
    this.fill(x0 + 5, 1, x0 + 11, FLOOR - 2);  // only a 1-tile gap: slide through
    return 16;
  }
  stairs(x0) {
    this.floor(x0, x0 + 17);
    this.fill(x0 + 2, 16, x0 + 4, 17);
    this.fill(x0 + 5, 14, x0 + 7, 17);
    this.fill(x0 + 8, 12, x0 + 11, 17);
    this.fill(x0 + 12, 15, x0 + 14, 17);
    if (this.rng() < 0.7) this.box(x0 + 10, 10);
    return 18;
  }
  boostJump(x0) {
    this.floor(x0, x0 + 7);
    this.set(x0 + 3, FLOOR, BOOST);
    this.set(x0 + 5, FLOOR, BOOST);
    const g = 7 + this.r(2);
    this.floor(x0 + 8 + g, x0 + 11 + g);
    return 12 + g;
  }
  barrier(x0) {
    this.floor(x0, x0 + 13);
    this.fill(x0 + 7, 15, x0 + 8, 17);
    if (this.rng() < 0.5) this.box(x0 + 11, FLOOR - 2);
    return 14;
  }
  ceilingSwing(x0) {
    // long pit with a low ceiling and a chain of anchors
    const g = 16 + this.r(4);
    this.floor(x0, x0 + 1);
    this.fill(x0 + 3, 1, x0 + g, 4);
    for (let a = x0 + 5; a <= x0 + g - 2; a += 5) this.anchor(a, 7);
    this.fill(x0 + 8, 13, x0 + 10, 13); // rest platform
    this.floor(x0 + 2 + g, x0 + 4 + g);
    return g + 5;
  }
}
