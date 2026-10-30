'use strict';
// Unified input: every gamepad and two keyboard layouts are "sources".
// Each source produces the same simple state object every frame.
const KB_LAYOUTS = [
  { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], jump: ['Space', 'KeyW'],
    hook: ['KeyF'], item: ['KeyG'], slide: [], start: ['Enter'], back: ['Escape', 'Backspace'] },
  { left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'], jump: ['ArrowUp', 'KeyK'],
    hook: ['KeyL'], item: ['KeyJ'], slide: [], start: ['Enter'], back: ['Escape', 'Backspace'] },
];
const SOURCE_LABEL = { kb0: 'Keyboard (WASD)', kb1: 'Keyboard (Arrows)' };

class Input {
  constructor() {
    this.keys = new Set();
    this.tapped = new Set(); // keys pressed since last poll (so very quick taps still register)
    this.cur = {};
    this.prev = {};
    this.pads = {};
    this.onActivity = null;
    addEventListener('keydown', e => {
      this.keys.add(e.code); this.tapped.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(e.code)) e.preventDefault();
      if (this.onActivity) this.onActivity();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }
  poll() {
    this.prev = this.cur;
    this.cur = {};
    this.pads = {};
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const id = 'pad' + p.index;
      this.pads[id] = p;
      this.cur[id] = this.readPad(p);
    }
    KB_LAYOUTS.forEach((l, i) => { this.cur['kb' + i] = this.readKb(l); });
    this.tapped.clear();
  }
  readPad(p) {
    const b = i => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4));
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const left = ax < -0.4 || b(14), right = ax > 0.4 || b(15);
    const s = {
      x: left && !right ? -1 : right && !left ? 1 : 0,
      left, right,
      up: ay < -0.55 || b(12),
      down: ay > 0.55 || b(13),
      jump: b(0),                        // Cross / A
      slide: b(1),                       // Circle / B
      item: b(2) || b(3),                // Square / Triangle
      hook: b(4) || b(5) || b(6) || b(7),// L1 R1 L2 R2
      start: b(9),                       // Options / Start
      back: b(1) || b(8),                // Circle / Share
    };
    s.any = s.jump || s.slide || s.item || s.hook || s.start || b(8);
    return s;
  }
  readKb(l) {
    const k = list => list.some(c => this.keys.has(c) || this.tapped.has(c));
    const left = k(l.left), right = k(l.right);
    return {
      x: left && !right ? -1 : right && !left ? 1 : 0, left, right,
      up: k(l.up), down: k(l.down), jump: k(l.jump), slide: k(l.slide), item: k(l.item),
      hook: k(l.hook), start: k(l.start), back: k(l.back),
      any: k(l.jump) || k(l.item) || k(l.hook),
    };
  }
  state(id) { return this.cur[id] || Input.NONE; }
  pressed(id, btn) { const c = this.cur[id], p = this.prev[id]; return !!(c && c[btn] && !(p && p[btn])); }
  sources() { return Object.keys(this.cur); }
  connected(id) { return id.startsWith('kb') || !!this.pads[id]; }
  label(id) {
    if (SOURCE_LABEL[id]) return SOURCE_LABEL[id];
    const p = this.pads[id];
    if (!p) return 'Disconnected';
    let n = p.id.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
    if (/054c|sony|wireless controller|dualshock/i.test(p.id)) n = 'PS4 Controller';
    else if (/xinput|xbox/i.test(p.id)) n = 'Controller';
    return n.slice(0, 22) + ' #' + (p.index + 1);
  }
  rumble(id, strong, weak, ms) {
    const p = this.pads[id];
    try {
      if (p && p.vibrationActuator) p.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak });
    } catch (e) { /* ignore */ }
  }
}
Input.NONE = { x: 0, left: false, right: false, up: false, down: false, jump: false, slide: false, item: false, hook: false, start: false, back: false, any: false };
