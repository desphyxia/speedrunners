'use strict';
const STEP = 1 / 120;
const SUDDEN_DEATH_AT = 30;
const FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';

class Game {
  constructor() {
    this.input = new Input();
    this.audio = new Sfx();
    this.input.onActivity = () => this.audio.ensure();
    addEventListener('pointerdown', () => this.audio.ensure());
    addEventListener('keydown', e => { if (e.code === 'KeyM') this.audio.musicOn = !this.audio.musicOn; });

    this.state = 'lobby';
    this.slots = [null, null];
    this.target = 3;
    this.joinCd = 0;
    this.players = [];
    this.scores = [0, 0];
    this.particles = [];
    this.entities = [];
    this.shakeAmt = 0;
    this.realT = 0;
    this.camX = 0;
    this.timeScale = 1;
    this.acc = 0;
    this.level = new Level(1234);
    this.lobbyRunners = [new Player(0, null), new Player(1, null)];
    this.lobbyRunners.forEach(p => { p.onGround = true; p.vx = RUN; });
  }

  // ---------- helpers used by players ----------
  sfx(name) { if (this.audio[name]) this.audio[name](); }
  shake(n) { this.shakeAmt = Math.max(this.shakeAmt, n); }
  dust(x, y, n) {
    for (let i = 0; i < n; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 120, life: 0.4, max: 0.4, color: 'rgba(220,225,255,0.6)', size: 3 + Math.random() * 3, g: 200 });
  }
  sparks(x, y, color, n, spd = 300) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * spd;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, color, size: 2 + Math.random() * 3, g: 400 });
    }
  }
  get versus() { return this.players.length === 2; }

  findAnchor(p) {
    let best = null, bs = 1e9;
    for (const a of this.level.anchors) {
      const dx = a.x - p.cx, dy = a.y - p.cy;
      if (dx > HOOK_RANGE || dx < -HOOK_RANGE) continue;
      if (dy > -24 || dx * p.facing < -50) continue;
      const d = Math.hypot(dx, dy);
      if (d > HOOK_RANGE) continue;
      const s = d - dx * p.facing * 0.6;
      if (s < bs) { bs = s; best = a; }
    }
    return best;
  }

  rollItem(p) {
    if (!this.versus) return ['bolt', 'crate', 'turbo'][Math.floor(Math.random() * 3)];
    const ahead = p === this.leader;
    const w = ahead ? { crate: 5, bolt: 3, turbo: 2 } : { crate: 1, bolt: 5, turbo: 4 };
    let r = Math.random() * (w.crate + w.bolt + w.turbo);
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'turbo';
  }

  useItem(p) {
    const other = this.players.find(o => o !== p && o.alive) || null;
    if (p.item === 'bolt') {
      this.entities.push({ type: 'bolt', x: p.cx + p.facing * 10, y: p.cy - 4, ang: p.facing > 0 ? -0.3 : Math.PI + 0.3, spd: 540, owner: p, target: other, life: 3, age: 0, trail: [] });
      this.sfx('bolt');
    } else if (p.item === 'crate') {
      if (!this.placeCrate(p)) return; // keep the item if there was nowhere to drop it
    } else if (p.item === 'turbo') {
      p.turbo = 3; this.sfx('turbo');
      this.sparks(p.cx, p.cy, '#ffb238', 14);
    }
    p.item = null;
  }

  placeCrate(p) {
    const L = this.level, dir = -p.facing;
    const footRow = Math.floor((p.y + p.h - 1) / T);
    const blocked = (x, y) => this.players.some(o => o.alive && o.x < (x + 1) * T && o.x + o.w > x * T && o.y < (y + 1) * T && o.y + o.h > y * T);
    for (const off of [1, 2, 3]) {
      const cx = Math.floor((p.cx + dir * off * T) / T);
      let cy = footRow, k = 0;
      while (k < 12 && cy < ROWS - 1 && L.get(cx, cy + 1) === EMPTY) { cy++; k++; }
      if (cy >= ROWS - 1 || L.get(cx, cy) !== EMPTY || L.get(cx, cy + 1) === EMPTY || blocked(cx, cy)) continue;
      const tiles = [[cx, cy]];
      if (L.get(cx, cy - 1) === EMPTY && !blocked(cx, cy - 1)) tiles.push([cx, cy - 1]);
      for (const [x, y] of tiles) { L.set(x, y, CRATE); L.crates.push({ cx: x, cy: y, t: 12 }); }
      this.dust(cx * T + T / 2, (cy + 1) * T, 6);
      this.sfx('crate');
      return true;
    }
    return false;
  }

  breakCrate(c, r) {
    const L = this.level;
    if (L.get(c, r) !== CRATE) return;
    L.set(c, r, EMPTY);
    this.sparks(c * T + T / 2, r * T + T / 2, '#c98a4a', 10, 250);
    this.sfx('smash');
    this.breakCrate(c, r - 1);
    this.breakCrate(c, r + 1);
  }

  stunPlayer(p) {
    p.stun = 1.1; p.vx *= 0.25; p.vy = Math.min(p.vy, -250);
    p.releaseHook(); p.invuln = 1.8;
    this.sparks(p.cx, p.cy, '#fff36b', 24, 380);
    this.sfx('zap'); this.shake(7);
    this.input.rumble(p.src, 0.9, 0.9, 350);
  }

  // ---------- state flow ----------
  startMatch() {
    this.players = [];
    this.slots.forEach((s, i) => { if (s) this.players.push(new Player(i, s)); });
    this.scores = [0, 0];
    this.round = 0;
    this.startRound();
  }
  startRound() {
    this.round++;
    this.level = new Level((Math.random() * 1e9) | 0);
    this.entities = []; this.particles = [];
    this.time = 0; this.danger = 0; this.camX = 0; this.timeScale = 1; this.acc = 0;
    this.goT = 0; this.banner = null; this.leader = this.players[0];
    this.players.forEach(p => p.spawn(3 * T, FLOOR * T - STAND_H));
    this.level.ensure(VW * 3);
    this.state = 'countdown'; this.cd = 3; this.lastBeep = 4;
  }
  endRound() {
    const alive = this.players.filter(p => p.alive);
    if (alive.length === 1) {
      const w = alive[0];
      this.scores[w.idx]++;
      this.banner = { text: `${w.name} TAKES THE ROUND`, color: w.color };
    } else {
      this.banner = { text: 'DOUBLE KNOCKOUT', color: '#fff' };
    }
    this.state = 'roundEnd'; this.endT = 0; this.timeScale = 0.2;
  }
  eliminate(p) {
    p.alive = false; p.releaseHook();
    const x = clamp(p.cx, this.camX + 10, this.camX + VW), y = clamp(p.cy, 30, VH - 30);
    for (let i = 0; i < 3; i++) this.sparks(x, y, i ? p.color : '#fff', 30, 600);
    this.shake(14); this.sfx('elim');
    this.input.rumble(p.src, 1, 1, 600);
  }
  quitToLobby() { this.state = 'lobby'; this.players = []; this.camX = 0; this.level = new Level(1234); this.particles = []; this.entities = []; }

  // ---------- per-frame update ----------
  frame(dt) {
    this.input.poll();
    this.realT += dt;
    for (const id of this.input.sources()) if (id.startsWith('pad') && this.input.state(id).any) { this.audio.ensure(); break; }

    switch (this.state) {
      case 'lobby': this.updateLobby(dt); break;
      case 'countdown': case 'play': case 'roundEnd': this.updateRace(dt); break;
      case 'pause': this.updatePause(); break;
      case 'matchEnd': this.updateMatchEnd(dt); break;
    }
    this.audio.updateMusic(this.state !== 'pause');

    for (const pt of this.particles) { pt.life -= dt; pt.vy += pt.g * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; }
    this.particles = this.particles.filter(pt => pt.life > 0);
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
  }

  updateLobby(dt) {
    const I = this.input;
    this.joinCd -= dt;
    this.camX += 70 * dt;
    this.level.ensure(this.camX + VW * 2);
    this.slots = this.slots.map(s => s && I.connected(s) ? s : null);
    this.lobbyRunners.forEach(p => { p.runPhase += dt * 15; });
    for (const id of I.sources()) {
      const slot = this.slots.indexOf(id);
      if (slot < 0) {
        if ((I.pressed(id, 'jump') || I.pressed(id, 'start')) && this.joinCd <= 0) {
          const free = this.slots.indexOf(null);
          if (free >= 0) { this.slots[free] = id; this.joinCd = 0.35; this.sfx('pickup'); I.rumble(id, 0.5, 0.5, 150); }
        }
        continue;
      }
      if (I.pressed(id, 'back')) { this.slots[slot] = null; this.sfx('menu'); continue; }
      if (I.pressed(id, 'start')) { this.sfx('beep'); this.startMatch(); return; }
      if (I.pressed(id, 'left')) { this.target = Math.max(1, this.target - 1); this.sfx('menu'); }
      if (I.pressed(id, 'right')) { this.target = Math.min(9, this.target + 1); this.sfx('menu'); }
      if (I.pressed(id, 'item')) { this.audio.musicOn = !this.audio.musicOn; this.sfx('menu'); }
    }
  }

  updatePause() {
    const I = this.input;
    for (const p of this.players) {
      if (!I.connected(p.src)) continue;
      if (I.pressed(p.src, 'start')) { this.state = this.pausedFrom; this.sfx('menu'); return; }
      if (I.pressed(p.src, 'back')) { this.sfx('menu'); this.quitToLobby(); return; }
    }
  }

  updateMatchEnd(dt) {
    const I = this.input;
    this.endT += dt;
    this.updateCamera(dt);
    if (this.endT < 1) return;
    for (const p of this.players) {
      if (I.pressed(p.src, 'jump') || I.pressed(p.src, 'start')) { this.startMatch(); return; }
      if (I.pressed(p.src, 'back')) { this.quitToLobby(); return; }
    }
  }

  playerInput(p) {
    const I = this.input, s = I.state(p.src);
    return {
      x: s.x, down: s.down || s.slide, jump: s.jump, hook: s.hook, item: s.item,
      jumpP: I.pressed(p.src, 'jump'), hookP: I.pressed(p.src, 'hook'), itemP: I.pressed(p.src, 'item'),
    };
  }

  updateRace(dt) {
    const I = this.input;
    for (const p of this.players) {
      if (!I.connected(p.src) || (this.state !== 'roundEnd' && I.pressed(p.src, 'start'))) {
        this.pausedFrom = this.state; this.state = 'pause'; this.sfx('menu'); return;
      }
    }

    if (this.state === 'countdown') {
      this.cd -= dt;
      const n = Math.ceil(this.cd);
      if (n < this.lastBeep && n > 0) { this.lastBeep = n; this.sfx('beep'); }
      if (this.cd <= 0) { this.state = 'play'; this.goT = 0.9; this.audio.beep(true); }
    }
    if (this.goT > 0) this.goT -= dt;

    if (this.state === 'roundEnd') {
      this.endT += dt;
      this.timeScale = Math.min(1, 0.2 + this.endT * 0.8);
      if (this.endT > 2.6) {
        const winner = this.players.find(p => this.scores[p.idx] >= this.target);
        if (winner) { this.state = 'matchEnd'; this.winner = winner; this.endT = 0; this.sfx('win'); }
        else this.startRound();
        return;
      }
    }

    if (this.state !== 'countdown') {
      const inputs = this.players.map(p => this.playerInput(p));
      this.acc += dt * this.timeScale;
      let first = true, n = 0;
      while (this.acc >= STEP && n < 10) {
        this.step(STEP, inputs, first);
        first = false; this.acc -= STEP; n++;
      }
      if (n >= 10) this.acc = 0;
    }
    this.updateCamera(dt);

    for (const p of this.players) {
      if (!p.alive) continue;
      p.trail.unshift({ x: p.cx - p.facing * 3, y: p.y + (p.sliding ? 5 : 10) });
      if (p.trail.length > 8) p.trail.pop();
      if (Math.abs(p.vx) > 420 && Math.random() < 0.5)
        this.particles.push({ x: p.cx - Math.sign(p.vx) * 10, y: p.y + Math.random() * p.h, vx: -p.vx * 0.2, vy: 0, life: 0.25, max: 0.25, color: p.turbo > 0 ? '#ffb238' : 'rgba(255,255,255,0.5)', size: 2, g: 0, streak: true });
    }
  }

  step(dt, inputs, first) {
    const L = this.level;
    if (this.state === 'play' || this.state === 'roundEnd') this.time += dt;
    this.players.forEach((p, i) => {
      if (!p.alive) return;
      const inp = first ? inputs[i] : { ...inputs[i], jumpP: false, hookP: false, itemP: false };
      p.update(dt, inp, L, this);
      if (p.y > ROWS * T + 40) {
        const ch = L.chunkAt(p.cx), item = p.item;
        p.spawn(ch.x0 * T + 6, FLOOR * T - STAND_H);
        p.item = item; p.invuln = 1;
        this.sfx('land'); this.shake(4);
      }
    });

    // bolts
    for (const b of this.entities) {
      b.life -= dt; b.age += dt;
      const t = b.target;
      if (t && t.alive) {
        const want = Math.atan2(t.cy - b.y, t.cx - b.x);
        let da = want - b.ang;
        da = ((da + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        const turn = (3 + b.age * 5) * dt;
        b.ang += clamp(da, -turn, turn);
        if (Math.hypot(t.cx - b.x, t.cy - b.y) < 18 && t.invuln <= 0) { this.stunPlayer(t); b.life = 0; }
      }
      b.x += Math.cos(b.ang) * b.spd * dt;
      b.y += Math.sin(b.ang) * b.spd * dt;
      if (Math.random() < 0.5) b.trail.unshift({ x: b.x, y: b.y });
      if (b.trail.length > 10) b.trail.pop();
      if (b.life <= 0 && b.life > -1) { this.sparks(b.x, b.y, '#fff36b', 8, 200); b.life = -9; }
    }
    this.entities = this.entities.filter(b => b.life > -1);

    // item boxes
    for (const box of L.boxes) {
      if (box.x < this.camX - 200 || box.x > this.camX + VW + 200) continue;
      for (const p of this.players) {
        box.cd[p.idx] -= dt;
        if (!p.alive || p.item || box.cd[p.idx] > 0) continue;
        if (Math.abs(p.cx - box.x) < 20 && Math.abs(p.cy - box.y) < 28) {
          p.item = this.rollItem(p); box.cd[p.idx] = 4;
          this.sfx('pickup'); this.sparks(box.x, box.y, '#c77dff', 12, 250);
          this.input.rumble(p.src, 0.2, 0.4, 80);
        }
      }
    }

    // crates expire
    for (const c of L.crates) {
      c.t -= dt;
      if (c.t <= 0 && L.get(c.cx, c.cy) === CRATE) { L.set(c.cx, c.cy, EMPTY); this.dust(c.cx * T + T / 2, c.cy * T + T / 2, 4); }
    }
    L.crates = L.crates.filter(c => c.t > 0);

    // elimination
    if (this.versus && this.state === 'play') {
      if (this.time > SUDDEN_DEATH_AT) this.danger = Math.min(VW * 0.5, (this.time - SUDDEN_DEATH_AT) * 14);
      const kill = this.camX + this.danger;
      const dead = this.players.filter(p => p.alive && p.x + p.w < kill - 2);
      if (dead.length) { dead.forEach(p => this.eliminate(p)); this.endRound(); }
    }
  }

  updateCamera(dt) {
    const alive = this.players.filter(p => p.alive);
    if (!alive.length) return;
    const lead = alive.reduce((a, b) => (b.cx > a.cx + 1 ? b : a));
    this.leader = lead;
    const target = lead.cx - VW * 0.58;
    this.camX += (target - this.camX) * Math.min(1, dt * 6);
    this.camX = clamp(this.camX, lead.cx - VW + 120, lead.cx - 140);
    if (this.camX < 0) this.camX = 0;
    this.level.ensure(this.camX + VW * 2);
  }

  // ======================= RENDERING =======================
  render(ctx) {
    const t = this.realT;
    const L = this.level;
    this.drawBackground(ctx, this.camX, L.hue);
    ctx.save();
    const sx = (Math.random() - 0.5) * this.shakeAmt, sy = (Math.random() - 0.5) * this.shakeAmt;
    ctx.translate(Math.round(-this.camX + sx), VIEW_Y + sy);
    this.drawTiles(ctx, L, t);
    this.drawAnchors(ctx, L, t);
    this.drawBoxes(ctx, L, t);
    if (this.state !== 'lobby') {
      for (const p of this.players) if (p.alive) this.drawRope(ctx, p);
      for (const p of this.players) if (p.alive) this.drawRunner(ctx, p, t);
      if (this.versus && this.leader && this.leader.alive && this.state !== 'countdown') this.drawCrown(ctx, this.leader, t);
      this.drawBolts(ctx);
    }
    this.drawParticles(ctx);
    ctx.restore();

    if (this.state === 'lobby') { this.drawLobby(ctx, t); return; }
    this.drawDanger(ctx, t);
    this.drawHUD(ctx, t);
    if (this.state === 'countdown') this.bigText(ctx, String(Math.ceil(this.cd)), VW / 2, VH / 2, 120, '#fff', 1 - (Math.ceil(this.cd) - this.cd) * 0.5);
    if (this.goT > 0) this.bigText(ctx, 'GO!', VW / 2, VH / 2, 130, '#7dff9a', Math.min(1, this.goT * 2));
    if (this.state === 'roundEnd' && this.banner) this.drawBanner(ctx, this.banner.text, this.banner.color, Math.min(1, this.endT * 3));
    if (this.state === 'pause') this.drawPause(ctx);
    if (this.state === 'matchEnd') this.drawMatchEnd(ctx, t);
  }

  drawBackground(ctx, camX, hue) {
    const bh = (hue + 200) % 360;
    if (this._bgHue !== bh) {
      this._bgHue = bh;
      this._bg = ctx.createLinearGradient(0, 0, 0, VH);
      this._bg.addColorStop(0, `hsl(${bh},55%,7%)`);
      this._bg.addColorStop(0.7, `hsl(${(bh + 40) % 360},55%,17%)`);
      this._bg.addColorStop(1, `hsl(${(bh + 70) % 360},60%,24%)`);
    }
    ctx.fillStyle = this._bg; ctx.fillRect(0, 0, VW, VH);
    // stars
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 60; i++) {
      const x = ((hash(i) * 2000 - camX * 0.05) % VW + VW) % VW, y = hash(i + 99) * 260;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    const layers = [
      { p: 0.12, w: 70, min: 120, max: 300, col: `hsl(${bh},35%,12%)`, win: false },
      { p: 0.3, w: 110, min: 80, max: 240, col: `hsl(${bh},32%,16%)`, win: true },
    ];
    layers.forEach((ly, li) => {
      const off = camX * ly.p, i0 = Math.floor(off / ly.w) - 1, n = Math.ceil(VW / ly.w) + 2;
      for (let i = i0; i < i0 + n; i++) {
        const h = ly.min + hash(i * 7 + li * 1000) * (ly.max - ly.min), x = i * ly.w - off;
        ctx.fillStyle = ly.col;
        ctx.fillRect(x, VH - h, ly.w - 8, h);
        if (ly.win) {
          ctx.fillStyle = `hsla(${(bh + 160) % 360},90%,70%,0.25)`;
          for (let wy = VH - h + 12; wy < VH - 10; wy += 18)
            for (let wx = 8; wx < ly.w - 16; wx += 14)
              if (hash(i * 131 + wy * 7 + wx) < 0.3) ctx.fillRect(x + wx, wy, 6, 8);
        }
      }
    });
  }

  drawTiles(ctx, L, t) {
    const c0 = Math.max(0, Math.floor(this.camX / T) - 1), c1 = Math.min(L.cols.length - 1, Math.floor((this.camX + VW) / T) + 1);
    const h = L.hue;
    const base = `hsl(${h},24%,17%)`, alt = `hsl(${h},24%,19%)`, edge = `hsl(${h},90%,62%)`, side = `hsla(${h},80%,55%,0.55)`;
    for (let cx = c0; cx <= c1; cx++) {
      const col = L.cols[cx];
      for (let cy = 0; cy < ROWS; cy++) {
        const k = col[cy];
        if (k === EMPTY) continue;
        const x = cx * T, y = cy * T;
        if (k === CRATE) {
          ctx.fillStyle = '#8a5a2b'; ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
          ctx.strokeStyle = '#c98a4a'; ctx.lineWidth = 2; ctx.strokeRect(x + 3, y + 3, T - 6, T - 6);
          ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + T - 4, y + T - 4); ctx.moveTo(x + T - 4, y + 4); ctx.lineTo(x + 4, y + T - 4); ctx.stroke();
          continue;
        }
        ctx.fillStyle = (cx + cy) & 1 ? base : alt;
        ctx.fillRect(x, y, T, T);
        const up = L.get(cx, cy - 1) === EMPTY, dn = L.get(cx, cy + 1) === EMPTY && cy < ROWS - 1;
        const lf = L.get(cx - 1, cy) === EMPTY, rt = L.get(cx + 1, cy) === EMPTY;
        if (up) { ctx.fillStyle = edge; ctx.fillRect(x, y, T, 3); }
        ctx.fillStyle = side;
        if (lf) ctx.fillRect(x, y, 2, T);
        if (rt) ctx.fillRect(x + T - 2, y, 2, T);
        if (dn) ctx.fillRect(x, y + T - 2, T, 2);
        if (k === BOOST) {
          ctx.fillStyle = '#ffe14d'; ctx.fillRect(x, y, T, 4);
          ctx.fillStyle = `rgba(255,225,77,${0.5 + 0.5 * Math.sin(t * 10)})`;
          for (let i = 0; i < 2; i++) {
            const ox = x + 4 + i * 9;
            ctx.beginPath(); ctx.moveTo(ox, y - 12); ctx.lineTo(ox + 6, y - 7); ctx.lineTo(ox, y - 2); ctx.lineTo(ox + 3, y - 7); ctx.closePath(); ctx.fill();
          }
        }
      }
    }
  }

  drawAnchors(ctx, L, t) {
    for (const a of L.anchors) {
      if (a.x < this.camX - 30 || a.x > this.camX + VW + 30) continue;
      const aimed = this.players.find(p => p.alive && p.aim === a);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath(); ctx.arc(a.x, a.y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = aimed ? aimed.color : '#dfe6ff';
      ctx.beginPath(); ctx.arc(a.x, a.y, aimed ? 8 + Math.sin(t * 14) * 1.5 : 7, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = aimed ? aimed.color : '#9aa6d6';
      ctx.beginPath(); ctx.arc(a.x, a.y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawBoxes(ctx, L, t) {
    for (const b of L.boxes) {
      if (b.x < this.camX - 30 || b.x > this.camX + VW + 30) continue;
      const ready = this.state === 'lobby' || this.players.some(p => p.alive && b.cd[p.idx] <= 0);
      const y = b.y + Math.sin(t * 3 + b.x) * 3;
      ctx.save(); ctx.translate(b.x, y);
      ctx.globalAlpha = ready ? 1 : 0.2;
      ctx.rotate(Math.sin(t * 2 + b.x) * 0.2);
      ctx.fillStyle = '#7b2cbf'; ctx.fillRect(-10, -10, 20, 20);
      ctx.strokeStyle = '#e0aaff'; ctx.lineWidth = 2; ctx.strokeRect(-10, -10, 20, 20);
      ctx.fillStyle = '#fff'; ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, 1);
      ctx.restore();
    }
  }

  drawRope(ctx, p) {
    if (p.hook) {
      ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.cx, p.cy - 4); ctx.lineTo(p.hook.x, p.hook.y); ctx.stroke();
    } else if (p.missT > 0) {
      ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.globalAlpha = p.missT / 0.15;
      ctx.beginPath(); ctx.moveTo(p.cx, p.cy - 4); ctx.lineTo(p.cx + p.facing * 50, p.cy - 60); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawRunner(ctx, p, t) {
    // scarf trail
    if (p.trail.length > 1) {
      ctx.lineCap = 'round';
      for (let i = 1; i < p.trail.length; i++) {
        ctx.strokeStyle = p.color2; ctx.globalAlpha = 1 - i / p.trail.length;
        ctx.lineWidth = 5 - i * 0.4;
        ctx.beginPath(); ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y); ctx.lineTo(p.trail[i].x, p.trail[i].y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(p.cx, p.y + p.h);
    ctx.scale(p.facing, 1);
    if (p.invuln > 0 && p.stun <= 0 && Math.floor(t * 14) % 2) ctx.globalAlpha = 0.45;
    if (p.turbo > 0) { ctx.shadowColor = '#ffb238'; ctx.shadowBlur = 14; }
    const dark = '#141826';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (p.sliding) {
      ctx.strokeStyle = p.color2; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(2, -6); ctx.lineTo(10, -4); ctx.lineTo(16, -2); ctx.stroke();
      ctx.fillStyle = p.color; this.rrect(ctx, -10, -13, 16, 9, 4);
      ctx.beginPath(); ctx.arc(-11, -12, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark; ctx.fillRect(-12, -17, 6, 4);
      ctx.strokeStyle = p.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(-14, -2); ctx.stroke();
    } else {
      const sp = p.onGround ? Math.min(1, Math.abs(p.vx) / RUN) : 0;
      const lean = p.onGround ? sp * 0.22 : clamp(p.vx * p.facing / 1800, -0.15, 0.25);
      ctx.translate(0, -14); ctx.rotate(lean);
      let feet, hands;
      if (p.hook) {
        feet = [[-2, 13], [4, 11]]; hands = [[3, -24], [-2, -22]];
      } else if (!p.onGround) {
        if (p.wall) { feet = [[5, 12], [-1, 14]]; hands = [[6, -18], [-6, -10]]; }
        else if (p.vy < 0) { feet = [[6, 8], [-4, 13]]; hands = [[8, -16], [-8, -14]]; }
        else { feet = [[7, 11], [-3, 9]]; hands = [[-7, -20], [7, -19]]; }
      } else if (sp > 0.05) {
        const ph = p.runPhase;
        feet = [0, Math.PI].map(o => [Math.sin(ph + o) * 10 * sp, 14 - Math.max(0, Math.cos(ph + o)) * 6 * sp]);
        hands = [0, Math.PI].map(o => [-Math.sin(ph + o) * 8 * sp, -5 + Math.abs(Math.sin(ph + o)) * -2]);
      } else {
        const br = Math.sin(t * 3) * 0.6;
        feet = [[-3, 14], [3, 14]]; hands = [[-4, -3 + br], [4, -3 + br]];
      }
      const limb = (sx, sy, ex, ey, bend, color, w) => {
        const mx = (sx + ex) / 2 + bend, my = (sy + ey) / 2;
        ctx.strokeStyle = color; ctx.lineWidth = w;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(mx, my); ctx.lineTo(ex, ey); ctx.stroke();
      };
      limb(0, 0, feet[1][0], feet[1][1], 3, p.color2, 4);
      limb(0, -12, hands[1][0], hands[1][1], -2, p.color2, 3);
      ctx.fillStyle = p.color; this.rrect(ctx, -5, -16, 10, 18, 4);
      limb(0, 0, feet[0][0], feet[0][1], 3, dark, 4.5);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(1, -22, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark; ctx.fillRect(2, -25, 6, 4);
      ctx.fillStyle = '#fff'; ctx.fillRect(5, -24, 2, 1.5);
      limb(0, -12, hands[0][0], hands[0][1], -2, p.color, 3);
    }
    ctx.restore();
    if (p.stun > 0) {
      for (let i = 0; i < 3; i++) {
        const a = t * 8 + i * 2.1;
        ctx.fillStyle = '#fff36b';
        ctx.fillRect(p.cx + Math.cos(a) * 12 - 2, p.y - 10 + Math.sin(a) * 4 - 2, 4, 4);
      }
    }
  }

  drawCrown(ctx, p, t) {
    const x = p.cx, y = p.y - 16 + Math.sin(t * 5) * 1.5;
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(x - 8, y); ctx.lineTo(x - 8, y - 8); ctx.lineTo(x - 4, y - 4); ctx.lineTo(x, y - 10);
    ctx.lineTo(x + 4, y - 4); ctx.lineTo(x + 8, y - 8); ctx.lineTo(x + 8, y); ctx.closePath(); ctx.fill();
  }

  drawBolts(ctx) {
    for (const b of this.entities) {
      ctx.strokeStyle = 'rgba(255,243,107,0.5)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x, b.y);
      for (const p of b.trail) ctx.lineTo(p.x + (Math.random() - 0.5) * 6, p.y + (Math.random() - 0.5) * 6);
      ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff36b'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      if (p.streak) ctx.fillRect(p.x, p.y, 18, 1.5);
      else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  drawDanger(ctx, t) {
    if (!this.versus) return;
    const g = ctx.createLinearGradient(0, 0, 50, 0);
    g.addColorStop(0, 'rgba(255,40,80,0.35)'); g.addColorStop(1, 'rgba(255,40,80,0)');
    ctx.fillStyle = g; ctx.fillRect(this.danger, 0, 50, VH);
    if (this.danger > 0) {
      ctx.fillStyle = 'rgba(120,0,30,0.55)'; ctx.fillRect(0, 0, this.danger, VH);
      ctx.fillStyle = `rgba(255,60,90,${0.7 + 0.3 * Math.sin(t * 12)})`; ctx.fillRect(this.danger - 3, 0, 3, VH);
    }
    for (const p of this.players) {
      if (!p.alive) continue;
      const sx = p.x - this.camX - this.danger;
      if (sx < 140 && this.state === 'play') {
        const a = (1 - sx / 140) * (0.6 + 0.4 * Math.sin(t * 18));
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.fillStyle = p.color;
        const y = p.cy + VIEW_Y, x = this.danger + 8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 16, y - 12); ctx.lineTo(x + 16, y + 12); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  drawHUD(ctx, t) {
    ctx.textBaseline = 'middle';
    this.players.forEach((p, i) => {
      const right = p.idx === 1;
      const x = right ? VW - 16 : 16, al = right ? 'right' : 'left', dir = right ? -1 : 1;
      ctx.fillStyle = 'rgba(8,10,20,0.6)';
      ctx.fillRect(right ? VW - 250 : 0, 0, 250, 52);
      ctx.fillStyle = p.color; ctx.textAlign = al; ctx.font = `900 20px ${FONT}`;
      ctx.fillText(p.name, x, 17);
      if (this.versus) {
        for (let k = 0; k < this.target; k++) {
          const px = x + dir * (8 + k * 18);
          ctx.fillStyle = k < this.scores[p.idx] ? p.color : 'rgba(255,255,255,0.15)';
          ctx.fillRect(px - 6, 34, 12, 10);
        }
      }
      const ix = x + dir * 200;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.strokeRect(ix - 18, 8, 36, 36);
      if (p.item) this.drawItemIcon(ctx, p.item, ix, 26, t);
      if (p.turbo > 0) { ctx.fillStyle = '#ffb238'; ctx.fillRect(ix - 18, 46, 36 * (p.turbo / 3), 3); }
    });
    ctx.textAlign = 'center';
    if (this.versus) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.font = `700 14px ${FONT}`;
      ctx.fillText(`ROUND ${this.round}  ·  FIRST TO ${this.target}`, VW / 2, 14);
      if (this.danger > 0 && this.state === 'play') {
        ctx.fillStyle = `rgba(255,70,100,${0.6 + 0.4 * Math.sin(t * 8)})`; ctx.font = `900 22px ${FONT}`;
        ctx.fillText('SUDDEN DEATH', VW / 2, 38);
      }
    } else {
      const p = this.players[0];
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = `800 16px ${FONT}`;
      ctx.fillText(`PRACTICE  ·  ${Math.floor(p.cx / 32)} m  ·  ${this.time.toFixed(1)} s`, VW / 2, 18);
    }
  }

  drawItemIcon(ctx, item, x, y, t) {
    ctx.save(); ctx.translate(x, y);
    if (item === 'bolt') {
      ctx.fillStyle = '#fff36b'; ctx.shadowColor = '#fff36b'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(3, -13); ctx.lineTo(-7, 2); ctx.lineTo(0, 2); ctx.lineTo(-3, 13); ctx.lineTo(7, -3); ctx.lineTo(0, -3); ctx.closePath(); ctx.fill();
    } else if (item === 'crate') {
      ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-11, -11, 22, 22);
      ctx.strokeStyle = '#c98a4a'; ctx.lineWidth = 2; ctx.strokeRect(-9, -9, 18, 18);
      ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke();
    } else if (item === 'turbo') {
      ctx.fillStyle = '#ffb238';
      for (let i = 0; i < 2; i++) {
        const ox = -8 + i * 8;
        ctx.beginPath(); ctx.moveTo(ox, -10); ctx.lineTo(ox + 9, 0); ctx.lineTo(ox, 10); ctx.lineTo(ox + 3, 0); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }

  drawLobby(ctx, t) {
    const I = this.input;
    ctx.fillStyle = 'rgba(5,6,15,0.55)'; ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = '#36e2ff'; ctx.shadowBlur = 24;
    ctx.font = `italic 900 76px ${FONT}`;
    ctx.fillStyle = '#fff';
    ctx.fillText('DASH DUEL', VW / 2, 82);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `600 17px ${FONT}`;
    ctx.fillText('Race your rival. Leave them behind. Knock them off the screen.', VW / 2, 132);

    for (let i = 0; i < 2; i++) {
      const cx = VW / 2 + (i ? 170 : -170), cy = 260, s = this.slots[i];
      const r = this.lobbyRunners[i];
      ctx.fillStyle = s ? 'rgba(20,24,44,0.85)' : 'rgba(20,24,44,0.5)';
      ctx.fillRect(cx - 140, cy - 95, 280, 190);
      ctx.strokeStyle = s ? r.color : 'rgba(255,255,255,0.15)'; ctx.lineWidth = 3;
      ctx.strokeRect(cx - 140, cy - 95, 280, 190);
      ctx.save();
      ctx.translate(cx - 60, cy + 30); ctx.scale(2.6, 2.6);
      if (!s) ctx.globalAlpha = 0.3;
      r.x = -r.w / 2; r.y = -r.h; r.vx = s ? RUN : 0;
      this.drawRunner(ctx, r, t);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.fillStyle = s ? r.color : 'rgba(255,255,255,0.4)'; ctx.font = `italic 900 30px ${FONT}`;
      ctx.fillText(r.name, cx - 20, cy - 45);
      ctx.font = `600 13px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      if (s) {
        ctx.fillText(I.label(s), cx - 20, cy - 15);
        ctx.fillStyle = '#7dff9a'; ctx.font = `800 16px ${FONT}`; ctx.fillText('READY', cx - 20, cy + 15);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `600 12px ${FONT}`; ctx.fillText('○ to leave', cx - 20, cy + 45);
      } else {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4);
        ctx.fillStyle = '#fff'; ctx.font = `800 16px ${FONT}`;
        ctx.fillText('Press ✕ to join', cx - 20, cy + 5);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'center';
    }

    const n = this.slots.filter(Boolean).length;
    ctx.font = `800 20px ${FONT}`; ctx.fillStyle = '#fff';
    ctx.fillText(`First to  ◀ ${this.target} ▶  points`, VW / 2, 392);
    if (n) {
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 5);
      ctx.fillStyle = '#7dff9a'; ctx.font = `900 24px ${FONT}`;
      ctx.fillText(n === 2 ? 'Press OPTIONS to start!' : 'Press OPTIONS for solo practice  ·  waiting for player 2', VW / 2, 430);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `600 14px ${FONT}`;
    ctx.fillText('✕ Jump / wall-jump    R1 Grapple (hold)    ↓ or ○ Slide    □ Use item    OPTIONS Pause', VW / 2, 488);
    ctx.fillText(`□ toggle music (${this.audio.musicOn ? 'on' : 'off'})    ·    Keyboard: WASD+Space/F/G  or  Arrows+K/L/J, Enter`, VW / 2, 512);
  }

  drawBanner(ctx, text, color, a) {
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(5,6,15,0.7)'; ctx.fillRect(0, VH / 2 - 50, VW, 100);
    ctx.globalAlpha = 1;
    this.bigText(ctx, text, VW / 2 + (1 - a) * 200, VH / 2, 48, color, a);
  }

  drawPause(ctx) {
    ctx.fillStyle = 'rgba(5,6,15,0.75)'; ctx.fillRect(0, 0, VW, VH);
    this.bigText(ctx, 'PAUSED', VW / 2, VH / 2 - 40, 64, '#fff', 1);
    const dc = this.players.find(p => !this.input.connected(p.src));
    ctx.font = `700 20px ${FONT}`; ctx.fillStyle = dc ? '#ff6b8a' : 'rgba(255,255,255,0.8)';
    ctx.fillText(dc ? `${dc.name}'s controller disconnected - reconnect it` : 'OPTIONS resume    ○ quit to lobby', VW / 2, VH / 2 + 30);
  }

  drawMatchEnd(ctx, t) {
    const w = this.winner;
    ctx.fillStyle = 'rgba(5,6,15,0.75)'; ctx.fillRect(0, 0, VW, VH);
    ctx.save(); ctx.shadowColor = w.color; ctx.shadowBlur = 30;
    this.bigText(ctx, `${w.name} WINS!`, VW / 2, VH / 2 - 60, 84, w.color, 1);
    ctx.restore();
    ctx.font = `900 40px ${FONT}`; ctx.textAlign = 'center';
    const [a, b] = this.players;
    ctx.fillStyle = a.color; ctx.fillText(String(this.scores[a.idx]), VW / 2 - 50, VH / 2 + 20);
    ctx.fillStyle = '#fff'; ctx.fillText('-', VW / 2, VH / 2 + 20);
    ctx.fillStyle = b.color; ctx.fillText(String(this.scores[b.idx]), VW / 2 + 50, VH / 2 + 20);
    if (this.endT > 1) {
      ctx.font = `700 20px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText('✕ Rematch    ○ Back to lobby', VW / 2, VH / 2 + 90);
    }
  }

  bigText(ctx, text, x, y, size, color, alpha) {
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `italic 900 ${size}px ${FONT}`;
    ctx.lineWidth = size / 10; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }

  rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
  }
}
