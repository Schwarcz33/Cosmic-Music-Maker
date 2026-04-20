// Solfeggio frequency generator — fundamental + optional harmonic stack + breath LFO + reverb

import { AudioEngine } from './audio-context.js';

export class SolfeggioEngine {
  constructor() {
    this.enabled = false;
    this.frequency = 528;
    this.harmonics = 'octave';  // pure | octave | fifth | rich
    this.lfoRate = 0.1;         // Hz — breath-like amplitude modulation
    this.reverbMix = 0.6;       // 0-1
    this.volumeDb = -10;
    this.nodes = null;
  }

  setFrequency(hz) {
    this.frequency = hz;
    if (this.nodes) this._rebuildOscillators();
  }

  setHarmonics(mode) {
    this.harmonics = mode;
    if (this.nodes) this._rebuildOscillators();
  }

  setLfoRate(hz) {
    this.lfoRate = hz;
    if (this.nodes) {
      this.nodes.lfo.frequency.setTargetAtTime(hz, this.nodes.ctx.currentTime, 0.1);
    }
  }

  setReverbMix(mix) {
    this.reverbMix = mix;
    if (this.nodes) {
      this.nodes.wetGain.gain.setTargetAtTime(mix, this.nodes.ctx.currentTime, 0.1);
      this.nodes.dryGain.gain.setTargetAtTime(1 - mix * 0.5, this.nodes.ctx.currentTime, 0.1);
    }
  }

  setVolume(db) {
    this.volumeDb = db;
    if (this.nodes) {
      this.nodes.gain.gain.setTargetAtTime(AudioEngine.db2gain(db), this.nodes.ctx.currentTime, 0.05);
    }
  }

  _harmonicRatios() {
    switch (this.harmonics) {
      case 'pure':   return [1];
      case 'octave': return [1, 2];
      case 'fifth':  return [1, 2, 3];  // root, octave, octave+5th (3x = 12th)
      case 'rich':   return [1, 2, 3, 4, 5];
      default:       return [1];
    }
  }

  _harmonicGains() {
    // Each harmonic softer than the last (1/n)
    const ratios = this._harmonicRatios();
    return ratios.map((r, i) => 1 / (i + 1));
  }

  _rebuildOscillators() {
    if (!this.nodes) return;
    const { ctx, oscs, mixer } = this.nodes;

    // Stop and disconnect old oscs
    oscs.forEach((o) => {
      try { o.osc.stop(); } catch (e) {}
      try { o.osc.disconnect(); o.gain.disconnect(); } catch (e) {}
    });
    this.nodes.oscs = [];

    // Build new stack
    const ratios = this._harmonicRatios();
    const gains = this._harmonicGains();
    ratios.forEach((r, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = this.frequency * r;
      // tiny detune on upper harmonics for warmth
      osc.detune.value = i > 0 ? (Math.random() - 0.5) * 6 : 0;
      const oscGain = ctx.createGain();
      oscGain.gain.value = gains[i];
      osc.connect(oscGain).connect(mixer);
      osc.start();
      this.nodes.oscs.push({ osc, gain: oscGain });
    });
  }

  // Simple IR — exponentially decaying noise, ~4s, generates a smooth reverb
  _makeReverbIR(ctx, seconds = 4) {
    const rate = ctx.sampleRate;
    const len = Math.floor(seconds * rate);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // Exponential decay, colored noise (slight low-pass via averaging)
        const noise = (Math.random() * 2 - 1);
        data[i] = noise * Math.pow(1 - t, 2.5);
      }
    }
    return buf;
  }

  start(ctx, destination) {
    if (this.nodes) this.stop();

    // Mixer for harmonics
    const mixer = ctx.createGain();
    mixer.gain.value = 1.0;

    // LFO → amplitude modulation for "breathing"
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = this.lfoRate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.25; // modulation depth
    lfo.connect(lfoGain);

    const amMod = ctx.createGain();
    amMod.gain.value = 0.75; // base level (depth=0.25 → 0.5 to 1.0)
    lfoGain.connect(amMod.gain);
    mixer.connect(amMod);

    // Convolution reverb
    const convolver = ctx.createConvolver();
    convolver.buffer = this._makeReverbIR(ctx, 4);

    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    dryGain.gain.value = 1 - this.reverbMix * 0.5;
    wetGain.gain.value = this.reverbMix;

    amMod.connect(dryGain);
    amMod.connect(convolver).connect(wetGain);

    // Engine master volume (fade-in)
    const gain = ctx.createGain();
    gain.gain.value = 0;
    dryGain.connect(gain);
    wetGain.connect(gain);
    gain.connect(destination);

    lfo.start();
    const target = AudioEngine.db2gain(this.volumeDb);
    gain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.2);

    this.nodes = { ctx, oscs: [], mixer, lfo, lfoGain, amMod, convolver, dryGain, wetGain, gain };
    this._rebuildOscillators();
  }

  stop() {
    if (!this.nodes) return;
    const { ctx, oscs, lfo, gain } = this.nodes;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
    oscs.forEach((o) => { try { o.osc.stop(ctx.currentTime + 0.12); } catch (e) {} });
    try { lfo.stop(ctx.currentTime + 0.12); } catch (e) {}
    this.nodes = null;
  }

  cloneForRender() {
    const clone = new SolfeggioEngine();
    clone.enabled = true;
    clone.frequency = this.frequency;
    clone.harmonics = this.harmonics;
    clone.lfoRate = this.lfoRate;
    clone.reverbMix = this.reverbMix;
    clone.volumeDb = this.volumeDb;
    return clone;
  }
}
