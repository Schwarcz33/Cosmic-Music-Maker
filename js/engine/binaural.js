// Binaural beats — two sine oscillators routed hard-L and hard-R
// Brain perceives the frequency difference as a "beat" (brainwave entrainment)

import { AudioEngine } from './audio-context.js';

export class BinauralEngine {
  constructor() {
    this.enabled = false;
    this.carrier = 200;        // Hz
    this.beat = 8;             // Hz (alpha)
    this.volumeDb = -12;
    this.nodes = null;
  }

  setCarrier(hz) {
    this.carrier = hz;
    if (this.nodes) {
      this.nodes.oscL.frequency.setTargetAtTime(hz, this.nodes.ctx.currentTime, 0.05);
      this.nodes.oscR.frequency.setTargetAtTime(hz + this.beat, this.nodes.ctx.currentTime, 0.05);
    }
  }

  setBeat(hz) {
    this.beat = hz;
    if (this.nodes) {
      this.nodes.oscR.frequency.setTargetAtTime(this.carrier + hz, this.nodes.ctx.currentTime, 0.05);
    }
  }

  setVolume(db) {
    this.volumeDb = db;
    if (this.nodes) {
      this.nodes.gain.gain.setTargetAtTime(AudioEngine.db2gain(db), this.nodes.ctx.currentTime, 0.05);
    }
  }

  start(ctx, destination) {
    if (this.nodes) this.stop();

    const oscL = ctx.createOscillator();
    const oscR = ctx.createOscillator();
    oscL.type = 'sine';
    oscR.type = 'sine';
    oscL.frequency.value = this.carrier;
    oscR.frequency.value = this.carrier + this.beat;

    // Hard pan L and R via ChannelMerger
    const gainL = ctx.createGain();
    const gainR = ctx.createGain();
    gainL.gain.value = 1;
    gainR.gain.value = 1;

    const merger = ctx.createChannelMerger(2);
    oscL.connect(gainL).connect(merger, 0, 0);
    oscR.connect(gainR).connect(merger, 0, 1);

    // Master volume for this engine (fade-in to avoid click)
    const gain = ctx.createGain();
    gain.gain.value = 0;
    merger.connect(gain).connect(destination);

    oscL.start();
    oscR.start();

    // Fade in over 100ms
    const target = AudioEngine.db2gain(this.volumeDb);
    gain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.1);

    this.nodes = { ctx, oscL, oscR, gainL, gainR, merger, gain };
  }

  stop() {
    if (!this.nodes) return;
    const { ctx, oscL, oscR, gain } = this.nodes;
    // Fade out 50ms to avoid click
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
    oscL.stop(ctx.currentTime + 0.06);
    oscR.stop(ctx.currentTime + 0.06);
    this.nodes = null;
  }

  cloneForRender() {
    const clone = new BinauralEngine();
    clone.enabled = true;
    clone.carrier = this.carrier;
    clone.beat = this.beat;
    clone.volumeDb = this.volumeDb;
    return clone;
  }
}

export function beatBandLabel(hz) {
  if (hz < 4) return `${hz.toFixed(1)} Hz (Delta)`;
  if (hz < 8) return `${hz.toFixed(1)} Hz (Theta)`;
  if (hz < 13) return `${hz.toFixed(1)} Hz (Alpha)`;
  if (hz < 30) return `${hz.toFixed(1)} Hz (Beta)`;
  return `${hz.toFixed(1)} Hz (Gamma)`;
}
