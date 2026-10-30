'use strict';
// Tiny synth for sound effects and a looping chiptune beat. No audio files needed.
class Sfx {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.musicPlaying = false;
    this.step = 0;
    this.nextTime = 0;
  }
  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.35;
        this.musicGain.connect(this.master);
        const len = this.ctx.sampleRate * 0.5;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.ctx = null; return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  ok() { return this.ctx && this.ctx.state === 'running'; }

  tone(freq, dur, type = 'square', vol = 0.15, slideTo = null, delay = 0, dest = null) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol = 0.2, freq = 1200, delay = 0, dest = null) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  jump()   { this.tone(380, 0.12, 'square', 0.08, 760); }
  wallJump() { this.tone(520, 0.12, 'square', 0.08, 980); }
  land()   { this.noise(0.06, 0.12, 500); }
  slide()  { this.noise(0.25, 0.08, 2500); }
  hook()   { this.tone(1400, 0.08, 'sawtooth', 0.06, 500); this.noise(0.05, 0.1, 4000); }
  miss()   { this.tone(300, 0.06, 'triangle', 0.05, 200); }
  boost()  { this.tone(300, 0.25, 'sawtooth', 0.07, 1500); }
  pickup() { [660, 880, 1320].forEach((f, i) => this.tone(f, 0.08, 'square', 0.07, null, i * 0.05)); }
  bolt()   { this.tone(1600, 0.3, 'sawtooth', 0.07, 300); }
  zap()    { this.noise(0.4, 0.25, 3000); this.tone(120, 0.4, 'square', 0.12, 60); }
  crate()  { this.tone(200, 0.1, 'square', 0.1, 120); }
  smash()  { this.noise(0.3, 0.3, 700); }
  turbo()  { this.tone(200, 0.5, 'sawtooth', 0.08, 900); }
  beep(hi) { this.tone(hi ? 880 : 440, hi ? 0.4 : 0.18, 'square', 0.12); }
  elim()   { this.noise(0.7, 0.35, 400); this.tone(400, 0.7, 'sawtooth', 0.15, 40); }
  win()    { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'square', 0.09, null, i * 0.12)); }
  menu()   { this.tone(700, 0.05, 'square', 0.06); }

  // ---- music: simple 16-step sequencer scheduled ahead of time ----
  updateMusic(playing) {
    this.musicPlaying = playing && this.musicOn;
    if (!this.ok() || !this.musicPlaying) { if (this.ctx) this.nextTime = this.ctx.currentTime; return; }
    const stepDur = 60 / 150 / 4;
    if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.05;
    const bass = [45, 45, 57, 45, 45, 55, 45, 52, 43, 43, 55, 43, 41, 41, 53, 48];
    const lead = [0, 69, 0, 72, 0, 76, 0, 72, 0, 67, 0, 71, 0, 72, 74, 0];
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      const s = this.step % 16, bar = Math.floor(this.step / 16) % 4, dly = this.nextTime - this.ctx.currentTime;
      const tr = bar === 3 ? 2 : 0;
      const hz = n => 440 * Math.pow(2, (n - 69) / 12);
      this.tone(hz(bass[s] + tr), stepDur * 0.9, 'sawtooth', 0.07, null, dly, this.musicGain);
      if (s % 4 === 0) this.tone(150, 0.12, 'sine', 0.35, 40, dly, this.musicGain);
      if (s % 2 === 1) this.noise(0.03, 0.06, 8000, dly, this.musicGain);
      if (s % 8 === 4) this.noise(0.12, 0.12, 1800, dly, this.musicGain);
      if (bar >= 2 && lead[s]) this.tone(hz(lead[s] + tr), stepDur * 1.5, 'square', 0.03, null, dly, this.musicGain);
      this.nextTime += stepDur;
      this.step++;
    }
  }
}
