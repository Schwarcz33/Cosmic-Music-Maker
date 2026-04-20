// Rain engine — synthesized. Pink noise bed + randomized droplet scheduler.
// Intensity scales from drizzle → downpour. Shelter toggle adds heavy LPF for "indoor" feel.

import { AudioEngine } from './audio-context.js';

export class RainEngine {
  constructor() {
    this.enabled = false;
    this.intensity = 0.5;      // 0 (drizzle) → 1 (downpour)
    this.shelter = 0;          // 0 (open) → 1 (indoors)
    this.volumeDb = -14;
    this.nodes = null;
    this._dropTimer = null;
    this._renderDuration = null;  // for offline render
  }

  setIntensity(v) {
    this.intensity = v;
    if (this.nodes) this._applyIntensity();
  }

  setShelter(v) {
    this.shelter = v;
    if (this.nodes) this._applyShelter();
  }

  setVolume(db) {
    this.volumeDb = db;
    if (this.nodes) {
      this.nodes.gain.gain.setTargetAtTime(AudioEngine.db2gain(db), this.nodes.ctx.currentTime, 0.1);
    }
  }

  _applyIntensity() {
    const { bedGain, bedBp } = this.nodes;
    // Intensity affects bed noise volume and filter cutoff
    const bedLevel = 0.1 + this.intensity * 0.5;
    const cutoff = 1500 + this.intensity * 5000;
    bedGain.gain.setTargetAtTime(bedLevel, this.nodes.ctx.currentTime, 0.2);
    bedBp.frequency.setTargetAtTime(cutoff, this.nodes.ctx.currentTime, 0.2);
  }

  _applyShelter() {
    const { shelterLpf } = this.nodes;
    // Shelter closes the low-pass filter → muffled "indoor" sound
    const cutoff = 22000 - this.shelter * 20000; // 22k → 2k
    shelterLpf.frequency.setTargetAtTime(cutoff, this.nodes.ctx.currentTime, 0.3);
  }

  // Generate pink noise buffer using Paul Kellet's algorithm
  _makePinkNoiseBuffer(ctx, seconds = 4) {
    const len = Math.floor(seconds * ctx.sampleRate);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
    return buf;
  }

  // Schedule a single droplet "tick" — very short resonant click
  _scheduleDrop(ctx, destination, when) {
    // Short white noise burst → resonant bandpass at droplet pitch
    const burstLen = 0.005 + Math.random() * 0.015;
    const bufLen = Math.ceil(burstLen * ctx.sampleRate);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    // Droplet pitch varies (water hitting different surfaces)
    bp.frequency.value = 1000 + Math.random() * 6000;
    bp.Q.value = 15 + Math.random() * 20;

    const env = ctx.createGain();
    env.gain.value = 0;

    const panner = ctx.createStereoPanner();
    panner.pan.value = (Math.random() - 0.5) * 1.6; // wide stereo field

    src.connect(bp).connect(env).connect(panner).connect(destination);

    // Tight envelope — quick attack, fast decay
    const peakGain = 0.15 + Math.random() * 0.35;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peakGain, when + 0.001);
    env.gain.exponentialRampToValueAtTime(0.001, when + burstLen + 0.05);

    src.start(when);
    src.stop(when + burstLen + 0.1);
  }

  // Droplet rate in drops/sec scales with intensity
  _dropRate() {
    return 8 + this.intensity * 100; // 8 (drizzle) → 108 (downpour)
  }

  _scheduleDrops(ctx, destination, startTime, endTime) {
    // Poisson-distributed drops across the time range
    const rate = this._dropRate();
    const duration = endTime - startTime;
    const count = Math.floor(duration * rate);
    for (let i = 0; i < count; i++) {
      const when = startTime + Math.random() * duration;
      this._scheduleDrop(ctx, destination, when);
    }
  }

  start(ctx, destination) {
    if (this.nodes) this.stop();

    // Continuous noise bed (loop a 4s pink noise buffer)
    const bedBuf = this._makePinkNoiseBuffer(ctx, 4);
    const bedSrc = ctx.createBufferSource();
    bedSrc.buffer = bedBuf;
    bedSrc.loop = true;

    const bedBp = ctx.createBiquadFilter();
    bedBp.type = 'bandpass';
    bedBp.frequency.value = 3000;
    bedBp.Q.value = 0.7;

    const bedGain = ctx.createGain();
    bedGain.gain.value = 0.3;

    // Shelter LPF
    const shelterLpf = ctx.createBiquadFilter();
    shelterLpf.type = 'lowpass';
    shelterLpf.frequency.value = 22000;
    shelterLpf.Q.value = 0.707;

    // Master engine gain
    const gain = ctx.createGain();
    gain.gain.value = 0;

    bedSrc.connect(bedBp).connect(bedGain).connect(shelterLpf).connect(gain);
    gain.connect(destination);

    bedSrc.start();
    const target = AudioEngine.db2gain(this.volumeDb);
    gain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.3);

    // Droplet output routes through the same shelter filter
    // We'll use a separate summing node so drops get shelter too
    const dropBus = ctx.createGain();
    dropBus.gain.value = 1.0;
    dropBus.connect(shelterLpf);

    this.nodes = { ctx, bedSrc, bedBp, bedGain, shelterLpf, dropBus, gain };
    this._applyIntensity();
    this._applyShelter();

    // Droplet scheduling
    if (this._renderDuration !== null) {
      // Offline: schedule ALL drops upfront
      this._scheduleDrops(ctx, dropBus, 0, this._renderDuration);
    } else {
      // Live: schedule in rolling 250ms windows (look-ahead scheduler)
      const scheduleWindow = 0.25;
      const tick = () => {
        if (!this.nodes) return;
        const now = ctx.currentTime;
        this._scheduleDrops(ctx, dropBus, now, now + scheduleWindow);
      };
      tick();
      this._dropTimer = setInterval(tick, scheduleWindow * 1000);
    }
  }

  stop() {
    if (!this.nodes) return;
    if (this._dropTimer) { clearInterval(this._dropTimer); this._dropTimer = null; }
    const { ctx, bedSrc, gain } = this.nodes;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
    try { bedSrc.stop(ctx.currentTime + 0.22); } catch (e) {}
    this.nodes = null;
  }

  cloneForRender(durationSec) {
    const clone = new RainEngine();
    clone.enabled = true;
    clone.intensity = this.intensity;
    clone.shelter = this.shelter;
    clone.volumeDb = this.volumeDb;
    clone._renderDuration = durationSec;
    return clone;
  }
}
