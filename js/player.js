'use strict';
const RUN = 330, JUMP_V = 640, WJ_X = 370, WJ_Y = 600;
const PW = 14, STAND_H = 34, SLIDE_H = 18, CRAWL = 110;
const HOOK_RANGE = 280, ROPE_MIN = 56, BOOST_V = 640;
const G_HOLD = 1900, G_FALL = 3000, MAX_FALL = 950;

const CHARACTERS = [
  { name: 'VOLT', color: '#36e2ff', color2: '#1f6bff' },
  { name: 'EMBER', color: '#ff9a2e', color2: '#ff2d6a' },
];

class Player {
  constructor(idx, src) {
    const d = CHARACTERS[idx];
    this.idx = idx; this.src = src;
    this.name = d.name; this.color = d.color; this.color2 = d.color2;
    this.w = PW;
    this.spawn(0, 0);
  }
  spawn(x, y) {
    this.x = x; this.y = y; this.h = STAND_H; this.vx = 0; this.vy = 0;
    this.onGround = false; this.sliding = false; this.hook = null; this.ropeLen = 0; this.aim = null;
    this.stun = 0; this.turbo = 0; this.invuln = 0; this.coyote = 0; this.jumpBuf = 0;
    this.wall = 0; this.facing = 1; this.alive = true; this.runPhase = 0; this.trail = [];
    this.item = null; this.missT = 0;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  hits(level, x, y, w, h) {
    const x0 = Math.floor(x / T), x1 = Math.floor((x + w - 0.01) / T);
    const y0 = Math.floor(y / T), y1 = Math.floor((y + h - 0.01) / T);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++)
        if (level.get(cx, cy) !== EMPTY) return true;
    return false;
  }
  tryStand(level) {
    if (!this.sliding) return true;
    const ny = this.y - (STAND_H - SLIDE_H);
    if (this.hits(level, this.x, ny, this.w, STAND_H)) return false;
    this.y = ny; this.h = STAND_H; this.sliding = false;
    return true;
  }
  wallContact(level) {
    if (this.hits(level, this.x + this.w, this.y + 4, 2, this.h - 8)) return 1;
    if (this.hits(level, this.x - 2, this.y + 4, 2, this.h - 8)) return -1;
    return 0;
  }
  releaseHook() {
    if (!this.hook) return;
    this.hook = null;
    if (Math.abs(this.vx) > 100) this.vx *= 1.06;
  }

  moveX(level, dx, game) {
    this.x += dx;
    const y0 = Math.floor(this.y / T), y1 = Math.floor((this.y + this.h - 0.01) / T);
    const c = dx > 0 ? Math.floor((this.x + this.w - 0.01) / T) : Math.floor(this.x / T);
    if (dx === 0) return;
    const fast = Math.abs(this.vx) > 270;
    let smashed = false;
    for (let r = y0; r <= y1; r++) {
      const t = level.get(c, r);
      if (t === EMPTY) continue;
      if (t === CRATE && fast) { game.breakCrate(c, r); smashed = true; continue; }
      this.x = dx > 0 ? c * T - this.w : (c + 1) * T;
      this.vx = 0;
      return;
    }
    if (smashed) { this.vx *= 0.45; game.shake(4); }
  }
  moveY(level, dy) {
    if (dy === 0) return false;
    this.y += dy;
    const x0 = Math.floor(this.x / T), x1 = Math.floor((this.x + this.w - 0.01) / T);
    const r = dy > 0 ? Math.floor((this.y + this.h - 0.01) / T) : Math.floor(this.y / T);
    for (let c = x0; c <= x1; c++) {
      if (level.get(c, r) === EMPTY) continue;
      if (dy > 0) { this.y = r * T - this.h; this.vy = 0; return true; }
      this.y = (r + 1) * T; this.vy = Math.max(this.vy, 0);
      return false;
    }
    return false;
  }

  update(dt, inp, level, game) {
    const ctrl = this.stun <= 0;
    const ix = ctrl ? inp.x : 0;
    const down = ctrl && inp.down;
    if (this.stun > 0) this.stun -= dt;
    if (this.turbo > 0) this.turbo -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.missT > 0) this.missT -= dt;
    const maxRun = RUN * (this.turbo > 0 ? 1.4 : 1);

    if (ctrl && inp.jumpP) this.jumpBuf = 0.12; else this.jumpBuf -= dt;
    this.coyote = this.onGround ? 0.1 : this.coyote - dt;

    // --- slide ---
    if (this.onGround && down && !this.sliding && !this.hook) {
      this.sliding = true;
      this.y += STAND_H - SLIDE_H; this.h = SLIDE_H;
      if (Math.abs(this.vx) > 150) { this.vx *= 1.1; game.sfx('slide'); }
    }
    if (this.sliding && (!down || !this.onGround)) this.tryStand(level);

    // --- horizontal movement ---
    if (this.hook) {
      this.vx += ix * 550 * dt;
    } else if (this.sliding) {
      if (this.onGround) this.vx = approach(this.vx, 0, 230 * dt);
      if (ix && Math.abs(this.vx) < CRAWL) this.vx = ix * CRAWL;
      if (this.vx) this.facing = Math.sign(this.vx);
    } else {
      const acc = (this.onGround ? 1800 : 1100) * (this.turbo > 0 ? 1.4 : 1);
      if (ix) {
        if (this.vx * ix < 0) this.vx += ix * (this.onGround ? 3200 : 1500) * dt;
        else if (Math.abs(this.vx) < maxRun) this.vx = ix > 0 ? Math.min(this.vx + acc * dt, maxRun) : Math.max(this.vx - acc * dt, -maxRun);
        else this.vx = approach(this.vx, ix * maxRun, (this.onGround ? 450 : 110) * dt);
        this.facing = ix;
      } else {
        this.vx = approach(this.vx, 0, (this.onGround ? 2200 : 260) * dt);
      }
    }

    // --- jumping ---
    if (this.jumpBuf > 0) {
      if (this.hook) {
        this.releaseHook();
        this.vy = Math.min(this.vy, -420);
        this.jumpBuf = 0;
        game.sfx('jump');
      } else if (this.onGround || this.coyote > 0) {
        if (this.tryStand(level)) {
          this.vy = -JUMP_V; this.onGround = false; this.coyote = 0; this.jumpBuf = 0;
          game.sfx('jump'); game.dust(this.cx, this.y + this.h, 5);
        }
      } else {
        const w = this.wallContact(level);
        if (w) {
          this.vx = -w * WJ_X; this.vy = -WJ_Y; this.facing = -w; this.jumpBuf = 0;
          game.sfx('wallJump'); game.dust(w > 0 ? this.x + this.w : this.x, this.cy, 4);
        }
      }
    }

    // --- gravity / wall slide ---
    this.vy += (this.vy < 0 && ctrl && inp.jump ? G_HOLD : G_FALL) * dt;
    this.wall = this.onGround ? 0 : this.wallContact(level);
    if (this.wall && ix === this.wall && this.vy > 140 && !this.hook) {
      this.vy = 140;
      if (Math.random() < 0.3) game.dust(this.wall > 0 ? this.x + this.w : this.x, this.y + 6, 1);
    }
    if (this.vy > MAX_FALL) this.vy = MAX_FALL;

    // --- grappling hook ---
    this.aim = this.hook ? null : game.findAnchor(this);
    if (ctrl && inp.hookP && !this.hook) {
      if (this.aim && this.tryStand(level)) {
        this.hook = this.aim;
        this.ropeLen = Math.max(ROPE_MIN, Math.hypot(this.cx - this.hook.x, this.cy - this.hook.y));
        game.sfx('hook');
      } else { this.missT = 0.15; game.sfx('miss'); }
    }
    if (this.hook && (!inp.hook || !ctrl)) this.releaseHook();

    // --- integrate with collisions (sub-stepped) ---
    const wasGround = this.onGround, fallSpeed = this.vy;
    this.onGround = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(this.vx), Math.abs(this.vy)) * dt / 6));
    for (let i = 0; i < steps; i++) {
      this.moveX(level, this.vx * dt / steps, game);
      if (this.moveY(level, this.vy * dt / steps)) this.onGround = true;
    }
    if (!this.onGround && this.vy >= 0 && this.hits(level, this.x, this.y + this.h, this.w, 1)) this.onGround = true;

    // rope constraint: keep within rope length, remove outward velocity
    if (this.hook) {
      this.ropeLen = Math.max(ROPE_MIN, this.ropeLen - 90 * dt);
      const dx = this.cx - this.hook.x, dy = this.cy - this.hook.y, d = Math.hypot(dx, dy);
      if (d > this.ropeLen) {
        const nx = dx / d, ny = dy / d;
        const tx = this.hook.x + nx * this.ropeLen - this.w / 2, ty = this.hook.y + ny * this.ropeLen - this.h / 2;
        this.moveX(level, tx - this.x, game);
        if (this.moveY(level, ty - this.y)) this.onGround = true;
        const vr = this.vx * nx + this.vy * ny;
        if (vr > 0) { this.vx -= vr * nx; this.vy -= vr * ny; }
      }
    }

    if (this.onGround && !wasGround && fallSpeed > 450) { game.dust(this.cx, this.y + this.h, 6); game.sfx('land'); }

    // boost pads
    if (this.onGround) {
      const r = Math.floor((this.y + this.h + 1) / T);
      const a = level.get(Math.floor(this.x / T), r), b = level.get(Math.floor((this.x + this.w - 0.01) / T), r);
      if ((a === BOOST || b === BOOST) && this.vx < BOOST_V) {
        this.vx = BOOST_V; this.facing = 1;
        game.sfx('boost'); game.sparks(this.cx, this.y + this.h, '#ffe14d', 10);
      }
    }

    if (this.onGround && !this.sliding) this.runPhase += Math.abs(this.vx) * dt * 0.045;
    else if (!this.onGround) this.runPhase += dt * 6;

    if (ctrl && inp.itemP && this.item) game.useItem(this);
  }
}
