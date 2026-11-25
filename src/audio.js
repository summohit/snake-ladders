export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  ensureContext() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  setMuted(muted) {
    this.muted = muted;
  }

  tone(freq, duration = 0.14, type = 'sine', gainPeak = 0.14, delay = 0) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playDiceRoll() {
    for (let i = 0; i < 6; i++) {
      this.tone(240 + Math.random() * 260, 0.055, 'triangle', 0.09, i * 0.06);
    }
  }

  playHop(stepIdx = 0) {
    this.tone(420 + stepIdx * 42, 0.09, 'sine', 0.12);
  }

  playSixBonus() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, 0.16, 'triangle', 0.13, i * 0.055);
    });
  }

  playLadderClimb() {
    // Ascending magical harp arpeggio
    const notes = [392, 440, 493.88, 587.33, 659.25, 783.99, 987.77, 1174.66];
    notes.forEach((f, i) => {
      this.tone(f, 0.2, 'sine', 0.12, i * 0.085);
    });
  }

  playSnakeJumpScare() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. High-pitched fierce serpent HISS (bandpass-filtered white noise)
    const bufferSize = Math.floor(ctx.sampleRate * 0.48);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3400, now);
    filter.frequency.exponentialRampToValueAtTime(1600, now + 0.45);
    filter.Q.value = 2.6;

    const hissGain = ctx.createGain();
    hissGain.gain.setValueAtTime(0.001, now);
    hissGain.gain.exponentialRampToValueAtTime(0.24, now + 0.08);
    hissGain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);

    noise.connect(filter);
    filter.connect(hissGain);
    hissGain.connect(ctx.destination);
    noise.start(now);

    // 2. Sudden bass impact SLAM + jaw CHOMP at t + 0.24s
    const chompTime = now + 0.24;
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(145, chompTime);
    sub.frequency.exponentialRampToValueAtTime(36, chompTime + 0.26);
    subGain.gain.setValueAtTime(0.001, chompTime);
    subGain.gain.exponentialRampToValueAtTime(0.32, chompTime + 0.015);
    subGain.gain.exponentialRampToValueAtTime(0.001, chompTime + 0.28);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(chompTime);
    sub.stop(chompTime + 0.3);

    // Sharp fang snap
    const snap = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snap.type = 'sawtooth';
    snap.frequency.setValueAtTime(880, chompTime);
    snap.frequency.exponentialRampToValueAtTime(160, chompTime + 0.09);
    snapGain.gain.setValueAtTime(0.001, chompTime);
    snapGain.gain.exponentialRampToValueAtTime(0.2, chompTime + 0.01);
    snapGain.gain.exponentialRampToValueAtTime(0.001, chompTime + 0.1);
    snap.connect(snapGain);
    snapGain.connect(ctx.destination);
    snap.start(chompTime);
    snap.stop(chompTime + 0.12);
  }

  playSnakeBite() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Descending slide whistle + hiss
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.95);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.11, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.02);
  }

  playTripleSix() {
    this.tone(220, 0.18, 'sawtooth', 0.12, 0);
    this.tone(165, 0.26, 'sawtooth', 0.12, 0.16);
  }

  playEmojiPop() {
    this.tone(620, 0.08, 'sine', 0.09, 0);
    this.tone(920, 0.1, 'sine', 0.08, 0.06);
  }

  playWin() {
    const fanfare = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    fanfare.forEach((f, i) => {
      this.tone(f, i === fanfare.length - 1 ? 0.55 : 0.18, 'triangle', 0.15, i * 0.11);
    });
  }
}
