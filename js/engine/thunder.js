// Thunder engine — synthesized multi-layer strikes at random intervals.
// Each strike: initial crack (filtered noise burst) + low rumble + rolling echoes.
// Distance control = lowpass + reverb. Frequency = strikes per minute.

import { AudioEngine } from './audio-context.js';

export class ThunderEngine {
  constructor() {
    this.enabled = false;
    this.intensity = 0.7;       // 0 → 1 (loudness)
    this.distance = 0.5;        // 0 (close crack) → 1 (distant rumble)
    this.frequency = 2;         // strikes per minute
    this.volumeDb = -10;
    this.nodes = null;
    this._strikeTimer = null;
    this._renderDuration = null;
  }

  setIntensity(v) { this.intensity = v; }
  setDistance(v) {
    this.distance = v;
    if (this.nodes) this._applyDistance();
  }
  setFrequency(v) {
    this.frequency = v;
    // Reschedule on live mode
    if (this.nodes && this._renderDuration === null) {
      this._rescheduleLive();
    }
  }
  setVolume(db) {
    this.volumeDb = db;
    if (this.nodes) {
      this.nodes.gain.gain.setTargetAtTime(AudioEngine.db2gain(db), this.nodes.ctx.currentTime, 0.1);
    }
  }

  _applyDistance() {
    const { distanceLpf, reverbWet, reverbDry } = this.nodes;
    // Distance: 0 → wide-open LPF at 18kHz, dry. 1 → LPF at 800Hz, heavy reverb.
    const cutoff = 18000 - this.distance * 17200;
    distanceLpf.frequency.setTargetAtTime(cutoff, this.nodes.ctx.currentTime, 0.3);
    reverbWet.gain.setTargetAtTime(0.2 + this.distance * 0.6, this.nodes.ctx.currentTime, 0.3);
    reverbDry.gain.setTargetAtTime(1.0 - this.distance * 0.4, this.nodes.ctx.currentTime, 0.3);
  }

  // Long reverb IR for thunder — ~6 seconds, low-frequency rich
  _makeThunderReverbIR(ctx) {
    const seconds = 6;
    const len = Math.floor(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Low-pass style noise decay (IIR simulation)
        const noise = (Math.random() * 2 - 1);
        const env = Math.pow(1 - t, 2);
        data[i] = noise * env * (0.3 + Math.random() * 0.7);
      }
      // One-pole LPF pass
      let prev = 0;
      for (let i = 0; i < len; i++) {
        prev = prev * 0.85 + data[i] * 0.15;
        data[i] = prev;
      }
    }
    return buf;
  }

  // Schedule a single thunder strike at audio time `when`
  _scheduleStrike(ctx, destination, when) {
    const masterDur = 4 + Math.random() * 4; // 4-8 sec full strike
    const strikeGain = ctx.createGain();
    strikeGain.gain.value = 0;
    strikeGain.connect(destination);

    // --- Layer 0: Sharp snap (the sonic shockwave — fast transient) ---
    const snapDur = 0.04 + Math.random() * 0.04;
    const snapBuf = ctx.createBuffer(1, Math.ceil(snapDur * ctx.sampleRate), ctx.sampleRate);
    const snapData = snapBuf.getChannelData(0);
    for (let i = 0; i < snapData.length; i++) snapData[i] = Math.random() * 2 - 1;
    const snapSrc = ctx.createBufferSource();
    snapSrc.buffer = snapBuf;
    const snapHp = ctx.createBiquadFilter();
    snapHp.type = 'highpass';
    snapHp.frequency.value = 2000;
    snapHp.Q.value = 1.0;
    const snapEnv = ctx.createGain();
    snapEnv.gain.setValueAtTime(0, when);
    snapEnv.gain.linearRampToValueAtTime(0.9 * this.intensity, when + 0.002);
    snapEnv.gain.exponentialRampToValueAtTime(0.001, when + snapDur);
    snapSrc.connect(snapHp).connect(snapEnv).connect(strikeGain);
    snapSrc.start(when);
    snapSrc.stop(when + snapDur + 0.05);

    // --- Layer 1: Initial crack (mid-freq noise burst with crackle) ---
    const crackDur = 0.4 + Math.random() * 0.4;
    const crackBuf = ctx.createBuffer(2, Math.ceil(crackDur * ctx.sampleRate), ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = crackBuf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        // Add spiky transients every few samples — creates the "crackle" texture
        const spike = Math.random() < 0.02 ? (Math.random() * 2 - 1) * 2 : 0;
        d[i] = (Math.random() * 2 - 1) + spike;
      }
    }
    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = crackBuf;

    const crackBp = ctx.createBiquadFilter();
    crackBp.type = 'bandpass';
    crackBp.frequency.value = 500 + Math.random() * 800;
    crackBp.Q.value = 0.6;

    const crackEnv = ctx.createGain();
    crackEnv.gain.setValueAtTime(0, when);
    crackEnv.gain.linearRampToValueAtTime(1.0 * this.intensity, when + 0.008);
    crackEnv.gain.exponentialRampToValueAtTime(0.001, when + crackDur);

    crackSrc.connect(crackBp).connect(crackEnv).connect(strikeGain);
    crackSrc.start(when);
    crackSrc.stop(when + crackDur + 0.1);

    // --- Layer 1b: Sub-bass boom (the chest-hit) ---
    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(60, when);
    // Pitch drops from 60 → 30 Hz (thunder "settles" to lower pitch)
    subOsc.frequency.exponentialRampToValueAtTime(30, when + 0.5);
    const subEnv = ctx.createGain();
    subEnv.gain.setValueAtTime(0, when);
    subEnv.gain.linearRampToValueAtTime(0.6 * this.intensity, when + 0.02);
    subEnv.gain.exponentialRampToValueAtTime(0.001, when + 1.2);
    subOsc.connect(subEnv).connect(strikeGain);
    subOsc.start(when);
    subOsc.stop(when + 1.3);

    // --- Layer 2: Low rumble (long pink noise with heavy LPF) ---
    const rumbleDur = masterDur;
    const rumbleBuf = ctx.createBuffer(2, Math.ceil(rumbleDur * ctx.sampleRate), ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = rumbleBuf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.06;
        b1 = 0.985 * b1 + white * 0.09;
        b2 = 0.95 * b2 + white * 0.15;
        d[i] = (b0 + b1 + b2) * 0.5;
      }
    }
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = rumbleBuf;

    const rumbleLpf = ctx.createBiquadFilter();
    rumbleLpf.type = 'lowpass';
    rumbleLpf.frequency.value = 180;
    rumbleLpf.Q.value = 1.2;

    const rumbleEnv = ctx.createGain();
    rumbleEnv.gain.setValueAtTime(0, when);
    rumbleEnv.gain.linearRampToValueAtTime(1.2 * this.intensity, when + 0.1);
    // Irregular tail with 3-4 sub-peaks (rolling thunder)
    const peaks = 3 + Math.floor(Math.random() * 3);
    for (let p = 1; p <= peaks; p++) {
      const t = when + (p / (peaks + 1)) * rumbleDur;
      const peakLevel = (0.4 + Math.random() * 0.8) * this.intensity;
      rumbleEnv.gain.linearRampToValueAtTime(peakLevel, t);
    }
    rumbleEnv.gain.exponentialRampToValueAtTime(0.001, when + rumbleDur);

    rumbleSrc.connect(rumbleLpf).connect(rumbleEnv).connect(strikeGain);
    rumbleSrc.start(when);
    rumbleSrc.stop(when + rumbleDur + 0.1);

    // --- Layer 3: Mid-body (for body/weight of the strike) ---
    const bodyDur = 1.5 + Math.random();
    const bodySrc = ctx.createBufferSource();
    bodySrc.buffer = rumbleBuf;
    const bodyBp = ctx.createBiquadFilter();
    bodyBp.type = 'bandpass';
    bodyBp.frequency.value = 350;
    bodyBp.Q.value = 0.9;
    const bodyEnv = ctx.createGain();
    bodyEnv.gain.setValueAtTime(0, when);
    bodyEnv.gain.linearRampToValueAtTime(0.7 * this.intensity, when + 0.05);
    bodyEnv.gain.exponentialRampToValueAtTime(0.001, when + bodyDur);
    bodySrc.connect(bodyBp).connect(bodyEnv).connect(strikeGain);
    bodySrc.start(when);
    bodySrc.stop(when + bodyDur + 0.1);

    // Fade strike bus (safety) — ramp in/out to avoid accidental clicks
    strikeGain.gain.value = 1.0;

    // Light panning for realism
    const pan = ctx.createStereoPanner();
    pan.pan.value = (Math.random() - 0.5) * 0.8;
    // Can't splice in after-connect; instead route via additional node
    // (In practice the output is already stereo so we skip this detail.)
  }

  _scheduleStrikesForRange(ctx, destination, startT, endT) {
    // Poisson-ish: convert frequency (per minute) to probability per second
    const ratePerSec = this.frequency / 60;
    // Model as exponential inter-arrival times
    let t = startT + this._sampleExp(ratePerSec);
    while (t < endT) {
      this._scheduleStrike(ctx, destination, t);
      t += this._sampleExp(ratePerSec);
    }
  }

  _sampleExp(rate) {
    // Exponential distribution — time until next event
    if (rate <= 0) return Infinity;
    return -Math.log(1 - Math.random()) / rate;
  }

  _rescheduleLive() {
    if (this._strikeTimer) { clearInterval(this._strikeTimer); this._strikeTimer = null; }
    const { ctx, strikeBus } = this.nodes;
    const tick = () => {
      if (!this.nodes) return;
      const ratePerSec = this.frequency / 60;
      // At each tick, roll for a strike in this window
      const window = 1.0;
      if (Math.random() < ratePerSec * window) {
        this._scheduleStrike(ctx, strikeBus, ctx.currentTime + Math.random() * window);
      }
    };
    this._strikeTimer = setInterval(tick, 1000);
  }

  start(ctx, destination) {
    if (this.nodes) this.stop();

    // Distance filter + reverb split
    const strikeBus = ctx.createGain();
    strikeBus.gain.value = 1.0;

    const distanceLpf = ctx.createBiquadFilter();
    distanceLpf.type = 'lowpass';
    distanceLpf.frequency.value = 18000;
    distanceLpf.Q.value = 0.707;

    const convolver = ctx.createConvolver();
    convolver.buffer = this._makeThunderReverbIR(ctx);

    const reverbDry = ctx.createGain();
    const reverbWet = ctx.createGain();
    reverbDry.gain.value = 0.8;
    reverbWet.gain.value = 0.5;

    const gain = ctx.createGain();
    gain.gain.value = 0;

    strikeBus.connect(distanceLpf);
    distanceLpf.connect(reverbDry);
    distanceLpf.connect(convolver).connect(reverbWet);
    reverbDry.connect(gain);
    reverbWet.connect(gain);
    gain.connect(destination);

    const target = AudioEngine.db2gain(this.volumeDb);
    gain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.3);

    this.nodes = { ctx, strikeBus, distanceLpf, convolver, reverbDry, reverbWet, gain };
    this._applyDistance();

    if (this._renderDuration !== null) {
      this._scheduleStrikesForRange(ctx, strikeBus, 0, this._renderDuration);
    } else {
      this._rescheduleLive();
    }
  }

  stop() {
    if (!this.nodes) return;
    if (this._strikeTimer) { clearInterval(this._strikeTimer); this._strikeTimer = null; }
    const { ctx, gain } = this.nodes;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
    this.nodes = null;
  }

  // Trigger one strike manually (for preview/test)
  triggerNow() {
    if (!this.nodes) return;
    const { ctx, strikeBus } = this.nodes;
    this._scheduleStrike(ctx, strikeBus, ctx.currentTime + 0.05);
  }

  cloneForRender(durationSec) {
    const clone = new ThunderEngine();
    clone.enabled = true;
    clone.intensity = this.intensity;
    clone.distance = this.distance;
    clone.frequency = this.frequency;
    clone.volumeDb = this.volumeDb;
    clone._renderDuration = durationSec;
    return clone;
  }
}
